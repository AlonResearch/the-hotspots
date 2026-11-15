/**
 * Forecast of a place from the model's res 4 areas.
 *
 * The model forecasts whole res 4 areas (about 1,800 km²). A place that covers an area completely
 * takes its forecast as it is. A place that covers part of an area takes the share of that area's
 * activity the place had in the same calendar month of the baseline years. The shares of the parts
 * of an area add up to 1, so place forecasts add up to the area forecast.
 */
import { cellToChildren, cellToParent } from 'h3-js';
import type { ForecastTile } from '../data/forecast';
import { addMonths, monthLabel, monthName, parseMonth } from '../data/months';
import type { TileData } from '../data/tile';
import { ATOM_RES } from '../grid/place';
import { baselineValues, type BaselineConfig } from './baseline';
import { typicalMonths } from './history';
import { sumCells, type Series } from './series';
import { cellDays, formatValue } from './wording';

export const FORECAST_RES = 4;

export interface PlaceForecast {
  start: string;
  n: number;
  p10: Float64Array;
  p50: Float64Array;
  p90: Float64Array;
  /** The place's own usual value and range for the calendar month of each forecast month. */
  usual: Float64Array;
  usualLow: Float64Array;
  usualHigh: Float64Array;
  /** Res 4 areas the place touches, and how many of them it covers only in part. */
  areas: number;
  partAreas: number;
}

const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);

/**
 * Share of an area's activity that falls in the place, for calendar months 1 to 12.
 * Falls back to the share over all baseline months, then to the share of cells.
 */
export function areaShares(
  placeH: ArrayLike<number>,
  areaH: ArrayLike<number>,
  start: string,
  cfg: BaselineConfig,
  cellShare: number,
): number[] {
  const place: number[] = [];
  const area: number[] = [];
  for (let m = 1; m <= 12; m++) {
    place.push(sum(baselineValues(placeH, start, m, cfg, null).values));
    area.push(sum(baselineValues(areaH, start, m, cfg, null).values));
  }
  const allArea = sum(area);
  const overall = allArea > 0 ? Math.min(1, sum(place) / allArea) : cellShare;
  return area.map((a, i) => (a > 0 ? Math.min(1, place[i]! / a) : overall));
}

/** Forecast rows of one res 4 area in a tile, or null when the area is not in it (forecast 0). */
export function tileRows(
  tile: ForecastTile | null | undefined,
  area: string,
): { p10: number[]; p50: number[]; p90: number[] } | null {
  if (!tile) return null;
  let lo = 0;
  let hi = tile.cells.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = tile.cells[mid]!;
    if (c === area) {
      const a = mid * tile.n_months;
      const b = a + tile.n_months;
      return { p10: tile.p10.slice(a, b), p50: tile.p50.slice(a, b), p90: tile.p90.slice(a, b) };
    }
    if (c < area) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

export function placeForecast(
  cells: readonly string[],
  series: Series,
  tileOf: (cell: string) => TileData | null | undefined,
  rowsOf: (area: string) => { p10: number[]; p50: number[]; p90: number[] } | null,
  fc: { start: string; n_months: number },
  cfg: BaselineConfig,
): PlaceForecast {
  const n = fc.n_months;
  const out: PlaceForecast = {
    start: fc.start,
    n,
    p10: new Float64Array(n),
    p50: new Float64Array(n),
    p90: new Float64Array(n),
    usual: new Float64Array(n),
    usualLow: new Float64Array(n),
    usualHigh: new Float64Array(n),
    areas: 0,
    partAreas: 0,
  };
  const calendar = Array.from({ length: n }, (_, k) => parseMonth(addMonths(fc.start, k)).month);

  const byArea = new Map<string, string[]>();
  for (const c of cells) {
    const p = cellToParent(c, FORECAST_RES);
    const list = byArea.get(p);
    if (list) list.push(c);
    else byArea.set(p, [c]);
  }
  out.areas = byArea.size;
  for (const [area, inside] of byArea) {
    const children = cellToChildren(area, ATOM_RES);
    const whole = inside.length >= children.length;
    if (!whole) out.partAreas++;
    const rows = rowsOf(area);
    if (!rows) continue;
    let shares: number[] | null = null;
    if (!whole) {
      const placeH = sumCells(inside, tileOf, series.start, series.n).h;
      const areaH = sumCells(children, tileOf, series.start, series.n).h;
      shares = areaShares(placeH, areaH, series.start, cfg, inside.length / children.length);
    }
    for (let k = 0; k < n; k++) {
      const s = shares ? shares[calendar[k]! - 1]! : 1;
      out.p10[k]! += (rows.p10[k] ?? 0) * s;
      out.p50[k]! += (rows.p50[k] ?? 0) * s;
      out.p90[k]! += (rows.p90[k] ?? 0) * s;
    }
  }

  const { perMonth } = typicalMonths(series, cfg);
  for (let k = 0; k < n; k++) {
    const p = perMonth[calendar[k]! - 1]!;
    out.usual[k] = p.median;
    out.usualLow[k] = p.p_low;
    out.usualHigh[k] = p.p_high;
  }
  return out;
}

/** Colour of a forecast mark: the data colour pulled halfway to a neutral grey. */
export function forecastTint(hexColor: string, alpha = 1): string {
  return `rgb(${forecastRgb(hexColor).join(' ')} / ${alpha})`;
}

export function forecastRgb(hexColor: string): [number, number, number] {
  const n = Number.parseInt(hexColor.slice(1), 16);
  const grey = [154, 163, 161];
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) =>
    Math.round(v * 0.5 + grey[i]! * 0.5),
  );
  return [c[0]!, c[1]!, c[2]!];
}

/** Where the forecast sits against the place's usual range for that calendar month. */
export type OutlookLevel = 'none' | 'below' | 'usual' | 'above';

export function outlookLevel(f: PlaceForecast, k: number): OutlookLevel {
  const v = f.p50[k] ?? 0;
  if (Math.round(v * 10) === 0 && Math.round((f.usual[k] ?? 0) * 10) === 0) return 'none';
  if (v > (f.usualHigh[k] ?? 0)) return 'above';
  if (v < (f.usualLow[k] ?? 0)) return 'below';
  return 'usual';
}

/** The plain sentence for one forecast month of a place. */
export function outlookSentence(f: PlaceForecast, k: number): string {
  const M = monthName(parseMonth(addMonths(f.start, k)).month);
  const v = f.p50[k] ?? 0;
  switch (outlookLevel(f, k)) {
    case 'none':
      return `No fire activity expected. Usually none in ${M}.`;
    case 'above':
      return `About ${cellDays(v)} expected, more than usual for ${M}.`;
    case 'below':
      return `About ${cellDays(v)} expected, quieter than usual for ${M}.`;
    case 'usual':
      return `About ${cellDays(v)} expected, about the usual for ${M}.`;
  }
}

/** The place forecast as CSV, one row per forecast month. */
export function forecastCsv(f: PlaceForecast, header: string[]): string {
  const r1 = (x: number) => String(Math.round(x * 10) / 10);
  const lines = [
    ...header.map((h) => `# ${h}`),
    '# p10, p50, p90: forecast active cell-days (10%, 50% and 90% quantiles). usual: median of the baseline years.',
    'month,p10,p50,p90,usual,status',
  ];
  for (let k = 0; k < f.n; k++) {
    lines.push(
      [
        addMonths(f.start, k),
        r1(f.p10[k]!),
        r1(f.p50[k]!),
        r1(f.p90[k]!),
        r1(f.usual[k]!),
        'forecast',
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Opacity of forecast marks over the sheet. */
export const FORECAST_OPACITY = 0.6;

/** Words for one forecast month, shared by the strip, the calendar and the summary. */
export function outlookText(
  month: string,
  value: number,
  place: PlaceForecast | null,
  k: number,
  mode: 'simple' | 'sci',
): string {
  const parts = [monthLabel(month), 'forecast', `about ${cellDays(value)}`];
  if (place && mode === 'sci') {
    parts.push(`likely ${formatValue(place.p10[k] ?? 0)} to ${formatValue(place.p90[k] ?? 0)}`);
    parts.push(`usual ${formatValue(place.usual[k] ?? 0)}`);
  }
  return parts.join(', ');
}
