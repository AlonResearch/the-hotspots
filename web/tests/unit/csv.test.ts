import { describe, expect, it } from 'vitest';
import { parsePlaceCsv, placeCsv } from '../../src/stats/csv';
import { allMonthResults } from '../../src/stats/history';
import { cfg, seriesWith } from './helpers';

describe('place CSV', () => {
  const s = seriesWith('2000-01', 312, (y, m) => (m === 8 ? (y % 7) + 0.25 : 0));
  const results = allMonthResults(s, cfg());
  const text = placeCsv(s, results, {
    place: 'Test, place',
    definition: 'p:44.6400,7.9300',
    areaKm2: 252.4,
    cells: 7,
    methodVersion: 'fixture-1',
    dataThrough: '2026-11-14',
    source: 'fixture',
  });

  it('has the header comment and one row per month', () => {
    expect(text.startsWith('# The Hotspots')).toBe(true);
    expect(text).toContain('# Place definition: p:44.6400,7.9300');
    expect(text).toContain('# Method version: fixture-1');
    const rows = parsePlaceCsv(text);
    expect(rows).toHaveLength(312);
    expect(Object.keys(rows[0]!)).toEqual([
      'month',
      'h',
      'lo',
      'hi',
      'modis',
      'viirs',
      'status',
      'class',
    ]);
  });

  it('the h column equals the series rounded to 1 decimal', () => {
    const rows = parsePlaceCsv(text);
    rows.forEach((r, t) =>
      expect(Math.abs(Number(r.h) - s.h[t]!)).toBeLessThanOrEqual(0.05 + 1e-9),
    );
  });
});
