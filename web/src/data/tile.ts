/**
 * Detail tile in typed-array form (plan 7.3). Values are converted once on load;
 * per-cell access goes through offsets with subarray views, without copying.
 */
import { SAT_KEYS, type DetailTile, type SatKey } from './contract';

export interface TileData {
  parent: string;
  start: string;
  nMonths: number;
  cells: readonly string[];
  offsets: Uint32Array;
  mi: Uint16Array;
  h: Float32Array;
  lo: Float32Array;
  hi: Float32Array;
  modis: Float32Array;
  viirs: Float32Array;
  sat: Partial<Record<SatKey, Float32Array>>;
  /** Day masks of the daily area's rows (plan 4.6), when the build has them. */
  daily?: TileDaily;
}

export interface TileDaily {
  /** Row positions (into mi), ascending. */
  rows: Uint32Array;
  modis: Uint32Array;
  snpp: Uint32Array;
  noaa20: Uint32Array;
}

export interface DayMasks {
  modis: number;
  snpp: number;
  noaa20: number;
}

/** The day masks of row i, or null when the row has none (outside the daily area). */
export function dayMasks(tile: TileData, i: number): DayMasks | null {
  const d = tile.daily;
  if (!d) return null;
  let lo = 0;
  let hi = d.rows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = d.rows[mid]!;
    if (r === i) return { modis: d.modis[mid]!, snpp: d.snpp[mid]!, noaa20: d.noaa20[mid]! };
    if (r < i) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

export function toTileData(t: DetailTile): TileData {
  const sat: TileData['sat'] = {};
  for (const key of SAT_KEYS) {
    const arr = t.sat?.[key];
    if (arr) sat[key] = Float32Array.from(arr);
  }
  return {
    parent: t.parent,
    start: t.start,
    nMonths: t.n_months,
    cells: t.cells,
    offsets: Uint32Array.from(t.offsets),
    mi: Uint16Array.from(t.mi),
    h: Float32Array.from(t.h),
    lo: Float32Array.from(t.lo),
    hi: Float32Array.from(t.hi),
    modis: Float32Array.from(t.modis),
    viirs: Float32Array.from(t.viirs),
    sat,
    ...(t.daily
      ? {
          daily: {
            rows: Uint32Array.from(t.daily.rows),
            modis: Uint32Array.from(t.daily.dm_modis),
            snpp: Uint32Array.from(t.daily.dm_snpp),
            noaa20: Uint32Array.from(t.daily.dm_noaa20),
          },
        }
      : {}),
  };
}

/** Index of a cell in the tile (cells are sorted), or -1. */
export function findCell(tile: TileData, cell: string): number {
  let lo = 0;
  let hi = tile.cells.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = tile.cells[mid]!;
    if (c === cell) return mid;
    if (c < cell) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export interface CellView {
  mi: Uint16Array;
  h: Float32Array;
  lo: Float32Array;
  hi: Float32Array;
  modis: Float32Array;
  viirs: Float32Array;
}

/** Views of one cell's entries. No copy. */
export function cellView(tile: TileData, k: number): CellView {
  const a = tile.offsets[k]!;
  const b = tile.offsets[k + 1]!;
  return {
    mi: tile.mi.subarray(a, b),
    h: tile.h.subarray(a, b),
    lo: tile.lo.subarray(a, b),
    hi: tile.hi.subarray(a, b),
    modis: tile.modis.subarray(a, b),
    viirs: tile.viirs.subarray(a, b),
  };
}

/** Position of month index t in cell k's entries, or -1 when the month is zero. */
export function entryAt(tile: TileData, k: number, t: number): number {
  let lo = tile.offsets[k]!;
  let hi = tile.offsets[k + 1]! - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = tile.mi[mid]!;
    if (m === t) return mid;
    if (m < t) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
