/**
 * Days inside a month (plan 4.6, optional daily fields). Pure functions, unit tested.
 *
 * Daily values exist only in the areas of manifest.daily. Classes stay monthly: nothing here
 * compares a day with a normal. Days are UTC acquisition dates; day d is bit d - 1 of a mask.
 */
import { cellToLatLng } from 'h3-js';
import type { DailyArea, Manifest, MethodDaily } from '../data/contract';
import { daysInMonth, monthToIndex, partialInfo } from '../data/months';
import { dayMasks, entryAt, findCell, type DayMasks, type TileData } from '../data/tile';

/** The label every daily view carries. */
export const UTC_DAYS = 'UTC days';

/** Days in the running sum, the second daily view. */
export const ROLLING_DAYS = 5;

/** True when a point lies in one of the boxes (the build's selection rule). */
export function inDailyArea(lat: number, lon: number, areas: readonly DailyArea[]): boolean {
  return areas.some((a) => {
    const [w, s, e, n] = a.bbox;
    return lon >= w && lon <= e && lat >= s && lat <= n;
  });
}

/** A res 6 cell has daily data when its centre is inside a daily area box. */
export function cellInDailyArea(cell: string, areas: readonly DailyArea[]): boolean {
  const [lat, lon] = cellToLatLng(cell);
  return inDailyArea(lat, lon, areas);
}

/** Days of the month that have data: all of them, or the covered days of a partial month. */
export function daysWithData(manifest: Pick<Manifest, 'partial_months'>, month: string): number {
  return partialInfo(manifest, month)?.days_covered ?? daysInMonth(month);
}

/** Can the app split monthly values of this build into days at all? */
export function dailyUsable(
  manifest: Pick<Manifest, 'daily'>,
  method: MethodDaily | null | undefined,
): method is MethodDaily {
  // With the NOAA-20 scale applied the split needs per-region factors that are not published.
  return Boolean(manifest.daily && method && !method.noaa20_scale_applied);
}

const bit = (mask: number, day: number) => (mask >>> (day - 1)) & 1;

/**
 * Spreads a cell's monthly value h over the days of its masks (plan 4.6):
 * before first_reference_month evenly over the MODIS days, from it on in proportion to the
 * VIIRS weights times each satellite's bit. Returns null when h > 0 has no day to go to.
 */
export function splitMonth(
  h: number,
  masks: DayMasks,
  month: string,
  firstReferenceMonth: string,
  weights: MethodDaily['viirs_weights'][string] | undefined,
): Float64Array | null {
  const n = daysInMonth(month);
  const out = new Float64Array(n);
  if (!(h > 0)) return out;
  let total = 0;
  for (let d = 1; d <= n; d++) {
    const w =
      month < firstReferenceMonth
        ? bit(masks.modis, d)
        : (weights?.snpp ?? 0) * bit(masks.snpp, d) + (weights?.noaa20 ?? 0) * bit(masks.noaa20, d);
    out[d - 1] = w;
    total += w;
  }
  if (!(total > 0)) return null;
  for (let d = 0; d < n; d++) out[d] = (h * out[d]!) / total;
  return out;
}

/**
 * The days of a place in one month, summed over its res 6 cells, or null when the place is not
 * fully inside the daily areas or a value cannot be split. Never a partial sum.
 */
export function placeDays(
  cells: readonly string[],
  tileOf: (cell: string) => TileData | null | undefined,
  month: string,
  manifest: Pick<Manifest, 'daily' | 'record' | 'first_reference_month'>,
  method: MethodDaily | null | undefined,
): Float64Array | null {
  if (!dailyUsable(manifest, method) || cells.length === 0) return null;
  const areas = manifest.daily!.areas;
  if (!cells.every((c) => cellInDailyArea(c, areas))) return null;
  const ref = manifest.first_reference_month;
  const weights = month >= ref ? method.viirs_weights[month] : undefined;
  if (month >= ref && !weights) return null;
  const t = monthToIndex(manifest.record.start, month);
  const out = new Float64Array(daysInMonth(month));
  for (const cell of cells) {
    const tile = tileOf(cell);
    if (!tile) return null;
    const k = findCell(tile, cell);
    if (k < 0) continue; // never active: zero on every day
    const i = entryAt(tile, k, t);
    if (i < 0) continue; // not active this month
    const h = tile.h[i]!;
    if (!(h > 0)) continue;
    const masks = dayMasks(tile, i);
    if (!masks) return null;
    const days = splitMonth(h, masks, month, ref, weights);
    if (!days) return null;
    for (let d = 0; d < out.length; d++) out[d]! += days[d]!;
  }
  return out;
}

/** Days of an overview cell from its [day, value] pairs (missing days are 0). */
export function daysFromPairs(pairs: readonly (readonly [number, number])[], month: string) {
  const out = new Float64Array(daysInMonth(month));
  for (const [day, v] of pairs) if (day >= 1 && day <= out.length) out[day - 1] = v;
  return out;
}

/** Running total through each day: the default daily view (0 up to the month's value). */
export function runningTotal(days: ArrayLike<number>, upTo = days.length): Float64Array {
  const out = new Float64Array(upTo);
  let s = 0;
  for (let i = 0; i < upTo; i++) {
    s += days[i] ?? 0;
    out[i] = s;
  }
  return out;
}

/** Sum of the last w days through each day (fewer at the start of the month). */
export function rollingSum(
  days: ArrayLike<number>,
  w = ROLLING_DAYS,
  upTo = days.length,
): Float64Array {
  const out = new Float64Array(upTo);
  let s = 0;
  for (let i = 0; i < upTo; i++) {
    s += days[i] ?? 0;
    if (i >= w) s -= days[i - w] ?? 0;
    out[i] = Math.max(0, s);
  }
  return out;
}
