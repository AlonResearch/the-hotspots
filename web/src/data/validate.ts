/**
 * Checks a whole data folder against the contract (plan 4.5): every file against
 * its schema, plus the cross-file rules (sums, the reference rule, ids).
 * Pure apart from the injected reader, so the CLI and the fixture generator share it.
 */
import { cellToParent, getResolution, isValidCell } from 'h3-js';
import type { z } from 'zod';
import {
  DetailIndex,
  DetailTile,
  Manifest,
  MethodTables,
  Overview,
  Places,
  Summary,
  formatIssues,
  paths,
} from './contract';
import { daysInMonth, monthCount, recordMonths } from './months';
import { cellInDailyArea, daysWithData } from '../stats/daily';

/** Number of set bits in a 31-bit mask. */
function popcount(x: number): number {
  let n = 0;
  for (let v = x >>> 0; v; v &= v - 1) n++;
  return n;
}

/** Returns the parsed JSON of a file, or undefined when the file does not exist. */
export type JsonReader = (path: string) => Promise<unknown>;

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  filesChecked: number;
}

const MAX_ERRORS = 60;
const VALUE_KEYS = ['h', 'lo', 'hi', 'modis', 'viirs'] as const;
type ValueKey = (typeof VALUE_KEYS)[number];
type Sums = Record<ValueKey, number> & { n: number };

export async function validateDataFolder(read: JsonReader): Promise<ValidationReport> {
  const errors: string[] = [];
  let filesChecked = 0;
  const err = (msg: string) => {
    if (errors.length < MAX_ERRORS) errors.push(msg);
  };

  async function load<T>(path: string, schema: z.ZodType<T>, optional = false): Promise<T | null> {
    let raw: unknown;
    try {
      raw = await read(path);
    } catch (e) {
      err(`${path}: cannot read (${(e as Error).message})`);
      return null;
    }
    if (raw === undefined) {
      if (!optional) err(`${path}: missing`);
      return null;
    }
    filesChecked++;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      err(`${path}:\n${formatIssues(parsed.error)}`);
      return null;
    }
    return parsed.data;
  }

  const manifest = await load(paths.manifest, Manifest);
  if (!manifest) return { ok: false, errors, filesChecked };
  const months = recordMonths(manifest);
  const nMonths = monthCount(manifest.record.start, manifest.record.end);
  const ref = manifest.first_reference_month;

  function checkReferenceRule(
    file: string,
    month: string,
    v: Record<ValueKey, number>,
    where: string,
  ) {
    if (month < ref) return;
    const ok = Math.abs(v.h - v.viirs) < 1e-6 && v.lo === v.h && v.hi === v.h;
    if (!ok) err(`${file}: ${where} in ${month} breaks rule 3 (h = lo = hi = viirs from ${ref})`);
  }

  await load(paths.places, Places);
  const method = await load(paths.method, MethodTables, true);
  const dailyAreas = manifest.daily?.areas ?? null;
  if (dailyAreas && !method?.daily) {
    err(`${paths.method}: manifest.daily is set but method.json has no "daily" block (plan 4.6)`);
  }
  const noDaily = (file: string) =>
    err(`${file}: has daily fields but the manifest has no "daily" block (plan 4.6)`);

  // Detail tiles: schema, ids, and the res 3, 4 and 5 sums for rule 1.
  const index = await load(paths.detailIndex, DetailIndex);
  const tileSet = new Set<string>();
  // sums[res][monthIndex] -> cell -> Sums
  const sums: Record<3 | 4 | 5, Map<string, Sums>[]> = {
    3: months.map(() => new Map()),
    4: months.map(() => new Map()),
    5: months.map(() => new Map()),
  };
  if (index) {
    if (index.tile_res !== manifest.detail.tile_res) {
      err(
        `${paths.detailIndex}: tile_res ${index.tile_res} differs from manifest ${manifest.detail.tile_res}`,
      );
    }
    for (const parent of index.tiles) {
      tileSet.add(parent);
      if (!isValidCell(parent) || getResolution(parent) !== index.tile_res) {
        err(`${paths.detailIndex}: ${parent} is not a valid res ${index.tile_res} cell`);
        continue;
      }
      const file = paths.detailTile(parent);
      const tile = await load(file, DetailTile);
      if (!tile) continue;
      if (tile.parent !== parent) err(`${file}: parent ${tile.parent} differs from file name`);
      if (tile.start !== manifest.record.start || tile.n_months !== nMonths) {
        err(`${file}: start or n_months do not match the manifest record`);
      }
      if (tile.daily) checkTileDaily(file, tile);
      for (let k = 0; k < tile.cells.length; k++) {
        const cell = tile.cells[k]!;
        if (!isValidCell(cell) || getResolution(cell) !== 6) {
          err(`${file}: ${cell} is not a valid res 6 cell`);
          continue;
        }
        if (cellToParent(cell, index.tile_res) !== parent) {
          err(`${file}: ${cell} is not a child of ${parent}`);
          continue;
        }
        const parents = {
          3: cellToParent(cell, 3),
          4: cellToParent(cell, 4),
          5: cellToParent(cell, 5),
        };
        for (let i = tile.offsets[k]!; i < tile.offsets[k + 1]!; i++) {
          const mi = tile.mi[i]!;
          const v = {
            h: tile.h[i]!,
            lo: tile.lo[i]!,
            hi: tile.hi[i]!,
            modis: tile.modis[i]!,
            viirs: tile.viirs[i]!,
          };
          checkReferenceRule(file, months[mi]!, v, cell);
          for (const res of [3, 4, 5] as const) {
            const map = sums[res][mi]!;
            const key = parents[res];
            let s = map.get(key);
            if (!s) {
              s = { h: 0, lo: 0, hi: 0, modis: 0, viirs: 0, n: 0 };
              map.set(key, s);
            }
            for (const vk of VALUE_KEYS) s[vk] += v[vk];
            s.n++;
          }
        }
      }
    }
  }

  // Overview files: schema, ids, rule 3, rule 1 against the detail sums.
  const r3Totals: Sums[] = [];
  for (let mi = 0; mi < months.length; mi++) {
    const month = months[mi]!;
    const files: { file: string; res: 3 | 4 | 5; part?: string }[] = [
      { file: paths.overview(3, month), res: 3 },
      { file: paths.overview(4, month), res: 4 },
      ...manifest.overview.r5_parts.map((part) => ({
        file: paths.overviewR5(part, month),
        res: 5 as const,
        part,
      })),
    ];
    for (const { file, res, part } of files) {
      const o = await load(file, Overview);
      if (!o) continue;
      if (o.month !== month) err(`${file}: month field ${o.month} differs from file name`);
      if (o.daily) checkOverviewDaily(file, o);
      if (o.res !== res) err(`${file}: res field ${o.res} differs from folder`);
      const detail = sums[res][mi]!;
      const seen = new Set<string>();
      const total: Sums | null =
        res === 3 ? { h: 0, lo: 0, hi: 0, modis: 0, viirs: 0, n: 0 } : null;
      for (let i = 0; i < o.cell.length; i++) {
        const cell = o.cell[i]!;
        if (!isValidCell(cell) || getResolution(cell) !== res) {
          err(`${file}: ${cell} is not a valid res ${res} cell`);
          continue;
        }
        if (part && cellToParent(cell, 0) !== part)
          err(`${file}: ${cell} is not inside part ${part}`);
        const v = {
          h: o.h[i]!,
          lo: o.lo[i]!,
          hi: o.hi[i]!,
          modis: o.modis[i]!,
          viirs: o.viirs[i]!,
        };
        checkReferenceRule(file, month, v, cell);
        if (total) {
          for (const vk of VALUE_KEYS) total[vk] += v[vk];
          total.n++;
        }
        seen.add(cell);
        if (tileSet.has(cellToParent(cell, manifest.detail.tile_res))) {
          const d = detail.get(cell) ?? { h: 0, lo: 0, hi: 0, modis: 0, viirs: 0, n: 1 };
          const tol = 0.1 * Math.max(1, d.n) + 1e-6;
          for (const vk of VALUE_KEYS) {
            if (Math.abs(d[vk] - v[vk]) > tol) {
              err(`${file}: ${cell} ${vk} = ${v[vk]}, detail sum = ${round1(d[vk])} (rule 1)`);
            }
          }
        }
      }
      for (const [cell, d] of detail) {
        if (seen.has(cell)) continue;
        if (res === 5 && cellToParent(cell, 0) !== part) continue;
        if (d.h > 0 || d.modis > 0 || d.viirs > 0) {
          err(`${file}: ${cell} has detail activity but is missing from the overview (rule 1)`);
        }
      }
      if (total) r3Totals[mi] = total;
    }
  }

  /** Day masks: inside a daily area, agreeing with the monthly counts, no day past the month. */
  function checkTileDaily(file: string, tile: z.infer<typeof DetailTile>) {
    if (!dailyAreas) return noDaily(file);
    const d = tile.daily!;
    const cellOfRow = new Array<string>(tile.mi.length);
    tile.cells.forEach((c, k) => {
      for (let i = tile.offsets[k]!; i < tile.offsets[k + 1]!; i++) cellOfRow[i] = c;
    });
    d.rows.forEach((row, j) => {
      const cell = cellOfRow[row];
      const month = months[tile.mi[row]!];
      if (!cell || !month) return;
      if (!cellInDailyArea(cell, dailyAreas)) {
        err(`${file}: daily row ${row} (${cell}) is outside the daily areas`);
        return;
      }
      const days = daysWithData(manifest!, month);
      const masks = { modis: d.dm_modis[j]!, snpp: d.dm_snpp[j]!, noaa20: d.dm_noaa20[j]! };
      for (const [k, m] of Object.entries(masks)) {
        if (m >>> days !== 0)
          err(`${file}: ${cell} ${month} ${k} mask has a day after day ${days}`);
      }
      if (popcount(masks.modis) !== tile.modis[row]) {
        err(
          `${file}: ${cell} ${month} dm_modis has ${popcount(masks.modis)} days, modis is ${tile.modis[row]}`,
        );
      }
      for (const s of ['snpp', 'noaa20'] as const) {
        const count = tile.sat?.[s]?.[row];
        if (count !== undefined && popcount(masks[s]) !== count) {
          err(`${file}: ${cell} ${month} dm_${s} has ${popcount(masks[s])} days, ${s} is ${count}`);
        }
      }
    });
  }

  /** Overview days: inside the month, summing to the cell's h (the build rounds them so they do). */
  function checkOverviewDaily(file: string, o: z.infer<typeof Overview>) {
    if (!dailyAreas) return noDaily(file);
    const n = daysInMonth(o.month);
    o.daily!.idx.forEach((i, k) => {
      let total = 0;
      for (const [day, v] of o.daily!.d[k]!) {
        if (day > n) err(`${file}: ${o.cell[i]} has day ${day} in a ${n}-day month`);
        total += v;
      }
      if (Math.abs(total - o.h[i]!) > 0.05 + 1e-6) {
        err(`${file}: ${o.cell[i]} days sum to ${round1(total)}, h is ${o.h[i]}`);
      }
    });
  }

  // Global summary: rule 2 and rule 3.
  const summary = await load(paths.summary, Summary);
  if (summary?.daily_areas && !dailyAreas) noDaily(paths.summary);
  if (summary) {
    if (summary.start !== manifest.record.start || summary.n_months !== nMonths) {
      err(`${paths.summary}: start or n_months do not match the manifest record`);
    }
    for (let mi = 0; mi < Math.min(nMonths, summary.n_months); mi++) {
      const v = {
        h: summary.h[mi]!,
        lo: summary.lo[mi]!,
        hi: summary.hi[mi]!,
        modis: summary.modis[mi]!,
        viirs: summary.viirs[mi]!,
      };
      checkReferenceRule(paths.summary, months[mi]!, v, 'world');
      const t = r3Totals[mi];
      if (!t) continue;
      const tol = 0.1 * Math.max(1, t.n) + 1e-6;
      for (const vk of VALUE_KEYS) {
        if (Math.abs(t[vk] - v[vk]) > tol) {
          err(
            `${paths.summary}: ${months[mi]} ${vk} = ${v[vk]}, res 3 sum = ${round1(t[vk])} (rule 2)`,
          );
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, filesChecked };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
