/** Density colouring of cells (plan 8.2, finding S7): ember class of cell-days per 1,000 km². */
import { cellArea, UNITS } from 'h3-js';
import type { MonthStatusValue } from '../data/contract';
import { confidenceOf, res6CellsIn, type ConfidenceLevel } from '../stats/confidence';
import { formatValue } from '../stats/wording';
import { opacity, rgb } from '../styles/tokens';

export const LEGEND_WORDS = [
  'Very low',
  'Low',
  'Moderate',
  'High',
  'Very high',
  'Extreme',
] as const;

const areaCache = new Map<string, number>();

export function cellAreaKm2(cell: string): number {
  let a = areaCache.get(cell);
  if (a === undefined) {
    a = cellArea(cell, UNITS.km2);
    if (areaCache.size > 200_000) areaCache.clear();
    areaCache.set(cell, a);
  }
  return a;
}

export function density(value: number, areaKm2: number): number {
  return areaKm2 > 0 ? (value / areaKm2) * 1000 : 0;
}

/** Class 0 to 5 against 5 ascending breaks, or -1 for zero (not drawn). */
export function densityClass(d: number, breaks: readonly number[]): number {
  if (!(d > 0)) return -1;
  let k = 0;
  while (k < breaks.length && d >= breaks[k]!) k++;
  return k;
}

export function fillColor(
  k: number,
  alpha: number = opacity.cell,
): [number, number, number, number] {
  const c = rgb.ember[Math.max(0, Math.min(5, k))]!;
  return [c[0], c[1], c[2], Math.round(alpha * 255)];
}

/** Fill opacity of the cells at a displayed resolution (D24). */
export function cellAlpha(res: number): number {
  return opacity.cellByRes[res] ?? opacity.cell;
}

/**
 * Confidence of the map cells of a month at a resolution (D27): one res r cell is 7^(6-r) res 6
 * cells, so res 5 and 6 are low in estimated months and res 3 and 4 medium. Raw sensor views
 * show what a sensor saw and have no level (null).
 */
export function mapConfidence(
  status: MonthStatusValue,
  month: string,
  res: number,
  view: string,
): ConfidenceLevel | null {
  if (view !== 'harmonized') return null;
  return confidenceOf(status, month, res6CellsIn(res)).level;
}

/** Fill opacity of the cells, faded for low confidence (D27). */
export function mapCellAlpha(res: number, level: ConfidenceLevel | null): number {
  return cellAlpha(res) * (level === 'low' ? opacity.lowConfidence : 1);
}

/** Legend labels for scientific mode: "< 1", "1 to 5", ..., "300 or more". */
export function breakLabels(breaks: readonly number[]): string[] {
  const out: string[] = [`under ${formatValue(breaks[0]!)}`];
  for (let i = 0; i < breaks.length - 1; i++) {
    out.push(`${formatValue(breaks[i]!)} to ${formatValue(breaks[i + 1]!)}`);
  }
  out.push(`${formatValue(breaks[breaks.length - 1]!)} or more`);
  return out;
}

/** Hexagon width in screen pixels at a zoom and latitude (512 px tiles). */
export function hexagonPixels(edgeMetres: number, zoom: number, lat: number): number {
  const metresPerPixel = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  return (2 * edgeMetres) / metresPerPixel;
}
