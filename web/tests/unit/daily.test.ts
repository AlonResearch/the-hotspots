import { cellToParent, gridDisk, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { DetailTile, Manifest } from '../../src/data/contract';
import { toTileData, type TileData } from '../../src/data/tile';
import {
  cellInDailyArea,
  daysFromPairs,
  daysWithData,
  placeDays,
  rollingSum,
  runningTotal,
  splitMonth,
} from '../../src/stats/daily';
import { sampleManifest } from './helpers';

const sum = (a: ArrayLike<number>) => Array.from(a).reduce((x, y) => x + y, 0);
const mask = (...days: number[]) => days.reduce((m, d) => m | (1 << (d - 1)), 0);

const AREA = {
  name: 'Test area',
  bbox: [7.0, 44.5, 8.0, 45.5] as [number, number, number, number],
};
const inside = latLngToCell(45.0, 7.5, 6);
const outside = latLngToCell(45.0, 9.0, 6);

describe('daily area (plan 4.6)', () => {
  it('a res 6 cell is in the area when its centre is in a box', () => {
    expect(cellInDailyArea(inside, [AREA])).toBe(true);
    expect(cellInDailyArea(outside, [AREA])).toBe(false);
  });

  it('a partial month has data only for its covered days', () => {
    const m = { partial_months: [{ month: '2026-11', days_covered: 14, days_in_month: 30 }] };
    expect(daysWithData(m, '2026-11')).toBe(14);
    expect(daysWithData(m, '2026-10')).toBe(31);
  });
});

describe('splitting a month over its days', () => {
  it('before the reference month: evenly over the MODIS days, summing to h', () => {
    const d = splitMonth(
      6,
      { modis: mask(2, 5, 9), snpp: 0, noaa20: 0 },
      '2005-08',
      '2012-02',
      undefined,
    )!;
    expect(d).toHaveLength(31);
    expect(d[1]).toBeCloseTo(2);
    expect(d[4]).toBeCloseTo(2);
    expect(d[8]).toBeCloseTo(2);
    expect(sum(d)).toBeCloseTo(6);
  });

  it('from the reference month: VIIRS weights times each satellite bit', () => {
    // S-NPP on days 1 and 2, NOAA-20 on day 2: weights 0.5 each, day 2 counts twice day 1.
    const d = splitMonth(
      3,
      { modis: mask(30), snpp: mask(1, 2), noaa20: mask(2) },
      '2020-07',
      '2012-02',
      { snpp: 0.5, noaa20: 0.5 },
    )!;
    expect(d[0]).toBeCloseTo(1);
    expect(d[1]).toBeCloseTo(2);
    expect(d[29]).toBe(0); // MODIS days do not count after the reference month
    expect(sum(d)).toBeCloseTo(3);
  });

  it('a value with no day to go to cannot be split', () => {
    expect(splitMonth(2, { modis: 0, snpp: 0, noaa20: 0 }, '2005-08', '2012-02', undefined)).toBe(
      null,
    );
    expect(
      sum(splitMonth(0, { modis: 0, snpp: 0, noaa20: 0 }, '2005-08', '2012-02', undefined)!),
    ).toBe(0);
  });

  it('overview pairs fill only their days', () => {
    const d = daysFromPairs(
      [
        [3, 1.5],
        [10, 2],
      ],
      '2017-02',
    );
    expect(d).toHaveLength(28);
    expect(d[2]).toBe(1.5);
    expect(d[9]).toBe(2);
    expect(sum(d)).toBeCloseTo(3.5);
  });
});

describe('daily views', () => {
  it('running total ends at the month value', () => {
    expect(Array.from(runningTotal([1, 0, 2, 3]))).toEqual([1, 1, 3, 6]);
    expect(Array.from(runningTotal([1, 0, 2, 3], 2))).toEqual([1, 1]);
  });

  it('rolling sum covers the last days only', () => {
    expect(Array.from(rollingSum([1, 1, 1, 1, 1, 1, 1], 5))).toEqual([1, 2, 3, 4, 5, 5, 5]);
    expect(Array.from(rollingSum([4, 0, 0, 0, 0, 0], 5))).toEqual([4, 4, 4, 4, 4, 0]);
  });
});

describe('place days', () => {
  const parent = cellToParent(inside, 3);
  const ring = gridDisk(inside, 1).sort();
  const start = '2000-01';
  const t = 12 * 20 + 7; // 2020-08
  function tileWith(daily: boolean): TileData {
    const raw: DetailTile = {
      parent,
      res: 6,
      start,
      n_months: 320,
      cells: [ring[0]!, ring[1]!],
      offsets: [0, 1, 2],
      mi: [t, t],
      h: [2, 3],
      lo: [2, 3],
      hi: [2, 3],
      modis: [0, 0],
      viirs: [2, 3],
      ...(daily
        ? {
            daily: {
              rows: [0, 1],
              dm_modis: [0, 0],
              dm_snpp: [mask(1, 2), mask(3, 4, 5)],
              dm_noaa20: [0, 0],
            },
          }
        : {}),
    };
    return toTileData(DetailTile.parse(raw));
  }
  const manifest = (over: Partial<Manifest> = {}) =>
    sampleManifest({
      record: { start, end: '2026-11' },
      first_reference_month: '2012-02',
      daily: { areas: [AREA], res6_cells: 100, days: 'utc' },
      ...over,
    });
  const method = { noaa20_scale_applied: false, viirs_weights: { '2020-08': { snpp: 1 } } };

  it('sums the cells and matches the monthly value', () => {
    const tile = tileWith(true);
    const days = placeDays(ring, () => tile, '2020-08', manifest(), method)!;
    expect(days).toHaveLength(31);
    expect(days[0]).toBeCloseTo(1);
    expect(days[2]).toBeCloseTo(1);
    expect(sum(days)).toBeCloseTo(5);
  });

  it('is absent when any cell is outside the daily area (no partial sums)', () => {
    const tile = tileWith(true);
    expect(placeDays([...ring, outside], () => tile, '2020-08', manifest(), method)).toBe(null);
  });

  it('is absent without daily fields, without method weights, or with the NOAA-20 scale', () => {
    expect(placeDays(ring, () => tileWith(false), '2020-08', manifest(), method)).toBe(null);
    expect(
      placeDays(ring, () => tileWith(true), '2020-08', manifest({ daily: undefined }), method),
    ).toBe(null);
    expect(placeDays(ring, () => tileWith(true), '2020-08', manifest(), null)).toBe(null);
    expect(
      placeDays(ring, () => tileWith(true), '2020-08', manifest(), {
        ...method,
        noaa20_scale_applied: true,
      }),
    ).toBe(null);
    expect(
      placeDays(ring, () => tileWith(true), '2020-08', manifest(), {
        ...method,
        viirs_weights: {},
      }),
    ).toBe(null);
  });

  it('a quiet month of a covered place is all zeros, not absent', () => {
    const days = placeDays(ring, () => tileWith(true), '2020-09', manifest(), {
      ...method,
      viirs_weights: { '2020-09': { snpp: 1 } },
    })!;
    expect(days).toHaveLength(30);
    expect(sum(days)).toBe(0);
  });
});
