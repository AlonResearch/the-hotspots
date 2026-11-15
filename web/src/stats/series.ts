/** Place series (plan 6.1): element-wise sums of res 6 cells over the record. */
import { SAT_KEYS, type SatKey } from '../data/contract';
import { findCell, type TileData } from '../data/tile';

export const VALUE_KEYS = ['h', 'lo', 'hi', 'modis', 'viirs'] as const;
export type ValueKey = (typeof VALUE_KEYS)[number];

export interface Series {
  start: string;
  n: number;
  h: Float64Array;
  lo: Float64Array;
  hi: Float64Array;
  modis: Float64Array;
  viirs: Float64Array;
  /** Only the satellites present in the source. */
  sat: Partial<Record<SatKey, Float64Array>>;
  /** Number of res 6 cells summed, for a place. Undefined for the world series. */
  cells?: number;
}

export function emptySeries(start: string, n: number): Series {
  return {
    start,
    n,
    h: new Float64Array(n),
    lo: new Float64Array(n),
    hi: new Float64Array(n),
    modis: new Float64Array(n),
    viirs: new Float64Array(n),
    sat: {},
  };
}

/**
 * Sums the given res 6 cells. tileOf returns the loaded tile that holds a cell,
 * or null when there is none. Cells missing from every tile add zero.
 */
export function sumCells(
  cells: readonly string[],
  tileOf: (cell: string) => TileData | null | undefined,
  start: string,
  n: number,
): Series {
  const s = emptySeries(start, n);
  s.cells = cells.length;
  for (const cell of cells) {
    const tile = tileOf(cell);
    if (!tile) continue;
    const k = findCell(tile, cell);
    if (k < 0) continue;
    const a = tile.offsets[k]!;
    const b = tile.offsets[k + 1]!;
    for (let i = a; i < b; i++) {
      const t = tile.mi[i]!;
      if (t >= n) continue;
      s.h[t]! += tile.h[i]!;
      s.lo[t]! += tile.lo[i]!;
      s.hi[t]! += tile.hi[i]!;
      s.modis[t]! += tile.modis[i]!;
      s.viirs[t]! += tile.viirs[i]!;
      for (const key of SAT_KEYS) {
        const src = tile.sat[key];
        if (!src) continue;
        const dst = (s.sat[key] ??= new Float64Array(n));
        dst[t]! += src[i]!;
      }
    }
  }
  return s;
}

/** Dense series from the global summary file. */
export function seriesFromDense(src: {
  start: string;
  n_months: number;
  h: number[];
  lo: number[];
  hi: number[];
  modis: number[];
  viirs: number[];
  sat?: Partial<Record<SatKey, number[]>>;
}): Series {
  const sat: Series['sat'] = {};
  for (const key of SAT_KEYS) {
    const arr = src.sat?.[key];
    if (arr) sat[key] = Float64Array.from(arr);
  }
  return {
    start: src.start,
    n: src.n_months,
    h: Float64Array.from(src.h),
    lo: Float64Array.from(src.lo),
    hi: Float64Array.from(src.hi),
    modis: Float64Array.from(src.modis),
    viirs: Float64Array.from(src.viirs),
    sat,
  };
}

/** Raw series for the seam view: MODIS before the first reference month, VIIRS from it on. */
export function rawSeries(s: Series, firstReferenceIndex: number): Float64Array {
  const out = new Float64Array(s.n);
  for (let t = 0; t < s.n; t++) out[t] = t < firstReferenceIndex ? s.modis[t]! : s.viirs[t]!;
  return out;
}

/** Rounds to one decimal, removing float noise from sums of Float32 values. */
export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
