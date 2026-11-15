import type { DetailTile, Manifest } from '../../src/data/contract';
import { toTileData, type TileData } from '../../src/data/tile';
import { emptySeries, type Series } from '../../src/stats/series';

/** A manifest slice for the stats functions. Record 2000-01 to 2025-12, no partial months. */
export function cfg(over: Partial<Manifest> = {}) {
  return {
    record: { start: '2000-01', end: '2025-12' },
    partial_months: [] as Manifest['partial_months'],
    status_ranges: [] as Manifest['status_ranges'],
    baseline: { start_year: 2003, end_year: 2025, min_years: 10, exclude_target_year: true },
    classes: { p_low: 25, p_high: 75, p_very_high: 90, min_normal_for_ratio: 3 },
    ...over,
  };
}

/** Series over the cfg() record where month (year, calendarMonth) has value f(year). */
export function seriesWith(
  start: string,
  n: number,
  f: (year: number, calendarMonth: number) => number,
): Series {
  const s = emptySeries(start, n);
  const y0 = Number(start.slice(0, 4));
  const m0 = Number(start.slice(5, 7));
  for (let t = 0; t < n; t++) {
    const total = y0 * 12 + (m0 - 1) + t;
    const v = f(Math.floor(total / 12), (total % 12) + 1);
    s.h[t] = v;
    s.lo[t] = v;
    s.hi[t] = v;
    s.viirs[t] = v;
  }
  return s;
}

/** Builds a typed tile from per-cell sparse entries. */
export function tileOf(
  parent: string,
  n: number,
  cells: Record<string, [mi: number, h: number, modis?: number, snpp?: number][]>,
): TileData {
  const t: DetailTile = {
    parent,
    res: 6,
    start: '2000-01',
    n_months: n,
    cells: [],
    offsets: [0],
    mi: [],
    h: [],
    lo: [],
    hi: [],
    modis: [],
    viirs: [],
    sat: { snpp: [] },
  };
  for (const cell of Object.keys(cells).sort()) {
    for (const [mi, h, modis = 0, snpp = 0] of cells[cell]!) {
      t.mi.push(mi);
      t.h.push(h);
      t.lo.push(h * 0.8);
      t.hi.push(h * 1.2);
      t.modis.push(modis);
      t.viirs.push(snpp);
      t.sat!.snpp!.push(snpp);
    }
    t.cells.push(cell);
    t.offsets.push(t.mi.length);
  }
  return toTileData(t);
}

export function sampleManifest(over: Partial<Manifest> = {}): Manifest {
  return {
    contract_version: 1,
    source: 'fixture',
    built_at: '2026-11-15T01:30:00Z',
    data_through: '2026-11-14',
    atom_res: 6,
    record: { start: '2011-12', end: '2012-03' },
    first_reference_month: '2012-02',
    status_ranges: [{ from: '2011-12', to: '2012-01', status: 'estimated' }],
    partial_months: [{ month: '2012-03', days_covered: 14, days_in_month: 31 }],
    seams: [{ month: '2012-02', label: 'VIIRS starts (S-NPP)' }],
    known_issues: [],
    baseline: { start_year: 2003, end_year: 2025, min_years: 10, exclude_target_year: true },
    classes: { p_low: 25, p_high: 75, p_very_high: 90, min_normal_for_ratio: 3 },
    ladder: [
      { res: 3, min_zoom: 0, source: 'overview' },
      { res: 4, min_zoom: 4.5, source: 'overview' },
      { res: 5, min_zoom: 6, source: 'overview' },
      { res: 6, min_zoom: 7.5, source: 'detail' },
    ],
    ladder_hysteresis: 0.3,
    overview: { r5_parts: [] },
    detail: { tile_res: 3, max_place_cells: 5000 },
    color: { density_breaks: [1, 5, 25, 100, 300] },
    method: {
      version: 'test',
      reference: 'VIIRS-equivalent',
      transfer: 'ratio',
      viirs_group: 'S-NPP',
      filters: 'none',
    },
    ...over,
  };
}
