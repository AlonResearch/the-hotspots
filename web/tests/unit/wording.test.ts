import { describe, expect, it } from 'vitest';
import { cellDays, formatValue, summarySentence } from '../../src/stats/wording';

describe('cell-day formatting', () => {
  it('keeps one decimal for observed values', () => {
    expect(formatValue(1.54)).toBe('1.5');
    expect(cellDays(1.5)).toBe('1.5 active cell-days');
    expect(cellDays(1)).toBe('1 active cell-day');
  });

  it('shows estimated values in whole cell-days', () => {
    expect(formatValue(849078.5, true)).toBe('849,079');
    expect(cellDays(849078.5, true)).toBe('849,079 active cell-days');
    expect(cellDays(1.2, true)).toBe('1 active cell-day');
    expect(cellDays(0.4, true)).toBe('0 active cell-days');
  });

  it('the estimated sentence uses whole cell-days', () => {
    expect(
      summarySentence({
        cls: 'estimated_only',
        lowReason: 'terra',
        calendarMonth: 8,
        year: 2001,
        value: 12.6,
        ratio: null,
        yearsActive: 0,
        baselineYears: 0,
        excludeTargetYear: true,
        estimated: true,
      }),
    ).toBe(
      'August 2001: 13 active cell-days, estimated from Terra alone. ' +
        'Months before October 2002 are not compared with normal.',
    );
  });
});
