/** Simple-mode sentences (plan 6.4, decision D7 default) and number formatting. */
import { monthName } from '../data/months';
import type { ClassName } from './classify';

/**
 * A value in cell-days for people: one decimal, or whole cell-days when the value is
 * estimated (ratio-scaled, so its decimals carry no meaning). CSV keeps full precision.
 */
export function formatValue(v: number, estimated = false): string {
  if (!Number.isFinite(v)) return '0';
  const r = estimated ? Math.round(v) : Math.round(v * 10) / 10;
  return r.toLocaleString('en-GB', { maximumFractionDigits: 1 });
}

/** "41 active cell-days", "1 active cell-day"; estimated values in whole cell-days. */
export function cellDays(v: number, estimated = false): string {
  const shown = estimated ? Math.round(v) : Math.round(v * 10) / 10;
  const unit = shown === 1 ? 'cell-day' : 'cell-days';
  return `${formatValue(v, estimated)} active ${unit}`;
}

export function ratioPhrase(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio) || ratio < 1.25) return '';
  if (ratio < 1.75) return 'About one and a half times the usual.';
  if (ratio < 2.5) return 'About twice the usual.';
  if (ratio < 10) return `About ${Math.round(ratio)} times the usual.`;
  return 'More than 10 times the usual.';
}

export interface SentenceInput {
  cls: ClassName;
  calendarMonth: number;
  year: number;
  value: number;
  ratio: number | null;
  yearsActive: number;
  baselineYears: number;
  excludeTargetYear: boolean;
  partial?: { days_covered: number; days_in_month: number } | null;
  /** Why an estimated_only month is not compared: a small area, or Terra alone (D27). */
  lowReason?: 'small' | 'terra';
  /** The value is estimated (ratio-scaled): shown in whole cell-days. */
  estimated?: boolean;
}

export function summarySentence(i: SentenceInput): string {
  const M = monthName(i.calendarMonth);
  switch (i.cls) {
    case 'none_usual_none':
      return `Usually no fire activity in ${M}. None in ${i.year}.`;
    case 'active_usual_none': {
      const other = i.excludeTargetYear ? 'other years' : 'years';
      return (
        `Usually no fire activity in ${M}. In ${i.year}: ${cellDays(i.value, i.estimated)}. ` +
        `Fire activity in ${i.yearsActive} of ${i.baselineYears} ${other}.`
      );
    }
    case 'below':
      return `Quieter than usual for ${M}.`;
    case 'usual':
      return `Usual for ${M}.`;
    case 'above':
      return joinSentences(`More than usual for ${M}.`, ratioPhrase(i.ratio));
    case 'much_above':
      return joinSentences(`Much more than usual for ${M}.`, ratioPhrase(i.ratio));
    case 'partial': {
      const d = i.partial?.days_covered ?? 0;
      const D = i.partial?.days_in_month ?? 0;
      return (
        `${M} ${i.year} so far (${d} of ${D} days): ${cellDays(i.value, i.estimated)}. ` +
        'Not compared with normal until the month is complete.'
      );
    }
    case 'insufficient':
      return 'Not enough years to say what is usual.';
    case 'estimated_only':
      return i.lowReason === 'terra'
        ? `${M} ${i.year}: ${cellDays(i.value, i.estimated)}, estimated from Terra alone. ` +
            'Months before October 2002 are not compared with normal.'
        : `${M} ${i.year}: ${cellDays(i.value, i.estimated)}, estimated from MODIS. ` +
            'This area is too small to compare estimated months with normal.';
  }
}

function joinSentences(a: string, b: string): string {
  return b ? `${a} ${b}` : a;
}

/** "July", "July and August", "June, July and August" */
export function listMonths(calendarMonths: number[]): string {
  const names = calendarMonths.map(monthName);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Rounded area: 3 significant figures from 1,000 km² up, 2 below ("250 km²"). */
/** Rounds to a few significant digits for display. */
function roundSig(x: number, digits: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)) + 1 - digits);
  return Math.round(x / p) * p;
}

/** An area in km² only: for regions, tooltips and other compact places. */
export function formatKm2(km2: number): string {
  if (!Number.isFinite(km2) || km2 <= 0) return '0 km²';
  if (km2 < 1) return `${roundSig(km2, 2).toLocaleString('en-GB')} km²`;
  return `${roundSig(km2, km2 >= 1000 ? 3 : 2).toLocaleString('en-GB')} km²`;
}

/** An area in hectares (1 km² = 100 ha), the unit farmers and land managers use. */
export function formatHa(km2: number): string {
  const ha = km2 * 100;
  if (ha < 10) return `${(Math.round(ha * 10) / 10).toLocaleString('en-GB')} ha`;
  return `${roundSig(ha, 2).toLocaleString('en-GB')} ha`;
}

/**
 * An area in the units people use at that size (D24): hectares first under 1 km² (a field is
 * "50 ha"), km² with hectares from 1 to 100 km² (a cell is "36 km², 3,600 ha"), km² above.
 */
export function formatArea(km2: number): string {
  if (!Number.isFinite(km2) || km2 <= 0) return '0 km²';
  if (km2 < 1) return `${formatHa(km2)} (${formatKm2(km2)})`;
  if (km2 < 100) return `${formatKm2(km2)} (${formatHa(km2)})`;
  return formatKm2(km2);
}
