import { describe, expect, it } from 'vitest';
import { cellToParent, getPentagons, latLngToCell, polygonToCells } from 'h3-js';
import {
  addMonths,
  indexToMonth,
  monthCount,
  monthStatus,
  monthToIndex,
  latestCompleteMonth,
} from '../../src/data/months';
import { cellSizeChip, initialRes, nextRes, type Res } from '../../src/grid/ladder';
import { resolvePlace, rectangleRing } from '../../src/grid/place';
import { bboxCells, fallbackOverlap, overlappingCells, type LonLat } from '../../src/grid/viewport';
import { seamStep } from '../../src/stats/seam';
import { sampleManifest } from './helpers';

const ladder = sampleManifest().ladder;

describe('ladder', () => {
  it('first render uses the plain thresholds', () => {
    expect(initialRes(0, ladder)).toBe(3);
    expect(initialRes(4.49, ladder)).toBe(3);
    expect(initialRes(4.5, ladder)).toBe(4);
    expect(initialRes(6.1, ladder)).toBe(5);
    expect(initialRes(12, ladder)).toBe(6);
  });

  it('shows hysteresis on rising and falling zoom around each threshold', () => {
    const walk = (zooms: number[], start: Res) => {
      let r = start;
      return zooms.map((z) => (r = nextRes(r, z, ladder, 0.3)));
    };
    expect(walk([4.4, 4.6, 4.4, 4.6, 4.79, 4.8, 4.3, 4.2, 4.19], 3)).toEqual([
      3, 3, 3, 3, 3, 4, 4, 4, 3,
    ]);
    expect(walk([6.2, 6.29, 6.3, 5.8, 5.7, 5.69], 4)).toEqual([4, 4, 5, 5, 5, 4]);
    expect(walk([7.7, 7.8, 7.3, 7.2, 7.19], 5)).toEqual([5, 6, 6, 6, 5]);
    expect(walk([12, 1], 3)).toEqual([6, 3]);
  });

  it('chip text names the cell size', () => {
    expect(cellSizeChip(3, ladder)).toBe('Cells: about 12,400 km²');
    expect(cellSizeChip(4, ladder)).toBe('Cells: about 1,770 km²');
    expect(cellSizeChip(5, ladder)).toBe('Cells: about 250 km²');
    expect(cellSizeChip(6, ladder)).toBe('Finest cell: 36 km² (3,600 ha)');
  });
});

describe('place resolution', () => {
  it('a cell place at res 4 gives 49 res 6 cells', () => {
    const c4 = latLngToCell(44.9, 7.6, 4);
    const r = resolvePlace({ kind: 'cell', cell: c4 }, 5000);
    expect(r.ok && r.cells.length).toBe(49);
  });

  it('gives fewer under a pentagon', () => {
    const p4 = getPentagons(4)[0]!;
    const r = resolvePlace({ kind: 'cell', cell: p4 }, 5000);
    expect(r.ok && r.cells.length).toBeLessThan(49);
  });

  it('a point place gives 7 cells', () => {
    const r = resolvePlace({ kind: 'point', lat: 44.64, lon: 7.93 }, 5000);
    expect(r.ok && r.cells.length).toBe(7);
  });

  it('a tiny polygon gives at least 7 cells and is marked expanded', () => {
    // About 50 ha.
    const ring: LonLat[] = rectangleRing([7.93, 44.64], [7.939, 44.6464]);
    const r = resolvePlace({ kind: 'shape', ring }, 5000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cells.length).toBeGreaterThanOrEqual(7);
    expect(r.expanded).toBe(true);
    expect(r.shapeKm2).toBeGreaterThan(0.3);
    expect(r.shapeKm2).toBeLessThan(0.8);
  });

  it('rejects a polygon over the limit and accepts one under it', () => {
    // About 310,000 km², over the 5,000-cell limit (about 180,000 km²).
    const big: LonLat[] = rectangleRing([4, 43], [11, 48]);
    expect(resolvePlace({ kind: 'shape', ring: big }, 5000)).toEqual({
      ok: false,
      reason: 'too-large',
    });
    // About 46,000 km², under the limit.
    const under = resolvePlace({ kind: 'shape', ring: rectangleRing([7, 44], [9.6, 46]) }, 5000);
    expect(under.ok).toBe(true);
    if (under.ok) expect(under.cells.length).toBeLessThanOrEqual(5000);
  });

  it('rejects invalid input', () => {
    expect(resolvePlace({ kind: 'cell', cell: 'nonsense' }, 5000).ok).toBe(false);
    expect(resolvePlace({ kind: 'point', lat: 99, lon: 0 }, 5000).ok).toBe(false);
  });
});

describe('overlap routines', () => {
  const ring: LonLat[] = [
    [7.5, 44.5],
    [7.9, 44.55],
    [7.8, 44.9],
    [7.55, 44.8],
  ];
  it('the fallback is a superset of centre-mode cells and includes every vertex cell', () => {
    const fb = new Set(fallbackOverlap(ring, 6));
    const centre = polygonToCells([[...ring, ring[0]!]], 6, true);
    for (const c of centre) expect(fb.has(c)).toBe(true);
    for (const [lon, lat] of ring) expect(fb.has(latLngToCell(lat, lon, 6))).toBe(true);
    expect(fb.size).toBeGreaterThan(centre.length);
  });
  it('the h3 overlap mode also covers every vertex', () => {
    const ov = new Set(overlappingCells(ring, 6));
    for (const [lon, lat] of ring) expect(ov.has(latLngToCell(lat, lon, 6))).toBe(true);
  });
  it('bbox cells cover the corners, also across the antimeridian', () => {
    const cells = new Set(bboxCells({ west: 170, south: -20, east: 190, north: -10 }, 3));
    expect(cells.has(latLngToCell(-15, 175, 3))).toBe(true);
    expect(cells.has(latLngToCell(-15, -175, 3))).toBe(true);
    const world = bboxCells({ west: -400, south: -90, east: 400, north: 90 }, 0);
    expect(world.length).toBeGreaterThan(100);
    expect(new Set(world.map((c) => cellToParent(c, 0))).size).toBe(world.length);
  });
});

describe('months', () => {
  it('index to month and back', () => {
    expect(monthToIndex('2000-11', '2000-11')).toBe(0);
    expect(monthToIndex('2000-11', '2012-02')).toBe(135);
    expect(indexToMonth('2000-11', 135)).toBe('2012-02');
    expect(addMonths('2000-11', 2)).toBe('2001-01');
    expect(addMonths('2001-01', -1)).toBe('2000-12');
  });
  it('month count of the record', () => {
    expect(monthCount('2000-11', '2026-11')).toBe(313);
  });
  it('status lookup at range edges', () => {
    const m = sampleManifest({
      status_ranges: [
        { from: '2000-11', to: '2012-01', status: 'estimated' },
        { from: '2026-08', to: '2026-11', status: 'provisional' },
      ],
    });
    expect(monthStatus(m, '2000-11')).toBe('estimated');
    expect(monthStatus(m, '2012-01')).toBe('estimated');
    expect(monthStatus(m, '2012-02')).toBe('observed');
    expect(monthStatus(m, '2026-07')).toBe('observed');
    expect(monthStatus(m, '2026-08')).toBe('provisional');
    expect(monthStatus(m, '2026-11')).toBe('provisional');
  });
  it('latest complete month skips a partial end month', () => {
    expect(latestCompleteMonth(sampleManifest())).toBe('2012-02');
  });
});

describe('seam check', () => {
  it('recovers a known step', () => {
    const s = Array.from({ length: 100 }, (_, i) => (i < 50 ? 2 : 6));
    expect(seamStep(s, 50)).toBe(3);
    expect(seamStep(s, 20)).toBeNull();
    expect(seamStep(new Array(100).fill(0), 50)).toBeNull();
  });
});
