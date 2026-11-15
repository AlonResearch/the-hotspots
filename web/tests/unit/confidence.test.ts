import { describe, expect, it } from 'vitest';
import { mapCellAlpha, mapConfidence, cellAlpha } from '../../src/map/density';
import { confidenceNote, confidenceOf, res6CellsIn } from '../../src/stats/confidence';
import { statsConfig } from '../../src/stats/config';
import { allMonthResults, monthResult, unusualMonths } from '../../src/stats/history';
import { opacity } from '../../src/styles/tokens';
import { cfg, seriesWith } from './helpers';

describe('confidenceOf (D27)', () => {
  it('observed months are high at every size', () => {
    for (const cells of [1, 7, 49, 343, undefined]) {
      expect(confidenceOf('observed', '2015-07', cells)).toEqual({
        level: 'high',
        reason: 'observed',
      });
    }
  });

  it('provisional months are medium at every size', () => {
    expect(confidenceOf('provisional', '2026-09', 1).level).toBe('medium');
    expect(confidenceOf('provisional', '2026-09', undefined).reason).toBe('provisional');
  });

  it('estimated months: low under 49 res 6 cells, medium from 49 on and for the world', () => {
    expect(confidenceOf('estimated', '2008-07', 1)).toEqual({ level: 'low', reason: 'small' });
    expect(confidenceOf('estimated', '2008-07', 48).level).toBe('low');
    expect(confidenceOf('estimated', '2008-07', 49)).toEqual({
      level: 'medium',
      reason: 'estimated',
    });
    expect(confidenceOf('estimated', '2008-07', undefined).level).toBe('medium');
    expect(statsConfig.estimatedCompareMinCells).toBe(49);
  });

  it('Terra-only months are low at every size', () => {
    expect(confidenceOf('estimated', '2001-06', 100_000)).toEqual({
      level: 'low',
      reason: 'terra',
    });
    expect(confidenceOf('estimated', '2002-09', undefined).level).toBe('low');
    expect(confidenceOf('estimated', '2002-10', undefined).level).toBe('medium');
  });

  it('gives a plain line for every level but high', () => {
    expect(confidenceNote('observed')).toBeNull();
    expect(confidenceNote('small')).toBe(
      'Before 2012 this area is too small for a reliable estimate. Heights are not comparable with later years.',
    );
    expect(confidenceNote('terra')).toMatch(/Terra/);
  });
});

describe('map cells', () => {
  it('a res r cell holds 7^(6-r) res 6 cells', () => {
    expect([6, 5, 4, 3].map(res6CellsIn)).toEqual([1, 7, 49, 343]);
  });

  it('estimated months: res 5 and 6 low, res 3 and 4 medium; raw views have no level', () => {
    expect(mapConfidence('estimated', '2008-07', 6, 'harmonized')).toBe('low');
    expect(mapConfidence('estimated', '2008-07', 5, 'harmonized')).toBe('low');
    expect(mapConfidence('estimated', '2008-07', 4, 'harmonized')).toBe('medium');
    expect(mapConfidence('estimated', '2008-07', 3, 'harmonized')).toBe('medium');
    expect(mapConfidence('estimated', '2001-08', 3, 'harmonized')).toBe('low');
    expect(mapConfidence('observed', '2020-07', 6, 'harmonized')).toBe('high');
    expect(mapConfidence('estimated', '2008-07', 6, 'raw-modis')).toBeNull();
  });

  it('low cells are drawn faded', () => {
    expect(mapCellAlpha(6, 'low')).toBeCloseTo(cellAlpha(6) * opacity.lowConfidence);
    expect(mapCellAlpha(4, 'medium')).toBe(cellAlpha(4));
    expect(mapCellAlpha(6, null)).toBe(cellAlpha(6));
  });
});

describe('month results carry the level', () => {
  const est = cfg({ status_ranges: [{ from: '2000-01', to: '2011-12', status: 'estimated' }] });
  const big = (cells: number | undefined) => {
    const s = seriesWith('2000-01', 312, (y, m) => (y === 2001 && m === 8 ? 80 : m === 8 ? 5 : 0));
    s.cells = cells;
    return s;
  };
  const t = (2001 - 2000) * 12 + 7;

  it('a Terra-only month of a large place is low and not compared', () => {
    const r = monthResult(big(343), t, est);
    expect(r.confidence).toEqual({ level: 'low', reason: 'terra' });
    expect(r.classification.cls).toBe('estimated_only');
    expect(r.sentence).toBe(
      'August 2001: 80 active cell-days, estimated from Terra alone. ' +
        'Months before October 2002 are not compared with normal.',
    );
    expect(unusualMonths(allMonthResults(big(undefined), est))).toEqual([]);
  });

  it('an observed month is high', () => {
    expect(monthResult(big(7), (2015 - 2000) * 12, est).confidence.level).toBe('high');
  });
});
