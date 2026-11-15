/**
 * Confidence level of a value on the harmonized scale, per (place or map cell, month).
 * Decision D27, Whitepaper section 3.9. Computed from the month status, the month and the
 * area size in res 6 cells; no data field is needed.
 */
import type { MonthStatusValue } from '../data/contract';
import { statsConfig } from './config';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Why a month has its level.
 * observed: VIIRS seen. provisional: near real-time VIIRS, can still change.
 * estimated: converted from MODIS, area large enough for the estimate to hold.
 * small: converted from MODIS, area too small. terra: converted from Terra alone.
 */
export type ConfidenceReason = 'observed' | 'provisional' | 'estimated' | 'small' | 'terra';

export interface Confidence {
  level: ConfidenceLevel;
  reason: ConfidenceReason;
}

/** Number of res 6 cells in one cell of a resolution (an H3 cell has 7 children). */
export function res6CellsIn(res: number): number {
  return 7 ** Math.max(0, 6 - res);
}

/**
 * The level for a month. cells is the area in res 6 cells; undefined means the world series,
 * which counts as large.
 */
export function confidenceOf(
  status: MonthStatusValue,
  month: string,
  cells: number | undefined,
): Confidence {
  if (status === 'observed') return { level: 'high', reason: 'observed' };
  if (status === 'provisional') return { level: 'medium', reason: 'provisional' };
  if (month < statsConfig.terraOnlyBefore) return { level: 'low', reason: 'terra' };
  if (cells !== undefined && cells < statsConfig.estimatedCompareMinCells) {
    return { level: 'low', reason: 'small' };
  }
  return { level: 'medium', reason: 'estimated' };
}

/** "High confidence" and so on, for value text and labels. */
export const CONFIDENCE_WORDS: Record<ConfidenceLevel, string> = {
  high: 'high confidence',
  medium: 'medium confidence',
  low: 'low confidence',
};

/** The plain line shown next to a value. Null for observed months (nothing to warn about). */
export function confidenceNote(reason: ConfidenceReason): string | null {
  switch (reason) {
    case 'observed':
      return null;
    case 'provisional':
      return 'Recent month from near real-time data. The value can still change.';
    case 'estimated':
      return 'Estimated from MODIS. Totals for an area this size hold up; a single month can be off.';
    case 'small':
      return 'Before 2012 this area is too small for a reliable estimate. Heights are not comparable with later years.';
    case 'terra':
      return 'Before October 2002 only one satellite (Terra) was flying. This estimate is not checked and outage months read low.';
  }
}

/** One line per level, for the "How to read" notes. */
export const CONFIDENCE_GUIDE: { level: ConfidenceLevel; text: string }[] = [
  { level: 'high', text: 'Seen by VIIRS (February 2012 on).' },
  {
    level: 'medium',
    text: 'Estimated from MODIS for areas of about 1,800 km² or more, or a recent month that can still change.',
  },
  {
    level: 'low',
    text: 'Estimated for a smaller area, or from Terra alone (before October 2002). Shown faded: do not compare its height with later years.',
  },
];
