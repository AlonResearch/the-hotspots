import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/stats/baseline';
import { CLASS_CODE, classify, type ClassName } from '../../src/stats/classify';
import {
  monthResult,
  recordSummary,
  typicalMonths,
  unusualMonths,
  allMonthResults,
} from '../../src/stats/history';
import { ratioPhrase, summarySentence } from '../../src/stats/wording';
import { cfg, seriesWith } from './helpers';

const c = cfg();
const years = Array.from({ length: 22 }, (_, i) => 2003 + i);
const base = (values: number[]) => summarize(values, years.slice(0, values.length), c);
const zeros = base(new Array(22).fill(0));
// 22 values: 18 zeros and 4 non-zero, normal 0, p_very_high > 0.
const zeroNormal = base([...new Array(18).fill(0), 2, 3, 4, 10]);
// 1..22: normal 11.5, p_low 6.25, p_high 16.75, p_very_high 19.9.
const spread = base(Array.from({ length: 22 }, (_, i) => i + 1));
const run = (h: number, lo = h, hi = h, b = spread, partial = false) =>
  classify({ h, lo, hi }, b, partial, c.classes, c.baseline.min_years);

describe('zero-normal rule', () => {
  it('normal 0 and value 0 gives none_usual_none, ratio null', () => {
    const r = run(0, 0, 0, zeros);
    expect(r.cls).toBe('none_usual_none');
    expect(r.ratio).toBeNull();
    expect(r.unusual).toBe(false);
  });

  it('normal 0 and value 3 gives active_usual_none, ratio null', () => {
    const r = run(3, 3, 3, zeroNormal);
    expect(zeroNormal.normal).toBe(0);
    expect(r.cls).toBe('active_usual_none');
    expect(r.ratio).toBeNull();
  });

  it('normal 0 and value above p_very_high sets unusual and keeps the zero-normal class', () => {
    expect(zeroNormal.p_very_high).toBeGreaterThan(0);
    const r = run(50, 40, 60, zeroNormal);
    expect(r.cls).toBe('active_usual_none');
    expect(r.unusual).toBe(true);
    expect(r.ratio).toBeNull();
  });

  it('never divides by a zero normal, even for huge values', () => {
    const r = run(1e9, 1e9, 1e9, zeros);
    expect(r.ratio).toBeNull();
    expect(Number.isFinite(r.code)).toBe(true);
  });
});

describe('classes and the band rule', () => {
  it('lo above p_very_high gives much_above', () => {
    expect(run(25, 20, 30).cls).toBe('much_above');
  });
  it('h above p_very_high with lo below it does not give much_above', () => {
    const r = run(25, 18, 30);
    expect(r.cls).toBe('above');
    expect(r.unusual).toBe(false);
  });
  it('hi below p_low gives below; h below p_low with hi above it gives usual', () => {
    expect(run(3, 2, 5).cls).toBe('below');
    expect(run(3, 2, 8).cls).toBe('usual');
  });
  it('a normal under min_normal_for_ratio sets the class and no ratio', () => {
    const small = base([...new Array(10).fill(0), ...new Array(12).fill(2)]);
    expect(small.normal).toBe(2);
    const r = run(9, 9, 9, small);
    expect(r.cls).toBe('much_above');
    expect(r.ratio).toBeNull();
  });
  it('a ratio is given above the minimum normal', () => {
    expect(run(25, 20, 30).ratio).toBeCloseTo(25 / 11.5, 10);
  });
  it('a partial month gives partial whatever the values', () => {
    expect(run(1000, 1000, 1000, spread, true).cls).toBe('partial');
    expect(run(0, 0, 0, zeros, true).cls).toBe('partial');
    expect(run(1000, 1000, 1000, spread, true).unusual).toBe(false);
  });
});

describe('ratio phrase limits', () => {
  it.each([
    [1.24, ''],
    [1.25, 'About one and a half times the usual.'],
    [1.74, 'About one and a half times the usual.'],
    [1.75, 'About twice the usual.'],
    [2.49, 'About twice the usual.'],
    [2.5, 'About 3 times the usual.'],
    [9.4, 'About 9 times the usual.'],
    [10, 'More than 10 times the usual.'],
  ])('ratio %f', (ratio, phrase) => {
    expect(ratioPhrase(ratio)).toBe(phrase);
  });
});

describe('sentences', () => {
  const classes = Object.keys(CLASS_CODE) as ClassName[];
  const edge = [0, 1, 0.05, 1e6, Number.NaN];
  it('every class has a sentence without NaN, Infinity or undefined for edge inputs', () => {
    for (const cls of classes) {
      for (const value of edge) {
        for (const ratio of [null, 0, Number.POSITIVE_INFINITY, Number.NaN, 3]) {
          const s = summarySentence({
            cls,
            calendarMonth: 8,
            year: 2017,
            value,
            ratio,
            yearsActive: 0,
            baselineYears: 0,
            excludeTargetYear: true,
            partial: cls === 'partial' ? { days_covered: 14, days_in_month: 30 } : null,
          });
          expect(s.length).toBeGreaterThan(5);
          expect(s).not.toMatch(/NaN|Infinity|undefined/);
        }
      }
    }
  });

  it('uses the plan wording for the zero-normal cases', () => {
    const base = { calendarMonth: 2, year: 2024, ratio: null, excludeTargetYear: true };
    expect(
      summarySentence({
        ...base,
        cls: 'none_usual_none',
        value: 0,
        yearsActive: 0,
        baselineYears: 22,
      }),
    ).toBe('Usually no fire activity in February. None in 2024.');
    expect(
      summarySentence({
        ...base,
        cls: 'active_usual_none',
        value: 2,
        yearsActive: 4,
        baselineYears: 22,
      }),
    ).toBe(
      'Usually no fire activity in February. In 2024: 2 active cell-days. Fire activity in 4 of 22 other years.',
    );
  });
});

describe('history helpers', () => {
  // July and August active every year, March once, everything else zero.
  const s = seriesWith('2000-01', 312, (y, m) =>
    m === 7 ? 10 : m === 8 ? 12 : m === 3 && y === 2010 ? 30 : 0,
  );
  it('finds the typical months', () => {
    const t = typicalMonths(s, c);
    expect(t.typical).toEqual([7, 8]);
    expect(t.sentence).toBe('Fire activity is most common in July and August.');
  });
  it('says when there is no regular season', () => {
    const quiet = seriesWith('2000-01', 312, (y, m) => (m === 3 && y === 2010 ? 5 : 0));
    expect(typicalMonths(quiet, c).sentence).toBe(
      'No regular fire season in this area in the record.',
    );
    expect(recordSummary(quiet, c).sentence).toBe(
      'Fire activity was detected here in 1 of 23 years.',
    );
  });
  it('says when the record has no activity at all', () => {
    const none = seriesWith('2000-01', 312, () => 0);
    expect(recordSummary(none, c).sentence).toBe(
      'No fire activity was detected here in the record (2000 to 2025).',
    );
  });
  it('lists unusual months newest first', () => {
    const u = unusualMonths(allMonthResults(s, c));
    expect(u.map((r) => r.month)).toEqual(['2010-03']);
    const r = monthResult(s, (2010 - 2000) * 12 + 2, c);
    expect(r.classification.cls).toBe('active_usual_none');
  });
});

describe('estimated months of small places (plan S1)', () => {
  const est = cfg({ status_ranges: [{ from: '2000-01', to: '2011-12', status: 'estimated' }] });
  // Quiet every year except a big March 2010, which would otherwise be much_above.
  const place = (cells: number | undefined) => {
    const s = seriesWith('2000-01', 312, (y, m) => (y === 2010 && m === 3 ? 50 : m === 3 ? 5 : 0));
    s.cells = cells;
    return s;
  };
  const t = (2010 - 2000) * 12 + 2;

  it('a small place gets estimated_only, no unusual flag, no ratio', () => {
    const r = monthResult(place(7), t, est);
    expect(r.classification.cls).toBe('estimated_only');
    expect(r.classification.code).toBe(CLASS_CODE.estimated_only);
    expect(r.classification.unusual).toBe(false);
    expect(r.classification.ratio).toBeNull();
    expect(r.sentence).toBe(
      'March 2010: 50 active cell-days, estimated from MODIS. ' +
        'This area is too small to compare estimated months with normal.',
    );
    expect(unusualMonths(allMonthResults(place(7), est))).toEqual([]);
  });

  it('a large place and the world series are still compared', () => {
    expect(monthResult(place(343), t, est).classification.cls).toBe('much_above');
    expect(monthResult(place(undefined), t, est).classification.cls).toBe('much_above');
  });

  it('observed months of a small place are still compared', () => {
    const s = seriesWith('2000-01', 312, (y, m) => (y === 2020 && m === 3 ? 50 : m === 3 ? 5 : 0));
    s.cells = 7;
    expect(monthResult(s, (2020 - 2000) * 12 + 2, est).classification.cls).toBe('much_above');
  });
});
