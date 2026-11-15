import { cellToChildren, cellToParent, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { ForecastMap, ForecastTile, forecastIndex } from '../../src/data/forecast';
import { parseHash, serializeHash, type UrlDefaults } from '../../src/state/url';
import {
  areaShares,
  forecastCsv,
  outlookLevel,
  outlookSentence,
  placeForecast,
  tileRows,
} from '../../src/stats/forecast';
import { sumCells } from '../../src/stats/series';
import { cfg, tileOf } from './helpers';

const N = 312; // 2000-01 to 2025-12
const AREA = latLngToCell(44.9, 7.4, 4);
const CHILDREN = cellToChildren(AREA, 6).sort();
const TILE_PARENT = cellToParent(AREA, 3);
/** Month index of a calendar month in a year, for a record that starts 2000-01. */
const mi = (year: number, month: number) => (year - 2000) * 12 + (month - 1);

/** Cell 0 burns every August (3 cell-days), cell 1 every March (1) and every August (1). */
function tile() {
  const a: [number, number][] = [];
  const b: [number, number][] = [];
  for (let y = 2003; y <= 2025; y++) {
    a.push([mi(y, 8), 3]);
    b.push([mi(y, 3), 1], [mi(y, 8), 1]);
  }
  return tileOf(TILE_PARENT, N, { [CHILDREN[0]!]: a, [CHILDREN[1]!]: b });
}

const ROWS = {
  p10: [0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0],
  p50: [0, 0, 1, 0, 0, 0, 0, 4, 0, 0, 0, 0],
  p90: [0, 0, 2, 0, 0, 0, 0, 8, 0, 0, 0, 0],
};
const FC = { start: '2026-01', n_months: 12 };

function forecastOf(cells: string[]) {
  const t = tile();
  const tileFor = () => t;
  const series = sumCells(cells, tileFor, '2000-01', N);
  return placeForecast(cells, series, tileFor, (a) => (a === AREA ? ROWS : null), FC, cfg());
}

describe('area shares', () => {
  it('is the share of the area activity in the same calendar month', () => {
    const t = tile();
    const place = sumCells([CHILDREN[0]!], () => t, '2000-01', N).h;
    const area = sumCells(CHILDREN, () => t, '2000-01', N).h;
    const s = areaShares(place, area, '2000-01', cfg(), 1 / CHILDREN.length);
    expect(s[7]).toBeCloseTo(0.75); // August: 3 of 4
    expect(s[2]).toBe(0); // March: the other cell only
    // A month without any activity in the area falls back to the share over all months.
    expect(s[0]).toBeCloseTo(3 / 5);
  });

  it('falls back to the share of cells when the area never burned', () => {
    const zeros = new Float64Array(N);
    expect(areaShares(zeros, zeros, '2000-01', cfg(), 0.25)).toEqual(new Array(12).fill(0.25));
  });
});

describe('place forecast', () => {
  it('a place that covers the whole area takes the area forecast as it is', () => {
    const f = forecastOf(CHILDREN);
    expect(Array.from(f.p50)).toEqual(ROWS.p50);
    expect(Array.from(f.p10)).toEqual(ROWS.p10);
    expect(Array.from(f.p90)).toEqual(ROWS.p90);
    expect(f.areas).toBe(1);
    expect(f.partAreas).toBe(0);
  });

  it('parts of an area add up to the area forecast', () => {
    const a = forecastOf([CHILDREN[0]!]);
    const b = forecastOf(CHILDREN.slice(1));
    expect(a.partAreas).toBe(1);
    expect(a.p50[7]).toBeCloseTo(3); // 75% of 4
    expect(a.p50[2]).toBe(0);
    for (let k = 0; k < 12; k++) {
      expect(a.p50[k]! + b.p50[k]!).toBeCloseTo(ROWS.p50[k]!);
      expect(a.p90[k]! + b.p90[k]!).toBeCloseTo(ROWS.p90[k]!);
    }
  });

  it('carries the usual value of the place for each forecast month', () => {
    const f = forecastOf([CHILDREN[0]!]);
    expect(f.usual[7]).toBe(3);
    expect(f.usual[0]).toBe(0);
  });

  it('an area without forecast rows counts as zero', () => {
    const t = tile();
    const series = sumCells(CHILDREN, () => t, '2000-01', N);
    const f = placeForecast(
      CHILDREN,
      series,
      () => t,
      () => null,
      FC,
      cfg(),
    );
    expect(Array.from(f.p50)).toEqual(new Array(12).fill(0));
  });

  it('words and levels follow the usual range', () => {
    const f = forecastOf([CHILDREN[0]!]);
    expect(outlookLevel(f, 0)).toBe('none');
    expect(outlookSentence(f, 0)).toBe('No fire activity expected. Usually none in January.');
    expect(outlookLevel(f, 7)).toBe('usual');
    expect(outlookSentence(f, 7)).toBe(
      'About 3 active cell-days expected, about the usual for August.',
    );
    f.p50[7] = 9;
    expect(outlookLevel(f, 7)).toBe('above');
  });

  it('writes one CSV row per forecast month', () => {
    const lines = forecastCsv(forecastOf(CHILDREN), ['a place']).trim().split('\n');
    expect(lines[0]).toBe('# a place');
    const rows = lines.filter((l) => !l.startsWith('#'));
    expect(rows[0]).toBe('month,p10,p50,p90,usual,status');
    expect(rows).toHaveLength(13);
    expect(rows[8]).toBe('2026-08,2,4,8,4,forecast');
  });
});

describe('forecast files', () => {
  const tileFile = {
    parent: cellToParent(AREA, 1),
    start: '2026-01',
    n_months: 12,
    cells: [AREA],
    ...ROWS,
  };

  it('finds the rows of an area in a tile', () => {
    expect(tileRows(tileFile, AREA)).toEqual(ROWS);
    expect(tileRows(tileFile, latLngToCell(10, 10, 4))).toBeNull();
    expect(tileRows(null, AREA)).toBeNull();
  });

  it('rejects a tile whose value arrays do not match its cells', () => {
    expect(ForecastTile.safeParse(tileFile).success).toBe(true);
    expect(ForecastTile.safeParse({ ...tileFile, p50: [1, 2] }).success).toBe(false);
    expect(ForecastMap.safeParse({ month: '2026-01', res: 4, cell: [AREA], v: [] }).success).toBe(
      false,
    );
  });

  it('indexes forecast months', () => {
    expect(forecastIndex(FC, '2026-03')).toBe(2);
    expect(forecastIndex(FC, '2027-01')).toBe(-1);
    expect(forecastIndex(null, '2026-03')).toBe(-1);
  });
});

describe('outlook month in the URL', () => {
  const d: UrlDefaults = {
    view: { zoom: 2, lat: 25, lon: 10 },
    month: '2026-10',
    record: { start: '2000-11', end: '2026-11' },
    forecast: { start: '2027-01', end: '2027-12' },
  };

  it('round-trips a forecast month', () => {
    const { state, hadInvalid } = parseHash('#map=2.00/25.0000/10.0000&outlook=2027-03', d);
    expect(hadInvalid).toBe(false);
    expect(state.outlook).toBe('2027-03');
    expect(serializeHash(state, d)).toBe('#map=2.00/25.0000/10.0000&outlook=2027-03');
  });

  it('drops a month outside the forecast, or any when the build has none', () => {
    expect(parseHash('#outlook=2026-12', d)).toMatchObject({ hadInvalid: true });
    expect(parseHash('#outlook=2026-12', d).state.outlook).toBeUndefined();
    expect(parseHash('#outlook=2027-03', { ...d, forecast: null }).hadInvalid).toBe(true);
  });
});
