/** Per-month results, typical months, unusual months and the record summary (plan 6.3 to 6.5). */
import type { Manifest, MonthStatusValue } from '../data/contract';
import {
  addMonths,
  formatMonth,
  inRecord,
  isPartial,
  monthStatus,
  parseMonth,
  partialInfo,
} from '../data/months';
import { baselineFor, baselineValues, type Baseline } from './baseline';
import { classify, suppressEstimated, type Classification } from './classify';
import { confidenceOf, type Confidence } from './confidence';
import { statsConfig } from './config';
import { quantile } from './quantile';
import type { Series } from './series';
import { listMonths, summarySentence } from './wording';

export type HistoryConfig = Pick<
  Manifest,
  'baseline' | 'classes' | 'record' | 'partial_months' | 'status_ranges'
>;

export interface MonthResult {
  t: number;
  month: string;
  year: number;
  calendarMonth: number;
  h: number;
  lo: number;
  hi: number;
  status: MonthStatusValue;
  partial: { days_covered: number; days_in_month: number } | null;
  baseline: Baseline;
  classification: Classification;
  /** Confidence level of the value (D27). */
  confidence: Confidence;
  sentence: string;
}

export function monthResult(series: Series, t: number, cfg: HistoryConfig): MonthResult {
  const month = addMonths(series.start, t);
  const { year, month: calendarMonth } = parseMonth(month);
  const target = { h: series.h[t] ?? 0, lo: series.lo[t] ?? 0, hi: series.hi[t] ?? 0 };
  const baseline = baselineFor(series.h, series.start, t, cfg);
  const partial = partialInfo(cfg, month);
  const status = monthStatus(cfg, month);
  const compared = classify(
    target,
    baseline,
    partial !== null,
    cfg.classes,
    cfg.baseline.min_years,
  );
  const confidence = confidenceOf(status, month, series.cells);
  // Low-confidence months are not compared with normal (plan S1, D27).
  const classification = confidence.level === 'low' ? suppressEstimated(compared) : compared;
  const sentence = summarySentence({
    cls: classification.cls,
    lowReason: confidence.reason === 'terra' ? 'terra' : 'small',
    calendarMonth,
    year,
    value: target.h,
    ratio: classification.ratio,
    yearsActive: baseline.years_active,
    baselineYears: baseline.n,
    excludeTargetYear: cfg.baseline.exclude_target_year,
    partial,
    estimated: status === 'estimated',
  });
  return {
    t,
    month,
    year,
    calendarMonth,
    ...target,
    status,
    partial,
    baseline,
    classification,
    confidence,
    sentence,
  };
}

export function allMonthResults(series: Series, cfg: HistoryConfig): MonthResult[] {
  return Array.from({ length: series.n }, (_, t) => monthResult(series, t, cfg));
}

/** Every unusual month of the record, newest first. */
export function unusualMonths(results: MonthResult[]): MonthResult[] {
  return results.filter((r) => r.classification.unusual).reverse();
}

export interface CalendarMonthStats {
  calendarMonth: number;
  n: number;
  mean: number;
  median: number;
  p_low: number;
  p_high: number;
  years_active: number;
}

export interface Typical {
  perMonth: CalendarMonthStats[];
  typical: number[];
  sentence: string;
}

/** Per calendar month over all baseline years, and the typical fire months. */
export function typicalMonths(series: Series, cfg: HistoryConfig): Typical {
  const perMonth: CalendarMonthStats[] = [];
  for (let m = 1; m <= 12; m++) {
    const { values } = baselineValues(series.h, series.start, m, cfg, null);
    const n = values.length;
    perMonth.push({
      calendarMonth: m,
      n,
      mean: n ? values.reduce((a, b) => a + b, 0) / n : 0,
      median: n ? quantile(values, 50) : 0,
      p_low: n ? quantile(values, cfg.classes.p_low) : 0,
      p_high: n ? quantile(values, cfg.classes.p_high) : 0,
      years_active: values.filter((v) => v > 0).length,
    });
  }
  const maxMean = Math.max(0, ...perMonth.map((p) => p.mean));
  const typical =
    maxMean > 0
      ? perMonth
          .filter(
            (p) =>
              p.n > 0 &&
              p.years_active / p.n >= statsConfig.typicalMinYearsShare &&
              p.mean >= statsConfig.typicalMinMeanShare * maxMean,
          )
          .map((p) => p.calendarMonth)
      : [];
  const sentence =
    typical.length > 0
      ? `Fire activity is most common in ${listMonths(typical)}.`
      : 'No regular fire season in this area in the record.';
  return { perMonth, typical, sentence };
}

export interface RecordSummary {
  yearsActive: number;
  years: number;
  anyActivity: boolean;
  sentence: string;
}

/** "Fire activity was detected here in {k} of {n} years." over the baseline years. */
export function recordSummary(series: Series, cfg: HistoryConfig): RecordSummary {
  let anyActivity = false;
  for (let t = 0; t < series.n; t++) {
    if ((series.h[t] ?? 0) > 0) {
      anyActivity = true;
      break;
    }
  }
  const startYear = parseMonth(cfg.record.start).year;
  const endYear = parseMonth(cfg.record.end).year;
  if (!anyActivity) {
    return {
      yearsActive: 0,
      years: 0,
      anyActivity,
      sentence: `No fire activity was detected here in the record (${startYear} to ${endYear}).`,
    };
  }
  let years = 0;
  let yearsActive = 0;
  for (let y = cfg.baseline.start_year; y <= cfg.baseline.end_year; y++) {
    let total = 0;
    let counted = false;
    for (let m = 1; m <= 12; m++) {
      const month = formatMonth(y, m);
      if (!inRecord(cfg, month) || isPartial(cfg, month) || monthStatus(cfg, month) === 'estimated')
        continue;
      const t = (y - parseMonth(series.start).year) * 12 + (m - parseMonth(series.start).month);
      if (t < 0 || t >= series.n) continue;
      counted = true;
      total += series.h[t]!;
    }
    if (!counted) continue;
    years++;
    if (total > 0) yearsActive++;
  }
  return {
    yearsActive,
    years,
    anyActivity,
    sentence: `Fire activity was detected here in ${yearsActive} of ${years} years.`,
  };
}

/** Top of the calendar colour scale: the given percentile of the non-zero months (D17). */
export function calendarScaleMax(values: ArrayLike<number>): number {
  const nz: number[] = [];
  for (let i = 0; i < values.length; i++) if (values[i]! > 0) nz.push(values[i]!);
  if (nz.length === 0) return 0;
  return quantile(nz, statsConfig.calendarScalePercentile);
}

/** Ember step 0 to 5 of a calendar value against the scale top, or -1 for zero. */
export function calendarStep(v: number, max: number): number {
  if (!(v > 0) || !(max > 0)) return -1;
  return Math.min(5, Math.max(0, Math.ceil((v / max) * 6) - 1));
}
