/** Baseline of a month from the summed place series (plan 6.2). */
import type { Manifest } from '../data/contract';
import {
  addMonths,
  formatMonth,
  inRecord,
  isPartial,
  monthStatus,
  parseMonth,
} from '../data/months';
import { quantileSorted } from './quantile';

export type BaselineConfig = Pick<
  Manifest,
  'baseline' | 'classes' | 'record' | 'partial_months' | 'status_ranges'
>;

export interface Baseline {
  n: number;
  values: number[];
  years: number[];
  normal: number;
  p_low: number;
  p_high: number;
  p_very_high: number;
  years_active: number;
  max: number;
}

/**
 * Values of one calendar month across the baseline years, optionally excluding a
 * target year, skipping partial months, estimated months (decision D4: only observed VIIRS
 * years form "usual") and months outside the record.
 */
export function baselineValues(
  values: ArrayLike<number>,
  start: string,
  calendarMonth: number,
  cfg: BaselineConfig,
  excludeYear: number | null,
): { values: number[]; years: number[] } {
  const out: number[] = [];
  const years: number[] = [];
  const s = parseMonth(start);
  for (let y = cfg.baseline.start_year; y <= cfg.baseline.end_year; y++) {
    if (excludeYear !== null && y === excludeYear) continue;
    const m = formatMonth(y, calendarMonth);
    if (!inRecord(cfg, m) || isPartial(cfg, m) || monthStatus(cfg, m) === 'estimated') continue;
    const t = (y - s.year) * 12 + (calendarMonth - s.month);
    if (t < 0 || t >= values.length) continue;
    out.push(values[t]!);
    years.push(y);
  }
  return { values: out, years };
}

export function summarize(values: number[], years: number[], cfg: BaselineConfig): Baseline {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    n,
    values,
    years,
    normal: quantileSorted(sorted, 50),
    p_low: quantileSorted(sorted, cfg.classes.p_low),
    p_high: quantileSorted(sorted, cfg.classes.p_high),
    p_very_high: quantileSorted(sorted, cfg.classes.p_very_high),
    years_active: values.filter((v) => v > 0).length,
    max: n > 0 ? sorted[n - 1]! : Number.NaN,
  };
}

/** Baseline for month index t of a series that starts at `start`. */
export function baselineFor(
  values: ArrayLike<number>,
  start: string,
  t: number,
  cfg: BaselineConfig,
): Baseline {
  const { year, month } = parseMonth(addMonths(start, t));
  const exclude = cfg.baseline.exclude_target_year ? year : null;
  const b = baselineValues(values, start, month, cfg, exclude);
  return summarize(b.values, b.years, cfg);
}
