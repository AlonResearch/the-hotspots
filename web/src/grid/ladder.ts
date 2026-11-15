/** Zoom to resolution with hysteresis (plan 8.1). */
import { getHexagonAreaAvg, UNITS } from 'h3-js';
import type { Manifest } from '../data/contract';
import { formatArea } from '../stats/wording';

export type Res = 3 | 4 | 5 | 6;
export type Ladder = Manifest['ladder'];

/** First render: the last entry with min_zoom at or below the zoom. */
export function initialRes(zoom: number, ladder: Ladder): Res {
  let res = ladder[0]!.res;
  for (const l of ladder) if (l.min_zoom <= zoom) res = l.res;
  return res;
}

/**
 * After the first render: move finer only when zoom >= min_zoom + x of the finer
 * entry, coarser only when zoom < min_zoom - x of the current entry.
 */
export function nextRes(current: Res, zoom: number, ladder: Ladder, hysteresis: number): Res {
  let i = ladder.findIndex((l) => l.res === current);
  if (i < 0) return initialRes(zoom, ladder);
  while (i + 1 < ladder.length && zoom >= ladder[i + 1]!.min_zoom + hysteresis) i++;
  while (i > 0 && zoom < ladder[i]!.min_zoom - hysteresis) i--;
  return ladder[i]!.res;
}

export function cellAreaAvgKm2(res: number): number {
  return getHexagonAreaAvg(res, UNITS.km2);
}

/** Legend chip text: "Cells: about 12,400 km²", or "Finest cell: 36 km²" at the finest step. */
export function cellSizeChip(res: Res, ladder: Ladder): string {
  const area = formatArea(cellAreaAvgKm2(res));
  const finest = ladder[ladder.length - 1]!.res === res;
  return finest ? `Finest cell: ${area}` : `Cells: about ${area}`;
}
