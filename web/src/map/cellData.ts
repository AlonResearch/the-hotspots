/**
 * Which files feed the cell layer and how to read them for one month (plan 8.2).
 * Res 3 and 4: one overview file. Res 5: one file per res 0 part in view.
 * Res 6: the detail tiles in view, read at the month (no request when cached).
 */
import { cellToLatLng, cellToParent } from 'h3-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DetailIndex, Manifest, MethodDaily, Overview } from '../data/contract';
import { isAbort, loader } from '../data/loader';
import { monthLabel, monthToIndex } from '../data/months';
import { dayMasks, entryAt } from '../data/tile';
import { dailyUsable, daysFromPairs, splitMonth } from '../stats/daily';
import type { Res } from '../grid/ladder';
import { bboxCells, type BBox } from '../grid/viewport';
import { useApp } from '../state/store';

export const MAX_DETAIL_TILES = 60;

export interface CellRow {
  cell: string;
  h: number;
  modis: number;
  viirs: number;
  /** Harmonized value per UTC day of the month (plan 4.6), only where the build has daily fields. */
  days?: Float64Array;
}

export interface FilePlan {
  /** The resolution that will be drawn (5 when res 6 has no detail in view). */
  res: Res;
  kind: 'overview' | 'r5' | 'detail';
  ids: string[];
  /** Res 6 was asked for and no detail tile covers the view. */
  detailMissing: boolean;
  key: string;
}

export function planFiles(
  res: Res,
  bbox: BBox | null,
  manifest: Manifest,
  index: DetailIndex | null,
): FilePlan {
  if (res === 3 || res === 4) {
    return { res, kind: 'overview', ids: [], detailMissing: false, key: `r${res}` };
  }
  const r5 = (detailMissing: boolean): FilePlan => {
    const parts = bbox ? bboxCells(bbox, 0) : [];
    const allowed = new Set(manifest.overview.r5_parts);
    const ids = [...new Set(parts.map((c) => cellToParent(c, 0)))]
      .filter((p) => allowed.has(p))
      .sort();
    return { res: 5, kind: 'r5', ids, detailMissing, key: `r5:${ids.join(',')}:${detailMissing}` };
  };
  if (res === 5) return r5(false);
  const tileRes = manifest.detail.tile_res;
  const listed = new Set(index?.tiles ?? []);
  const inView = bbox ? bboxCells(bbox, tileRes) : [];
  const ids = [...new Set(inView.map((c) => cellToParent(c, tileRes)))]
    .filter((p) => listed.has(p))
    .sort();
  if (ids.length === 0) return r5(true);
  if (ids.length > MAX_DETAIL_TILES) return r5(false);
  return { res: 6, kind: 'detail', ids, detailMissing: false, key: `r6:${ids.join(',')}` };
}

function overviewRows(o: Overview, out: CellRow[], daily: boolean): void {
  const first = out.length;
  for (let i = 0; i < o.cell.length; i++) {
    out.push({ cell: o.cell[i]!, h: o.h[i]!, modis: o.modis[i]!, viirs: o.viirs[i]! });
  }
  if (!daily || !o.daily) return;
  o.daily.idx.forEach((i, k) => {
    const row = out[first + i];
    if (row) row.days = daysFromPairs(o.daily!.d[k]!, o.month);
  });
}

export async function loadRows(
  plan: FilePlan,
  month: string,
  manifest: Manifest,
  signal?: AbortSignal,
  method?: MethodDaily | null,
): Promise<CellRow[]> {
  const rows: CellRow[] = [];
  const daily = dailyUsable(manifest, method);
  if (plan.kind === 'overview') {
    overviewRows(await loader.overview(plan.res as 3 | 4, month, signal), rows, daily);
  } else if (plan.kind === 'r5') {
    const files = await Promise.all(plan.ids.map((p) => loader.overviewR5(p, month, signal)));
    for (const f of files) overviewRows(f, rows, daily);
  } else {
    const ref = manifest.first_reference_month;
    const weights = daily && month >= ref ? method!.viirs_weights[month] : undefined;
    const tiles = await Promise.all(plan.ids.map((p) => loader.tile(p, signal)));
    const t = monthToIndex(manifest.record.start, month);
    for (const tile of tiles) {
      for (let k = 0; k < tile.cells.length; k++) {
        const i = entryAt(tile, k, t);
        if (i < 0) continue;
        const row: CellRow = {
          cell: tile.cells[k]!,
          h: tile.h[i]!,
          modis: tile.modis[i]!,
          viirs: tile.viirs[i]!,
        };
        const masks = daily ? dayMasks(tile, i) : null;
        if (masks && (month < ref || weights)) {
          const days = splitMonth(row.h, masks, month, ref, weights);
          if (days) row.days = days;
        }
        rows.push(row);
      }
    }
  }
  return rows;
}

export interface CellFrame {
  plan: FilePlan;
  month: string;
  rows: CellRow[];
}

/** Rows for the current resolution, month and view. The previous frame stays until the next is ready. */
export function useCellFrame(bbox: BBox | null): CellFrame | null {
  const res = useApp((s) => s.res);
  const month = useApp((s) => s.month);
  const data = useApp((s) => s.data);
  const [frame, setFrame] = useState<CellFrame | null>(null);
  const failed = useRef<string | null>(null);

  // Res 3 and 4 do not depend on the view. The caller keeps bbox stable (rounded).
  const viewBox = res >= 5 ? bbox : null;
  const plan = useMemo(
    () => (data ? planFiles(res, viewBox, data.manifest, data.index) : null),
    [res, data, viewBox],
  );

  useEffect(() => {
    if (!plan || !data || !month) return;
    const controller = new AbortController();
    const { setMapBusy, notify } = useApp.getState();
    setMapBusy(true);
    loadRows(plan, month, data.manifest, controller.signal, data.method?.daily).then(
      (rows) => {
        if (controller.signal.aborted) return;
        failed.current = null;
        setFrame({ plan, month, rows });
        setMapBusy(false);
      },
      (e: unknown) => {
        if (isAbort(e) || controller.signal.aborted) return;
        setMapBusy(false);
        const tag = `${plan.key}|${month}`;
        if (failed.current !== tag) notify(`Could not load ${monthLabel(month)}`, 'error');
        failed.current = tag;
      },
    );
    return () => {
      controller.abort();
      useApp.getState().setMapBusy(false);
    };
  }, [plan, month, data]);

  return frame;
}

/** Rounds a bbox so tiny moves do not change the file plan. Returns the same object when equal. */
export function roundBBox(b: BBox, prev: BBox | null): BBox {
  const r = (x: number) => Math.round(x * 20) / 20;
  const next = { west: r(b.west), south: r(b.south), east: r(b.east), north: r(b.north) };
  if (
    prev &&
    prev.west === next.west &&
    prev.south === next.south &&
    prev.east === next.east &&
    prev.north === next.north
  ) {
    return prev;
  }
  return next;
}

function inView(lat: number, lon: number, b: BBox): boolean {
  if (lat < b.south || lat > b.north) return false;
  let x = lon;
  while (x < b.west) x += 360;
  return x <= b.east;
}

/**
 * Day mode can be offered when every active cell in view carries daily values, and there is at
 * least one (plan 4.6: in practice, zoomed on the daily area). A view that reaches past the area
 * gets monthly playback only.
 */
export function viewHasDaily(rows: readonly CellRow[], bbox: BBox): boolean {
  if (!rows.some((r) => r.days)) return false;
  let any = false;
  for (const r of rows) {
    if (!(r.h > 0)) continue;
    const [lat, lon] = cellToLatLng(r.cell);
    if (!inView(lat, lon, bbox)) continue;
    if (!r.days) return false;
    any = true;
  }
  return any;
}

/** The rows as a running total through a UTC day: the month building up, on the monthly scale. */
export function throughDay(rows: readonly CellRow[], day: number): CellRow[] {
  return rows.map((r) => {
    let h = 0;
    if (r.days) for (let d = 0; d < Math.min(day, r.days.length); d++) h += r.days[d]!;
    return { ...r, h, viirs: h, modis: 0 };
  });
}
