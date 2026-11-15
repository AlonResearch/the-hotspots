import { describe, expect, it } from 'vitest';
import { cellToParent, gridDisk, latLngToCell } from 'h3-js';
import { baselineFor, baselineValues } from '../../src/stats/baseline';
import { median, quantile } from '../../src/stats/quantile';
import { classify } from '../../src/stats/classify';
import { sumCells } from '../../src/stats/series';
import { cfg, seriesWith, tileOf } from './helpers';

describe('quantile (type 7)', () => {
  it('matches hand-computed values for odd n', () => {
    const v = [5, 1, 3, 2, 4];
    expect(median(v)).toBe(3);
    expect(quantile(v, 25)).toBe(2);
    expect(quantile(v, 90)).toBeCloseTo(4.6, 10);
  });
  it('matches hand-computed values for even n', () => {
    const v = [1, 2, 3, 4];
    expect(median(v)).toBe(2.5);
    expect(quantile(v, 25)).toBeCloseTo(1.75, 10);
    expect(quantile(v, 75)).toBeCloseTo(3.25, 10);
    expect(quantile(v, 90)).toBeCloseTo(3.7, 10);
  });
  it('handles ties and all zeros', () => {
    expect(median([2, 2, 2, 5])).toBe(2);
    expect(quantile([0, 0, 0, 0], 90)).toBe(0);
    expect(quantile([0, 0, 0, 7], 90)).toBeCloseTo(4.9, 10);
    expect(Number.isNaN(quantile([], 50))).toBe(true);
  });
});

describe('baseline', () => {
  // Value of August in year y is y - 2000; other months zero.
  const s = seriesWith('2000-01', 312, (y, m) => (m === 8 ? y - 2000 : 0));
  const t2010Aug = (2010 - 2000) * 12 + 7;

  it('excludes the target year when the flag is true and includes it when false', () => {
    const on = baselineFor(s.h, s.start, t2010Aug, cfg());
    expect(on.years).not.toContain(2010);
    expect(on.n).toBe(22);
    const off = baselineFor(
      s.h,
      s.start,
      t2010Aug,
      cfg({
        baseline: { start_year: 2003, end_year: 2025, min_years: 10, exclude_target_year: false },
      }),
    );
    expect(off.years).toContain(2010);
    expect(off.n).toBe(23);
    expect(off.normal).toBe(14);
  });

  it('ignores years outside start_year to end_year', () => {
    const b = baselineValues(s.h, s.start, 8, cfg(), null);
    expect(b.years[0]).toBe(2003);
    expect(b.years[b.years.length - 1]).toBe(2025);
  });

  it('never uses partial months or months outside the record', () => {
    const c = cfg({
      record: { start: '2005-03', end: '2025-12' },
      partial_months: [{ month: '2012-08', days_covered: 10, days_in_month: 31 }],
    });
    const b = baselineValues(s.h, s.start, 8, c, null);
    expect(b.years).not.toContain(2012);
    expect(b.years).not.toContain(2003);
    expect(b.years).not.toContain(2004);
    expect(b.years[0]).toBe(2005);
  });

  it('never uses estimated months, but keeps provisional ones', () => {
    // January is 1 in every year except 2012, which is large.
    const jan = seriesWith('2000-01', 312, (y, m) => (m === 1 ? (y === 2012 ? 500 : 1) : 0));
    const base = {
      baseline: { start_year: 2012, end_year: 2025, min_years: 10, exclude_target_year: true },
    };
    const t2020Jan = (2020 - 2000) * 12;
    const plain = baselineFor(jan.h, jan.start, t2020Jan, cfg(base));
    expect(plain.years).toContain(2012);
    expect(plain.n).toBe(13);
    const est = cfg({
      ...base,
      status_ranges: [{ from: '2000-01', to: '2012-01', status: 'estimated' }],
    });
    const b = baselineFor(jan.h, jan.start, t2020Jan, est);
    expect(b.years).not.toContain(2012);
    expect(b.n).toBe(12);
    expect(b.max).toBe(1);
    const prov = cfg({
      ...base,
      status_ranges: [{ from: '2012-01', to: '2012-01', status: 'provisional' }],
    });
    expect(baselineFor(jan.h, jan.start, t2020Jan, prov).years).toContain(2012);
  });

  it('gives insufficient when n is under min_years', () => {
    const c = cfg({
      baseline: { start_year: 2020, end_year: 2025, min_years: 10, exclude_target_year: true },
    });
    const b = baselineFor(s.h, s.start, t2010Aug, c);
    const r = classify({ h: 1, lo: 1, hi: 1 }, b, false, c.classes, c.baseline.min_years);
    expect(r.cls).toBe('insufficient');
  });

  it('is computed from the summed series, not per-cell baselines', () => {
    // Three cells, each active in August one year in three. Each has a median of 0;
    // their sum is active every year and has a median of 4.
    const cell = latLngToCell(45, 7.6, 6);
    const cells = gridDisk(cell, 1).sort().slice(0, 3);
    const p = cellToParent(cell, 3);
    const entries = (r: number) =>
      Array.from({ length: 26 }, (_, i) => 2000 + i)
        .filter((y) => y % 3 === r)
        .map((y) => [(y - 2000) * 12 + 7, 4] as [number, number]);
    const tile = tileOf(p, 312, Object.fromEntries(cells.map((c, r) => [c, entries(r)])));
    const lookup = () => tile;
    const t = (2015 - 2000) * 12 + 7;
    for (const c of cells) {
      expect(baselineFor(sumCells([c], lookup, '2000-01', 312).h, '2000-01', t, cfg()).normal).toBe(
        0,
      );
    }
    const both = baselineFor(sumCells(cells, lookup, '2000-01', 312).h, '2000-01', t, cfg());
    expect(both.normal).toBe(4);
    expect(both.years_active).toBe(22);
  });
});
