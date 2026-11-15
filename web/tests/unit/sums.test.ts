import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cellToChildren, cellToParent, gridDisk, latLngToCell } from 'h3-js';
import { DetailIndex, DetailTile, Manifest, Overview, Summary } from '../../src/data/contract';
import { addMonths, monthCount } from '../../src/data/months';
import { cellView, entryAt, findCell, toTileData, type TileData } from '../../src/data/tile';
import { areaKm2, centroid } from '../../src/grid/area';
import { contributions, contributionSentence } from '../../src/stats/contributions';
import { sumCells } from '../../src/stats/series';
import { tileOf } from './helpers';

const base = latLngToCell(45, 7.6, 6);
const parent3 = cellToParent(base, 3);
const ring = gridDisk(base, 1).sort();

describe('place series sums', () => {
  const tile = tileOf(parent3, 12, {
    [ring[0]!]: [
      [0, 2, 1, 2],
      [5, 4, 2, 4],
    ],
    [ring[1]!]: [
      [5, 6, 3, 6],
      [11, 1, 0, 1],
    ],
    [ring[2]!]: [[0, 3, 1, 3]],
  });
  const lookup = (c: string) => (cellToParent(c, 3) === parent3 ? tile : null);

  it('equals the element-wise sum of its cells for every value and sat key', () => {
    const s = sumCells(ring.slice(0, 3), lookup, '2000-01', 12);
    expect(Array.from(s.h)).toEqual([5, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 1]);
    expect(s.modis[5]).toBe(5);
    expect(s.viirs[0]).toBe(5);
    expect(s.sat.snpp?.[5]).toBe(10);
    expect(s.lo[5]).toBeCloseTo(8, 5);
    expect(s.hi[5]).toBeCloseTo(12, 5);
  });

  it('adds zero for a cell missing from every tile', () => {
    const far = latLngToCell(-30, 120, 6);
    const a = sumCells(ring.slice(0, 3), lookup, '2000-01', 12);
    const b = sumCells([...ring.slice(0, 3), far, ring[5]!], lookup, '2000-01', 12);
    expect(Array.from(b.h)).toEqual(Array.from(a.h));
  });

  it('typed-array views through offsets return the right entries', () => {
    const k0 = findCell(tile, ring[0]!);
    const k1 = findCell(tile, ring[1]!);
    const k2 = findCell(tile, ring[2]!);
    expect(Array.from(cellView(tile, k0).mi)).toEqual([0, 5]);
    expect(Array.from(cellView(tile, k1).h)).toEqual([6, 1]);
    expect(Array.from(cellView(tile, k2).modis)).toEqual([1]);
    expect(cellView(tile, k1).h.buffer).toBe(tile.h.buffer); // a view, not a copy
    expect(entryAt(tile, k1, 11)).toBe(tile.offsets[k1]! + 1);
    expect(entryAt(tile, k1, 6)).toBe(-1);
    expect(findCell(tile, ring[6]!)).toBe(-1);
  });
});

describe('area', () => {
  it('a 7-cell ring at 45 N is between 230 and 280 km²', () => {
    const a = areaKm2(gridDisk(latLngToCell(45, 10, 6), 1));
    expect(a).toBeGreaterThan(230);
    expect(a).toBeLessThan(280);
  });
});

describe('contributions', () => {
  const values: Record<string, number> = {};
  ring.forEach((c, i) => (values[c] = [10, 0, 3, 1, 0.5, 20, 0.2][i]!));
  const c = contributions(ring, (x) => values[x] ?? 0, centroid(ring), new Set([ring[5]!]))!;

  it('shares sum to 1', () => {
    expect(c.rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 10);
  });

  it('top contributors are sorted and respect the 5% floor', () => {
    expect(c.top.map((r) => r.value)).toEqual([20, 10, 3]);
    for (let i = 1; i < c.top.length; i++)
      expect(c.top[i - 1]!.share).toBeGreaterThanOrEqual(c.top[i]!.share);
    expect(c.top.every((r) => r.share >= 0.05)).toBe(true);
    expect(c.top[0]!.partlyOutside).toBe(true);
    expect(contributionSentence(c, 'August 2017')).toBe('3 cells make up 95% of August 2017.');
  });

  it('is null for one cell or a zero month', () => {
    expect(contributions([ring[0]!], () => 1, [45, 7.6], new Set())).toBeNull();
    expect(contributions(ring, () => 0, [45, 7.6], new Set())).toBeNull();
  });
});

// Contract rules 1 and 2 on the generated fixtures (run `npm run fixtures` first).
const DATA = join(__dirname, '../../public/data');
const read = (p: string): unknown => JSON.parse(readFileSync(join(DATA, p), 'utf8'));

describe.skipIf(!existsSync(join(DATA, 'manifest.json')))('fixture sums', () => {
  const manifest = Manifest.parse(read('manifest.json'));
  const index = DetailIndex.parse(read('detail/index.json'));
  const tiles = new Map<string, TileData>();
  for (const p of index.tiles) tiles.set(p, toTileData(DetailTile.parse(read(`detail/${p}.json`))));
  const lookup = (c: string) => tiles.get(cellToParent(c, index.tile_res)) ?? null;
  const n = monthCount(manifest.record.start, manifest.record.end);
  const months = Array.from({ length: n }, (_, i) => addMonths(manifest.record.start, i));

  it('res 5, 4 and 3 overview values equal the sums of their res 6 descendants in every month', () => {
    // One res 5, res 4 and res 3 cell per fixture region, checked in every month.
    const sample = index.tiles.filter((_, i) => i % 7 === 0);
    const cache = new Map<string, ReturnType<typeof sumCells>>();
    for (const t3 of sample) {
      const r4 = cellToChildren(t3, 4)[0]!;
      const r5 = cellToChildren(t3, 5)[3]!;
      for (const cell of [t3, r4, r5])
        cache.set(cell, sumCells(cellToChildren(cell, 6), lookup, manifest.record.start, n));
    }
    let checked = 0;
    months.forEach((month, t) => {
      for (const res of [3, 4] as const) {
        const o = Overview.parse(read(`overview/r${res}/${month}.json`));
        o.cell.forEach((cell, i) => {
          const s = cache.get(cell);
          if (!s) return;
          expect(Math.abs(s.h[t]! - o.h[i]!)).toBeLessThan(0.05 * 343 + 1e-6);
          checked++;
        });
      }
      for (const part of manifest.overview.r5_parts) {
        const o = Overview.parse(read(`overview/r5/${part}/${month}.json`));
        o.cell.forEach((cell, i) => {
          const s = cache.get(cell);
          if (!s) return;
          expect(Math.abs(s.h[t]! - o.h[i]!)).toBeLessThan(0.05 * 7 + 1e-6);
          checked++;
        });
      }
    });
    expect(checked).toBeGreaterThan(n);
  });

  it('the world summary equals the sum of the res 3 overview file', () => {
    const g = Summary.parse(read('summary/global.json'));
    months.forEach((month, t) => {
      const o = Overview.parse(read(`overview/r3/${month}.json`));
      const total = o.h.reduce((a, b) => a + b, 0);
      expect(Math.abs(total - g.h[t]!)).toBeLessThan(0.05 * Math.max(1, o.h.length) + 1e-6);
    });
  });
});
