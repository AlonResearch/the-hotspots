import { describe, expect, it } from 'vitest';
import { cellToChildren, cellToParent, latLngToCell } from 'h3-js';
import { DetailTile, Manifest, Overview, Summary, formatIssues } from '../../src/data/contract';
import { validateDataFolder } from '../../src/data/validate';
import { sampleManifest } from './helpers';

const cellA = latLngToCell(37.6, 14.2, 6);
const cellB = cellToChildren(cellToParent(cellA, 5), 6).find((c) => c !== cellA)!;
const parent3 = cellToParent(cellA, 3);
const [c1, c2] = [cellA, cellB].sort();

function sampleTile() {
  return {
    parent: parent3,
    res: 6,
    start: '2011-12',
    n_months: 4,
    cells: [c1, c2],
    offsets: [0, 2, 3],
    mi: [0, 2, 2],
    h: [6.2, 3, 2],
    lo: [5.1, 3, 2],
    hi: [7.4, 3, 2],
    modis: [2, 1, 1],
    viirs: [0, 3, 2],
    sat: { snpp: [0, 3, 2] },
  };
}

function issuesOf(result: { success: boolean; error?: unknown }): string {
  expect(result.success).toBe(false);
  return formatIssues(result.error as never);
}

describe('contract schemas', () => {
  it('accepts hand-written valid samples', () => {
    expect(Manifest.safeParse(sampleManifest()).success).toBe(true);
    expect(DetailTile.safeParse(sampleTile()).success).toBe(true);
    expect(
      Overview.safeParse({
        month: '2024-08',
        res: 4,
        cell: ['841e9a3ffffffff'],
        h: [41],
        lo: [41],
        hi: [41],
        modis: [17],
        viirs: [41],
        cls: [5],
      }).success,
    ).toBe(true);
  });

  it('rejects a wrong type with the path', () => {
    const bad = { ...sampleTile(), n_months: 'four' };
    expect(issuesOf(DetailTile.safeParse(bad))).toMatch(/n_months/);
    const m = { ...sampleManifest(), record: { start: '2011-13', end: '2012-03' } };
    expect(issuesOf(Manifest.safeParse(m))).toMatch(/record\.start/);
  });

  it('rejects unequal array lengths with the path', () => {
    const bad = { ...sampleTile(), viirs: [0, 3] };
    expect(issuesOf(DetailTile.safeParse(bad))).toMatch(
      /viirs.*length 2, expected 3|length 2, expected 3[\s\S]*viirs/,
    );
    const s = {
      start: '2011-12',
      n_months: 3,
      h: [1, 2, 3],
      lo: [1, 2, 3],
      hi: [1, 2],
      modis: [0, 0, 0],
      viirs: [0, 0, 0],
    };
    expect(issuesOf(Summary.safeParse(s))).toMatch(/hi/);
  });

  it('rejects unsorted mi within a cell', () => {
    const bad = { ...sampleTile(), mi: [2, 0, 2] };
    expect(issuesOf(DetailTile.safeParse(bad))).toMatch(/mi\[1\]|mi.*1/);
  });

  it('rejects lo above h', () => {
    const bad = { ...sampleTile(), lo: [7, 3, 2] };
    expect(issuesOf(DetailTile.safeParse(bad))).toMatch(/lo 7 is above h 6\.2[\s\S]*lo/);
  });

  it('rejects overlapping status ranges and a descending ladder', () => {
    const m = sampleManifest({
      status_ranges: [
        { from: '2011-12', to: '2012-02', status: 'estimated' },
        { from: '2012-02', to: '2012-03', status: 'provisional' },
      ],
    });
    expect(issuesOf(Manifest.safeParse(m))).toMatch(/overlap/);
  });
});

describe('validateDataFolder', () => {
  function folder(overrides: Record<string, unknown> = {}) {
    const months = ['2011-12', '2012-01', '2012-02', '2012-03'];
    const files: Record<string, unknown> = {
      'manifest.json': sampleManifest(),
      'places.json': [{ id: 'x', name: 'X', lat: 1, lon: 2 }],
      'detail/index.json': { tile_res: 3, tiles: [parent3] },
      [`detail/${parent3}.json`]: sampleTile(),
    };
    // Sums of the tile per month (rule 1 and rule 2).
    const tile = sampleTile();
    const perMonth = months.map(() => ({ h: 0, lo: 0, hi: 0, modis: 0, viirs: 0 }));
    tile.mi.forEach((mi, i) => {
      const s = perMonth[mi]!;
      s.h += tile.h[i]!;
      s.lo += tile.lo[i]!;
      s.hi += tile.hi[i]!;
      s.modis += tile.modis[i]!;
      s.viirs += tile.viirs[i]!;
    });
    months.forEach((month, mi) => {
      const s = perMonth[mi]!;
      const r1 = (x: number) => Math.round(x * 10) / 10;
      for (const res of [3, 4] as const) {
        const active = s.h > 0 || s.modis > 0 || s.viirs > 0;
        files[`overview/r${res}/${month}.json`] = {
          month,
          res,
          cell: active ? [cellToParent(cellA, res)] : [],
          h: active ? [r1(s.h)] : [],
          lo: active ? [r1(s.lo)] : [],
          hi: active ? [r1(s.hi)] : [],
          modis: active ? [s.modis] : [],
          viirs: active ? [r1(s.viirs)] : [],
        };
      }
    });
    files['summary/global.json'] = {
      start: '2011-12',
      n_months: 4,
      h: perMonth.map((s) => s.h),
      lo: perMonth.map((s) => s.lo),
      hi: perMonth.map((s) => s.hi),
      modis: perMonth.map((s) => s.modis),
      viirs: perMonth.map((s) => s.viirs),
    };
    Object.assign(files, overrides);
    return async (p: string) => files[p];
  }

  it('passes a consistent folder', async () => {
    const r = await validateDataFolder(folder());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('fails when an overview value differs from the detail sum (rule 1)', async () => {
    const r = await validateDataFolder(
      folder({
        'overview/r3/2012-02.json': {
          month: '2012-02',
          res: 3,
          cell: [parent3],
          h: [9],
          lo: [9],
          hi: [9],
          modis: [2],
          viirs: [9],
        },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/rule 1/);
  });

  it('fails on a missing file and on rule 3', async () => {
    const tile = sampleTile();
    tile.lo[1] = 2; // month index 2 is 2012-02, at the reference month
    const r = await validateDataFolder(
      folder({ 'places.json': undefined, [`detail/${parent3}.json`]: tile }),
    );
    expect(r.errors.join('\n')).toMatch(/places\.json: missing/);
    expect(r.errors.join('\n')).toMatch(/rule 3/);
  });
});
