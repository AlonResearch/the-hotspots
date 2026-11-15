/** Month arithmetic on 'YYYY-MM' strings and month indexes (months since record.start). */
import type { Manifest, MonthStatusValue } from './contract';

export interface YM {
  year: number;
  month: number; // 1 to 12
}

export function parseMonth(m: string): YM {
  const year = Number(m.slice(0, 4));
  const month = Number(m.slice(5, 7));
  return { year, month };
}

export function formatMonth(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** Months from a to b (b minus a). */
export function monthDiff(a: string, b: string): number {
  const pa = parseMonth(a);
  const pb = parseMonth(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

export function addMonths(m: string, n: number): string {
  const p = parseMonth(m);
  const total = p.year * 12 + (p.month - 1) + n;
  return formatMonth(Math.floor(total / 12), (total % 12) + 1);
}

export function monthToIndex(start: string, m: string): number {
  return monthDiff(start, m);
}

export function indexToMonth(start: string, i: number): string {
  return addMonths(start, i);
}

/** Number of months from start to end, both inclusive. */
export function monthCount(start: string, end: string): number {
  return monthDiff(start, end) + 1;
}

export function daysInMonth(m: string): number {
  const { year, month } = parseMonth(m);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function monthName(calendarMonth: number): string {
  return MONTH_NAMES[calendarMonth - 1] ?? '';
}

/** "August 2024" */
export function monthLabel(m: string): string {
  const { year, month } = parseMonth(m);
  return `${monthName(month)} ${year}`;
}

/** Every month of the record, in order. */
export function recordMonths(manifest: Pick<Manifest, 'record'>): string[] {
  const n = monthCount(manifest.record.start, manifest.record.end);
  return Array.from({ length: n }, (_, i) => addMonths(manifest.record.start, i));
}

export function monthStatus(
  manifest: Pick<Manifest, 'status_ranges'>,
  m: string,
): MonthStatusValue {
  for (const r of manifest.status_ranges) {
    if (r.from <= m && m <= r.to) return r.status;
  }
  return 'observed';
}

export function partialInfo(
  manifest: Pick<Manifest, 'partial_months'>,
  m: string,
): { days_covered: number; days_in_month: number } | null {
  return manifest.partial_months.find((p) => p.month === m) ?? null;
}

export function isPartial(manifest: Pick<Manifest, 'partial_months'>, m: string): boolean {
  return manifest.partial_months.some((p) => p.month === m);
}

/** The latest month of the record that is not partial (URL default, plan 7.2). */
export function latestCompleteMonth(manifest: Pick<Manifest, 'record' | 'partial_months'>): string {
  let m = manifest.record.end;
  while (isPartial(manifest, m) && m > manifest.record.start) m = addMonths(m, -1);
  return m;
}

export function inRecord(manifest: Pick<Manifest, 'record'>, m: string): boolean {
  return manifest.record.start <= m && m <= manifest.record.end;
}
