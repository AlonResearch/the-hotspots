/**
 * Fixture generator (MVP Implementation Plan, section 5).
 *
 * Simulates fires on res 6 cells in six synthetic regions, observes them with two
 * imperfect sensor groups, harmonizes with the default method (a ratio per region
 * and season), and writes the full data contract v1 with source "fixture".
 * The extreme months are synthetic test events. They do not reproduce real fires.
 *
 * Deterministic: the same SEED gives byte-identical output.
 * Usage: npm run fixtures [-- <output folder>]   (default: public/data)
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  cellToChildren,
  cellToLatLng,
  cellToParent,
  greatCircleDistance,
  gridDisk,
  latLngToCell,
  UNITS,
} from 'h3-js';
import type {
  DetailIndex,
  DetailTile,
  Manifest,
  MethodTables,
  Overview,
  PresetPlace,
  Summary,
} from '../src/data/contract';
import { paths, type SatKey } from '../src/data/contract';
import { addMonths, daysInMonth, monthCount, parseMonth } from '../src/data/months';
import { validateDataFolder } from '../src/data/validate';
import { median, quantile } from '../src/stats/quantile';
import { seamStep } from '../src/stats/seam';
import { validateForecastFolder, writeForecastFiles, type AreaForecast } from './forecast-files';
import { folderReader } from './validate-data';

/** Seed constant. FIXTURE_SEED overrides it for experiments only; the published fixtures use the constant. */
export const SEED = Number(process.env.FIXTURE_SEED ?? 1);

// ---------------------------------------------------------------- record

const START = '2000-11';
const END = '2026-11';
const N = monthCount(START, END);
const FIRST_REF = '2012-02';
const AQUA_START = '2002-07';
const SNPP_START = '2012-01';
const SNPP_END = '2026-10';
const NOAA20_START = '2018-04';
const NOAA21_START = '2023-03';
const FIT_FROM = '2012-02';
const FIT_TO = '2019-12';
const FIT_YEARS = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019];
const PARTIAL = { month: '2026-11', days_covered: 14, days_in_month: 30 };
const MIN_FIT_SUM = 30;
const BOOTSTRAPS = 200;

const mi = (m: string) => monthCount(START, m) - 1;
const MONTHS = Array.from({ length: N }, (_, i) => addMonths(START, i));

// ---------------------------------------------------------------- random

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);

function normal(): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const lognormal = (sigma: number) => Math.exp(sigma * normal());

/** Binomial draw by inversion with one uniform. Exact for the small n used here. */
function binomial(n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  const u = rand();
  const q = 1 - p;
  let pmf = Math.pow(q, n);
  let cdf = pmf;
  let k = 0;
  while (u > cdf && k < n) {
    pmf *= ((n - k) / (k + 1)) * (p / q);
    k++;
    cdf += pmf;
  }
  return k;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- regions

interface RegionDef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  level: number;
  quietShare: number;
  season: number[]; // 12 weights, January first
  trend?: number; // linear trend per year around 2013
  events?: string[]; // synthetic extreme months
}

const REGIONS: RegionDef[] = [
  {
    id: 'sicily',
    name: 'Sicily, Italy',
    lat: 37.6,
    lon: 14.2,
    level: 0.02,
    quietShare: 0.3,
    season: [0.03, 0.03, 0.04, 0.05, 0.1, 0.35, 1, 1, 0.35, 0.1, 0.03, 0.03],
  },
  {
    id: 'portugal',
    name: 'Central Portugal',
    lat: 39.9,
    lon: -8.1,
    level: 0.02,
    quietShare: 0.3,
    season: [0.03, 0.04, 0.06, 0.05, 0.08, 0.4, 0.7, 1, 0.6, 0.35, 0.05, 0.03],
    events: ['2017-06', '2017-10'],
  },
  {
    id: 'evros',
    name: 'Evros, Greece',
    lat: 41.0,
    lon: 26.0,
    level: 0.01,
    quietShare: 0.6,
    season: [0.03, 0.03, 0.1, 0.1, 0.05, 0.3, 1, 1, 0.3, 0.08, 0.03, 0.03],
    events: ['2023-08'],
  },
  {
    id: 'piemonte',
    name: 'Piemonte, Italy',
    lat: 44.9,
    lon: 7.6,
    level: 0.002,
    quietShare: 0.6,
    season: [0.3, 1, 1, 0.3, 0.05, 0.02, 0.03, 0.04, 0.03, 0.05, 0.05, 0.1],
  },
  {
    id: 'sahel',
    name: 'Sahel savanna, South Sudan',
    lat: 8.0,
    lon: 27.0,
    level: 0.3,
    quietShare: 0.05,
    season: [1, 0.7, 0.3, 0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.2, 0.7, 1],
  },
  {
    id: 'matogrosso',
    name: 'Mato Grosso, Brazil',
    lat: -11.5,
    lon: -54.5,
    level: 0.08,
    quietShare: 0.3,
    season: [0.02, 0.02, 0.02, 0.02, 0.05, 0.15, 0.4, 1, 1, 0.4, 0.05, 0.02],
    trend: 0.04,
  },
];

const EXTRA_PLACES: PresetPlace[] = [
  { id: 'langhe', name: 'Langhe, Italy', lat: 44.64, lon: 7.93 },
  { id: 'susa', name: 'Susa Valley, Italy', lat: 45.14, lon: 7.05 },
];

const SAT: SatKey[] = ['terra', 'aqua', 'snpp', 'noaa20', 'noaa21'];

interface Region {
  def: RegionDef;
  tiles: string[];
  cells: string[];
  index: Map<string, number>;
  /** Raw counts per sensor, cell-major: [cell * N + month]. */
  raw: Record<SatKey | 'modis', Uint8Array>;
  viirs: Float32Array;
  h: Float64Array;
  lo: Float64Array;
  hi: Float64Array;
}

// ---------------------------------------------------------------- simulation

function buildRegion(def: RegionDef): Region {
  const centre = latLngToCell(def.lat, def.lon, 3);
  const tiles = gridDisk(centre, 1).sort();
  const cells = tiles.flatMap((t) => cellToChildren(t, 6)).sort();
  const index = new Map(cells.map((c, i) => [c, i]));
  const nc = cells.length;
  const alloc = () => new Uint8Array(nc * N);
  const r: Region = {
    def,
    tiles,
    cells,
    index,
    raw: {
      terra: alloc(),
      aqua: alloc(),
      modis: alloc(),
      snpp: alloc(),
      noaa20: alloc(),
      noaa21: alloc(),
    },
    viirs: new Float32Array(nc * N),
    h: new Float64Array(nc * N),
    lo: new Float64Array(nc * N),
    hi: new Float64Array(nc * N),
  };

  // Base rate per cell: level x lognormal noise x smooth bump around 3 foci, quiet share x 0.02.
  const foci = [0, 1, 2].map(() => cellToLatLng(cells[Math.floor(rand() * nc)]!));
  const base = new Float64Array(nc);
  for (let c = 0; c < nc; c++) {
    const ll = cellToLatLng(cells[c]!);
    let bump = 0;
    for (const f of foci) {
      const d = greatCircleDistance(ll, f, UNITS.km);
      bump = Math.max(bump, Math.exp(-((d / 35) ** 2)));
    }
    let b = def.level * lognormal(1.2) * (0.3 + 2.7 * bump);
    if (rand() < def.quietShare) b *= 0.02;
    base[c] = b;
  }

  // Year factor per calendar year.
  const firstYear = parseMonth(START).year;
  const lastYear = parseMonth(END).year;
  const year = new Map<number, number>();
  for (let y = firstYear; y <= lastYear; y++) {
    const trend = def.trend ? Math.max(0.2, 1 + def.trend * (y - 2013)) : 1;
    year.set(y, lognormal(0.35) * trend);
  }
  const events = new Set(def.events ?? []);

  const iAqua = mi(AQUA_START);
  const iSnpp = mi(SNPP_START);
  const iSnppEnd = mi(SNPP_END);
  const iN20 = mi(NOAA20_START);
  const iN21 = mi(NOAA21_START);
  const snppOutage = new Set([mi('2022-07'), mi('2022-08')]);
  const aquaOutage = mi('2020-08');

  for (let t = 0; t < N; t++) {
    const month = MONTHS[t]!;
    const { year: y, month: cm } = parseMonth(month);
    const D = month === PARTIAL.month ? PARTIAL.days_covered : daysInMonth(month);
    const factor = def.season[cm - 1]! * year.get(y)! * (events.has(month) ? 8 : 1);
    for (let c = 0; c < nc; c++) {
      const p = Math.min(0.95, base[c]! * factor);
      const F = binomial(D, p);
      if (F === 0) continue;
      const k = c * N + t;
      r.raw.terra[k] = binomial(F, 0.35);
      if (t >= iAqua) {
        let aqua = binomial(F, 0.4);
        if (t === aquaOutage) aqua = binomial(aqua, 0.5);
        r.raw.aqua[k] = aqua;
        r.raw.modis[k] = binomial(F, t === aquaOutage ? 1 - 0.65 * 0.8 : 0.61);
      } else {
        r.raw.modis[k] = r.raw.terra[k]!;
      }
      let snpp = 0;
      let n20 = 0;
      let present = 0;
      if (t >= iSnpp && t <= iSnppEnd) {
        snpp = t === iSnpp ? binomial(binomial(F, 12 / 31), 0.9) : binomial(F, 0.9);
        if (snppOutage.has(t)) snpp = binomial(snpp, 0.5);
        r.raw.snpp[k] = snpp;
        present++;
      }
      if (t >= iN20) {
        n20 = binomial(F, 0.9);
        r.raw.noaa20[k] = n20;
        present++;
      }
      if (t >= iN21) r.raw.noaa21[k] = binomial(F, 0.9);
      r.viirs[k] = present > 0 ? (snpp + n20) / present : 0;
    }
  }

  // Scan-edge effect: 8% of each cell's MODIS days move to a random ring 1 neighbour in the region.
  const neighbours = cells.map((c) =>
    gridDisk(c, 1)
      .filter((n) => n !== c && index.has(n))
      .map((n) => index.get(n)!),
  );
  for (let t = 0; t < N; t++) {
    const moves: [number, number, number][] = [];
    for (let c = 0; c < nc; c++) {
      const m = r.raw.modis[c * N + t]!;
      if (m === 0) continue;
      const moved = binomial(m, 0.08);
      const nb = neighbours[c]!;
      if (moved === 0 || nb.length === 0) continue;
      moves.push([c, nb[Math.floor(rand() * nb.length)]!, moved]);
    }
    for (const [from, to, n] of moves) {
      r.raw.modis[from * N + t]! -= n;
      r.raw.modis[to * N + t]! += n;
    }
  }
  return r;
}

// ---------------------------------------------------------------- harmonization

const SEASONS = ['DJF', 'MAM', 'JJA', 'SON'] as const;
type Season = (typeof SEASONS)[number];
const seasonOf = (calendarMonth: number): Season => SEASONS[Math.floor((calendarMonth % 12) / 3)]!;

interface Ratio {
  ratio: number;
  lo: number;
  hi: number;
  fallback: boolean;
}

/** Region totals per fit year and season for one MODIS-side sensor. */
function fitTotals(r: Region, sensor: 'modis' | 'terra') {
  const V = new Map<string, number>();
  const M = new Map<string, number>();
  const key = (y: number, s: Season) => `${y}-${s}`;
  for (let t = mi(FIT_FROM); t <= mi(FIT_TO); t++) {
    const { year, month } = parseMonth(MONTHS[t]!);
    const k = key(year, seasonOf(month));
    let v = 0;
    let m = 0;
    for (let c = 0; c < r.cells.length; c++) {
      v += r.viirs[c * N + t]!;
      m += r.raw[sensor][c * N + t]!;
    }
    V.set(k, (V.get(k) ?? 0) + v);
    M.set(k, (M.get(k) ?? 0) + m);
  }
  return { V, M, key };
}

function fitRatios(
  totals: ReturnType<typeof fitTotals>,
  years: number[],
  bootstrap: boolean,
): Record<Season, Ratio> {
  const { V, M, key } = totals;
  const sumOver = (ys: number[], seasons: readonly Season[]) => {
    let v = 0;
    let m = 0;
    for (const y of ys)
      for (const s of seasons) {
        v += V.get(key(y, s)) ?? 0;
        m += M.get(key(y, s)) ?? 0;
      }
    return { v, m };
  };
  const band = (seasons: readonly Season[], point: number) => {
    if (!bootstrap) return { lo: point, hi: point };
    const draws: number[] = [];
    for (let b = 0; b < BOOTSTRAPS; b++) {
      const sample = years.map(() => years[Math.floor(rand() * years.length)]!);
      const { v, m } = sumOver(sample, seasons);
      if (m > 0) draws.push(v / m);
    }
    if (draws.length === 0) return { lo: point, hi: point };
    return {
      lo: Math.min(point, quantile(draws, 5)),
      hi: Math.max(point, quantile(draws, 95)),
    };
  };
  const all = sumOver(years, SEASONS);
  const allRatio = all.m > 0 ? all.v / all.m : 1;
  const allBand = band(SEASONS, allRatio);
  const out = {} as Record<Season, Ratio>;
  for (const s of SEASONS) {
    const { v, m } = sumOver(years, [s]);
    if (m < MIN_FIT_SUM) {
      out[s] = { ratio: allRatio, ...allBand, fallback: true };
    } else {
      const ratio = v / m;
      out[s] = { ratio, ...band([s], ratio), fallback: false };
    }
  }
  return out;
}

function harmonize(r: Region) {
  const modisFit = fitRatios(fitTotals(r, 'modis'), FIT_YEARS, true);
  const terraFit = fitRatios(fitTotals(r, 'terra'), FIT_YEARS, true);
  const iRef = mi(FIRST_REF);
  const iAqua = mi(AQUA_START);
  for (let t = 0; t < N; t++) {
    const { month } = parseMonth(MONTHS[t]!);
    const fit = (t < iAqua ? terraFit : modisFit)[seasonOf(month)];
    for (let c = 0; c < r.cells.length; c++) {
      const k = c * N + t;
      if (t >= iRef) {
        const v = round1(r.viirs[k]!);
        r.h[k] = v;
        r.lo[k] = v;
        r.hi[k] = v;
      } else {
        const m = r.raw.modis[k]!;
        r.h[k] = round1(fit.ratio * m);
        r.lo[k] = round1(fit.lo * m);
        r.hi[k] = round1(fit.hi * m);
      }
    }
  }
  return { modisFit, terraFit };
}

/** Leave-one-year-out error by scale (decision D9 default), pooled over regions. */
function leaveOneYearOut(regions: Region[]): MethodTables['loyo'] {
  const scales = ['res6', 'ring7', 'res5', 'res4', 'region'] as const;
  const acc = Object.fromEntries(
    scales.map((s) => [s, { pred: 0, obs: 0, absErr: 0, n: 0 }]),
  ) as Record<(typeof scales)[number], { pred: number; obs: number; absErr: number; n: number }>;

  for (const r of regions) {
    const totals = fitTotals(r, 'modis');
    // Units per scale, as lists of cell indexes.
    const units: Record<(typeof scales)[number], number[][]> = {
      res6: r.cells.map((_, i) => [i]),
      ring7: [],
      res5: [],
      res4: [],
      region: [r.cells.map((_, i) => i)],
    };
    const byParent = (res: number) => {
      const g = new Map<string, number[]>();
      r.cells.forEach((c, i) => {
        const p = cellToParent(c, res);
        const list = g.get(p);
        if (list) list.push(i);
        else g.set(p, [i]);
      });
      return [...g.values()];
    };
    units.res5 = byParent(5);
    units.res4 = byParent(4);
    // A 7-cell ring around one non-centre child of each res 5 cell, so it differs from res 5.
    const r5 = [...new Set(r.cells.map((c) => cellToParent(c, 5)))].sort();
    for (const p of r5) {
      const children = cellToChildren(p, 6).sort();
      const centre = children.find((c) => c !== children[0]) ?? children[0]!;
      units.ring7.push(
        gridDisk(centre, 1)
          .filter((c) => r.index.has(c))
          .map((c) => r.index.get(c)!),
      );
    }

    for (const held of FIT_YEARS) {
      const fit = fitRatios(
        totals,
        FIT_YEARS.filter((y) => y !== held),
        false,
      );
      for (let t = mi(FIT_FROM); t <= mi(FIT_TO); t++) {
        const { year, month } = parseMonth(MONTHS[t]!);
        if (year !== held) continue;
        const ratio = fit[seasonOf(month)].ratio;
        for (const scale of scales) {
          const a = acc[scale];
          for (const unit of units[scale]) {
            let pred = 0;
            let obs = 0;
            for (const c of unit) {
              pred += ratio * r.raw.modis[c * N + t]!;
              obs += r.viirs[c * N + t]!;
            }
            if (pred === 0 && obs === 0) continue;
            a.pred += pred;
            a.obs += obs;
            a.absErr += Math.abs(pred - obs);
            a.n++;
          }
        }
      }
    }
  }
  return scales.map((scale) => {
    const a = acc[scale];
    return {
      scale,
      bias: a.obs > 0 ? Math.round((a.pred / a.obs) * 1000) / 1000 : 0,
      mae: a.n > 0 ? Math.round((a.absErr / a.n) * 100) / 100 : 0,
      n: a.n,
    };
  });
}

// ---------------------------------------------------------------- daily fields (plan 4.6)

/**
 * The small daily area of the fixtures: the west half of the Piemonte region, so a place there
 * has daily values and places further east, or in any other region, have none. Same rules as the
 * data build: a res 6 cell is selected when its centre is in the box; an overview cell gets daily
 * values for the whole cell when it contains a selected cell.
 */
const DAILY_AREA = {
  name: 'Piemonte west (fixture)',
  bbox: [6.0, 43.5, 7.75, 46.5] as [number, number, number, number],
};
const DAILY_REGION = 'piemonte';
/** Masks use their own generator, so the monthly values of the fixtures do not change. */
const dayRand = mulberry32(SEED + 1001);

interface CellDays {
  modis: number;
  snpp: number;
  noaa20: number;
  /** The month's h split over its days, in tenths (largest remainder), summing to h exactly. */
  v10: Int32Array;
}

const inDailyBox = (cell: string) => {
  const [lat, lon] = cellToLatLng(cell);
  const [w, s, e, n] = DAILY_AREA.bbox;
  return lon >= w && lon <= e && lat >= s && lat <= n;
};

/** Days with data in a month (the partial month has its covered days only). */
const daysOf = (month: string) =>
  month === PARTIAL.month ? PARTIAL.days_covered : daysInMonth(month);

/** VIIRS weights of a month from the reference month on: the satellites in the mean, equal weight. */
function viirsWeights(t: number): { snpp?: number; noaa20?: number } {
  const snpp = t >= mi(SNPP_START) && t <= mi(SNPP_END);
  const noaa20 = t >= mi(NOAA20_START);
  const n = Number(snpp) + Number(noaa20);
  return {
    ...(snpp ? { snpp: 1 / n } : {}),
    ...(noaa20 ? { noaa20: 1 / n } : {}),
  };
}

/** k distinct random days from 1..D, preferring the given fire days. */
function pickDays(k: number, fire: number[], D: number): number {
  if (k > D) throw new Error(`daily fixtures: ${k} detection days in a ${D}-day month`);
  const pool = [...fire];
  const rest = Array.from({ length: D }, (_, i) => i + 1).filter((d) => !fire.includes(d));
  let mask = 0;
  for (let j = 0; j < k; j++) {
    const from = pool.length > 0 ? pool : rest;
    const at = Math.floor(dayRand() * from.length);
    mask |= 1 << (from[at]! - 1);
    from.splice(at, 1);
  }
  return mask;
}

/** Largest-remainder split of h10 tenths in proportion to the weights, ties to the earlier day. */
function splitTenths(h10: number, weights: number[]): Int32Array {
  const out = new Int32Array(weights.length);
  const total = weights.reduce((a, b) => a + b, 0);
  if (h10 === 0) return out;
  if (!(total > 0)) throw new Error('daily fixtures: a month value has no day to go to');
  const ex = weights.map((w) => (h10 * w) / total);
  let left = h10;
  ex.forEach((x, d) => {
    out[d] = Math.floor(x + 1e-9);
    left -= out[d]!;
  });
  const order = ex
    .map((x, d) => [x - Math.floor(x + 1e-9), d] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let j = 0; j < left; j++) out[order[j]![1]]! += 1;
  return out;
}

/**
 * Day masks and day values for every cell-month of the region with any activity. The masks agree
 * with the monthly counts (popcount = modis, snpp, noaa20); satellites mostly see the same fire days.
 */
function dailyOfRegion(r: Region): Map<number, CellDays> {
  const out = new Map<number, CellDays>();
  const ref = mi(FIRST_REF);
  for (let c = 0; c < r.cells.length; c++) {
    for (let t = 0; t < N; t++) {
      const k = c * N + t;
      const counts = [r.raw.modis[k]!, r.raw.snpp[k]!, r.raw.noaa20[k]!];
      if (r.h[k]! === 0 && counts.every((x) => x === 0)) continue;
      const month = MONTHS[t]!;
      const D = daysOf(month);
      const fireCount = Math.min(D, Math.max(...counts) + Math.floor(dayRand() * 3));
      const fire: number[] = [];
      const all = Array.from({ length: D }, (_, i) => i + 1);
      for (let j = 0; j < fireCount; j++)
        fire.push(...all.splice(Math.floor(dayRand() * all.length), 1));
      const [modis, snpp, noaa20] = counts.map((n) => pickDays(n, fire, D)) as [
        number,
        number,
        number,
      ];
      const w = viirsWeights(t);
      const weights = Array.from({ length: daysInMonth(month) }, (_, i) => {
        const bit = (m: number) => (m >>> i) & 1;
        return t < ref ? bit(modis) : (w.snpp ?? 0) * bit(snpp) + (w.noaa20 ?? 0) * bit(noaa20);
      });
      out.set(k, { modis, snpp, noaa20, v10: splitTenths(Math.round(r.h[k]! * 10), weights) });
    }
  }
  return out;
}

/** method.json "daily", as the data build writes it. */
function methodDaily(): NonNullable<MethodTables['daily']> & Record<string, unknown> {
  const viirs_weights: Record<string, { snpp?: number; noaa20?: number }> = {};
  for (let t = mi(FIRST_REF); t < N; t++) viirs_weights[MONTHS[t]!] = viirsWeights(t);
  return {
    status: 'v1 optional daily fields (proposed)',
    days: 'UTC acquisition dates. Day d of a month is bit d-1 of a mask',
    where: `Fixture: only ${DAILY_AREA.name}`,
    noaa20_scale_applied: false,
    viirs_weights,
  };
}

// ---------------------------------------------------------------- outputs

type Acc = { h: number; lo: number; hi: number; modis: number; viirs: number };

function makeTile(r: Region, parent: string, daily?: Map<number, CellDays>): DetailTile {
  const cells = r.cells.filter((c) => cellToParent(c, 3) === parent);
  const tile: DetailTile = {
    parent,
    res: 6,
    start: START,
    n_months: N,
    cells: [],
    offsets: [0],
    mi: [],
    h: [],
    lo: [],
    hi: [],
    modis: [],
    viirs: [],
    sat: { terra: [], aqua: [], snpp: [], noaa20: [], noaa21: [] },
  };
  const rows = {
    rows: [] as number[],
    dm_modis: [] as number[],
    dm_snpp: [] as number[],
    dm_noaa20: [] as number[],
  };
  for (const cell of cells) {
    const c = r.index.get(cell)!;
    const before = tile.mi.length;
    const selected = daily !== undefined && inDailyBox(cell);
    for (let t = 0; t < N; t++) {
      const k = c * N + t;
      const any =
        r.h[k]! > 0 || r.raw.modis[k]! > 0 || r.viirs[k]! > 0 || SAT.some((s) => r.raw[s][k]! > 0);
      if (!any) continue;
      tile.mi.push(t);
      tile.h.push(r.h[k]!);
      tile.lo.push(r.lo[k]!);
      tile.hi.push(r.hi[k]!);
      tile.modis.push(r.raw.modis[k]!);
      tile.viirs.push(round1(r.viirs[k]!));
      for (const s of SAT) tile.sat![s]!.push(r.raw[s][k]!);
      if (selected) {
        const d = daily.get(k);
        rows.rows.push(tile.mi.length - 1);
        rows.dm_modis.push(d?.modis ?? 0);
        rows.dm_snpp.push(d?.snpp ?? 0);
        rows.dm_noaa20.push(d?.noaa20 ?? 0);
      }
    }
    if (tile.mi.length > before) {
      tile.cells.push(cell);
      tile.offsets.push(tile.mi.length);
    }
  }
  if (rows.rows.length > 0) tile.daily = rows;
  return tile;
}

function overviewFile(
  month: string,
  res: 3 | 4 | 5,
  sums: Map<string, Acc>,
  daily?: Map<string, Int32Array>,
): Overview {
  const o: Overview = { month, res, cell: [], h: [], lo: [], hi: [], modis: [], viirs: [] };
  for (const cell of [...sums.keys()].sort()) {
    const s = sums.get(cell)!;
    if (!(s.h > 0 || s.modis > 0 || s.viirs > 0)) continue;
    o.cell.push(cell);
    o.h.push(round1(s.h));
    o.lo.push(round1(s.lo));
    o.hi.push(round1(s.hi));
    o.modis.push(round1(s.modis));
    o.viirs.push(round1(s.viirs));
    const days = daily?.get(cell);
    if (days) {
      o.daily ??= { idx: [], d: [] };
      o.daily.idx.push(o.cell.length - 1);
      const pairs: [number, number][] = [];
      days.forEach((v, i) => {
        if (v > 0) pairs.push([i + 1, v / 10]);
      });
      o.daily.d.push(pairs);
    }
  }
  return o;
}

function manifest(r5Parts: string[], dailyCells: number): Manifest {
  return {
    contract_version: 1,
    source: 'fixture',
    built_at: '2026-11-15T00:00:00Z',
    data_through: '2026-11-14',
    atom_res: 6,
    record: { start: START, end: END },
    first_reference_month: FIRST_REF,
    status_ranges: [
      { from: START, to: '2012-01', status: 'estimated' },
      { from: '2026-08', to: END, status: 'provisional' },
    ],
    partial_months: [PARTIAL],
    seams: [
      { month: AQUA_START, label: 'Aqua starts' },
      { month: FIRST_REF, label: 'VIIRS starts (S-NPP)' },
      { month: NOAA20_START, label: 'NOAA-20 added' },
      { month: NOAA21_START, label: 'NOAA-21 added' },
      { month: '2026-11', label: 'S-NPP ends' },
    ],
    known_issues: [
      {
        from: '2020-08',
        to: '2020-08',
        satellite: 'aqua',
        note: 'Aqua outage (simulated, half the days)',
      },
      {
        from: '2022-07',
        to: '2022-08',
        satellite: 'snpp',
        note: 'S-NPP outage, 16 days (simulated as half the days)',
      },
    ],
    baseline: { start_year: 2003, end_year: 2025, min_years: 10, exclude_target_year: true },
    classes: { p_low: 25, p_high: 75, p_very_high: 90, min_normal_for_ratio: 3 },
    ladder: [
      { res: 3, min_zoom: 0, source: 'overview' },
      { res: 4, min_zoom: 4.5, source: 'overview' },
      { res: 5, min_zoom: 6.0, source: 'overview' },
      { res: 6, min_zoom: 7.5, source: 'detail' },
    ],
    ladder_hysteresis: 0.3,
    overview: { r5_parts: r5Parts },
    detail: { tile_res: 3, max_place_cells: 5000 },
    color: { density_breaks: [1, 5, 25, 100, 300] },
    method: {
      version: 'fixture-1',
      reference: 'VIIRS-equivalent',
      transfer: `Ratio per region and season, fitted on ${FIT_FROM} to ${FIT_TO}. Separate Terra-only ratio before ${AQUA_START}`,
      viirs_group:
        'Mean of S-NPP and NOAA-20 when both are present. NOAA-21 kept in the per-satellite values only',
      filters: 'Simulated detections, no filter',
      notes: [
        'Fixture data: simulated fires in six synthetic regions, not real observations.',
        'The extreme months (Portugal 2017-06 and 2017-10, Evros 2023-08) are synthetic test events.',
        `Band: 5th to 95th percentile of the ratio over ${BOOTSTRAPS} bootstrap resamples of the fit years.`,
        'Leave-one-year-out rows count only unit-months where predicted or observed is above zero.',
        `Daily fields (UTC days) only for ${DAILY_AREA.name}: simulated day masks that agree with the monthly counts.`,
      ],
    },
    daily: { areas: [DAILY_AREA], res6_cells: dailyCells, days: 'utc' },
  };
}

// ---------------------------------------------------------------- checks

function runChecks(regions: Region[], summary: Summary): string[] {
  const failures: string[] = [];
  const s = mi(FIRST_REF);
  const raw = summary.h.map((_, t) => (t < s ? summary.modis[t]! : summary.viirs[t]!));
  const rawStep = seamStep(raw, s);
  const hStep = seamStep(summary.h, s);
  console.log(
    `  check 2: world raw step ${rawStep?.toFixed(3)}, harmonized step ${hStep?.toFixed(3)}`,
  );
  if (rawStep === null || !(rawStep > 1.5))
    failures.push(`check 2: raw seam step ${rawStep} is not above 1.5`);
  if (hStep === null || !(hStep >= 0.8 && hStep <= 1.25))
    failures.push(`check 2: harmonized seam step ${hStep} is not between 0.8 and 1.25`);

  let pairs = 0;
  let zeroPairs = 0;
  let overDays = 0;
  let zeroModis = 0;
  for (const r of regions) {
    for (let c = 0; c < r.cells.length; c++) {
      for (let m = 1; m <= 12; m++) {
        const vals: number[] = [];
        for (let y = 2003; y <= 2025; y++) {
          const t = mi(`${y}-${String(m).padStart(2, '0')}`);
          vals.push(r.h[c * N + t]!);
        }
        pairs++;
        if (median(vals) === 0) zeroPairs++;
      }
      let modisBefore = 0;
      let viirsAfter = 0;
      for (let t = 0; t < N; t++) {
        const k = c * N + t;
        if (r.h[k]! > daysInMonth(MONTHS[t]!)) overDays++;
        if (t < s) modisBefore += r.raw.modis[k]!;
        else viirsAfter += r.viirs[k]!;
      }
      if (modisBefore === 0 && viirsAfter > 0) zeroModis++;
    }
  }
  const zeroShare = zeroPairs / pairs;
  console.log(
    `  check 3: ${(zeroShare * 100).toFixed(1)}% of cell and calendar month pairs have a zero median`,
  );
  console.log(`  check 4: ${overDays} cell-months with h above the days in the month`);
  console.log(
    `  check 5: ${zeroModis} cells with no MODIS before ${FIRST_REF} and VIIRS activity later`,
  );
  if (zeroShare < 0.4) failures.push(`check 3: zero-median share ${zeroShare} is under 40%`);
  if (overDays < 1) failures.push('check 4: no cell-month has h above the days in the month');
  if (zeroModis < 100) failures.push(`check 5: only ${zeroModis} zero-MODIS cells`);
  return failures;
}

// ---------------------------------------------------------------- main

async function writeJson(root: string, path: string, value: unknown): Promise<number> {
  const file = join(root, path);
  await mkdir(dirname(file), { recursive: true });
  const text = JSON.stringify(value);
  await writeFile(file, text, 'utf8');
  return text.length;
}

export async function makeFixtures(root: string): Promise<void> {
  const started = Date.now();
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const regions: Region[] = [];
  const ratioRows: MethodTables['ratios'] = [];
  for (const def of REGIONS) {
    const r = buildRegion(def);
    const { modisFit, terraFit } = harmonize(r);
    const region = cellToParent(latLngToCell(def.lat, def.lon, 3), 1);
    for (const s of SEASONS) {
      for (const [label, fit] of [
        [s, modisFit[s]],
        [`${s} (Terra only)`, terraFit[s]],
      ] as const) {
        ratioRows.push({
          region,
          season: fit.fallback ? `${label}, all-season fallback` : label,
          ratio: Math.round(fit.ratio * 1000) / 1000,
          lo: Math.round(fit.lo * 1000) / 1000,
          hi: Math.round(fit.hi * 1000) / 1000,
          n_years: FIT_YEARS.length,
        });
      }
    }
    regions.push(r);
    console.log(`  simulated ${def.id}: ${r.cells.length} cells, ${r.tiles.length} tiles`);
  }

  for (const p of EXTRA_PLACES) {
    const tile = latLngToCell(p.lat, p.lon, 3);
    if (!regions.some((r) => r.tiles.includes(tile))) {
      throw new Error(`Preset ${p.id} is outside every fixture region`);
    }
  }

  let bytes = 0;
  // Daily values for the fixture's daily area (plan 4.6).
  const dailyRegion = regions.find((r) => r.def.id === DAILY_REGION)!;
  const daily = dailyOfRegion(dailyRegion);
  for (const r of regions) {
    if (r !== dailyRegion && r.cells.some(inDailyBox))
      throw new Error('daily box touches another region');
  }

  // Detail tiles.
  const tiles: DetailTile[] = [];
  for (const r of regions) {
    for (const t of r.tiles) tiles.push(makeTile(r, t, r === dailyRegion ? daily : undefined));
  }
  // Selected cells: active res 6 cells whose centre is in the box.
  const selected = tiles.flatMap((t) => (t.daily ? t.cells.filter(inDailyBox) : []));
  const selectedParents = {
    3: new Set(selected.map((c) => cellToParent(c, 3))),
    4: new Set(selected.map((c) => cellToParent(c, 4))),
    5: new Set(selected.map((c) => cellToParent(c, 5))),
  };
  // Overview days: every res 6 child of a cell that contains a selected cell.
  const ovDays = MONTHS.map(() => ({
    3: new Map<string, Int32Array>(),
    4: new Map<string, Int32Array>(),
    5: new Map<string, Int32Array>(),
  }));
  // Area series: the selected cells per UTC day, from the first day of the record.
  const monthStartDay: number[] = [];
  let dayCount = 0;
  for (const m of MONTHS) {
    monthStartDay.push(dayCount);
    dayCount += daysOf(m);
  }
  const areaSeries = new Int32Array(dayCount);
  const selectedSet = new Set(selected);
  for (const [k, cd] of daily) {
    const c = Math.floor(k / N);
    const t = k % N;
    const cell = dailyRegion.cells[c]!;
    for (const res of [3, 4, 5] as const) {
      const p = cellToParent(cell, res);
      if (!selectedParents[res].has(p)) continue;
      const map = ovDays[t]![res];
      let acc = map.get(p);
      if (!acc) {
        acc = new Int32Array(daysInMonth(MONTHS[t]!));
        map.set(p, acc);
      }
      cd.v10.forEach((v, d) => (acc![d]! += v));
    }
    if (selectedSet.has(cell)) {
      cd.v10.forEach((v, d) => {
        if (d < daysOf(MONTHS[t]!)) areaSeries[monthStartDay[t]! + d]! += v;
      });
    }
  }
  // Cells that contain a selected cell carry daily values in every month, zero days included.
  for (let t = 0; t < N; t++) {
    for (const res of [3, 4, 5] as const) {
      for (const p of selectedParents[res]) {
        if (!ovDays[t]![res].has(p))
          ovDays[t]![res].set(p, new Int32Array(daysInMonth(MONTHS[t]!)));
      }
    }
  }
  tiles.sort((a, b) => a.parent.localeCompare(b.parent));
  for (const t of tiles) bytes += await writeJson(root, paths.detailTile(t.parent), t);
  const index: DetailIndex = { tile_res: 3, tiles: tiles.map((t) => t.parent) };
  bytes += await writeJson(root, paths.detailIndex, index);

  // Overview files and the world summary, as sums of the detail cells.
  const r5Parts = [...new Set(tiles.flatMap((t) => t.cells.map((c) => cellToParent(c, 0))))].sort();
  const sums = MONTHS.map(() => ({
    3: new Map<string, Acc>(),
    4: new Map<string, Acc>(),
    5: new Map<string, Acc>(),
  }));
  const sat = Object.fromEntries(SAT.map((s) => [s, new Array<number>(N).fill(0)])) as Record<
    SatKey,
    number[]
  >;
  for (const t of tiles) {
    t.cells.forEach((cell, k) => {
      const parents = {
        3: cellToParent(cell, 3),
        4: cellToParent(cell, 4),
        5: cellToParent(cell, 5),
      };
      for (let i = t.offsets[k]!; i < t.offsets[k + 1]!; i++) {
        const m = t.mi[i]!;
        for (const res of [3, 4, 5] as const) {
          const map = sums[m]![res];
          let a = map.get(parents[res]);
          if (!a) {
            a = { h: 0, lo: 0, hi: 0, modis: 0, viirs: 0 };
            map.set(parents[res], a);
          }
          a.h += t.h[i]!;
          a.lo += t.lo[i]!;
          a.hi += t.hi[i]!;
          a.modis += t.modis[i]!;
          a.viirs += t.viirs[i]!;
        }
        for (const s of SAT) sat[s][m]! += t.sat![s]![i]!;
      }
    });
  }
  const summary: Summary = {
    start: START,
    n_months: N,
    h: [],
    lo: [],
    hi: [],
    modis: [],
    viirs: [],
    sat,
  };
  for (let m = 0; m < N; m++) {
    const month = MONTHS[m]!;
    const r3 = overviewFile(month, 3, sums[m]![3], ovDays[m]![3]);
    bytes += await writeJson(root, paths.overview(3, month), r3);
    bytes += await writeJson(
      root,
      paths.overview(4, month),
      overviewFile(month, 4, sums[m]![4], ovDays[m]![4]),
    );
    for (const part of r5Parts) {
      const partSums = new Map([...sums[m]![5]].filter(([cell]) => cellToParent(cell, 0) === part));
      bytes += await writeJson(
        root,
        paths.overviewR5(part, month),
        overviewFile(month, 5, partSums, ovDays[m]![5]),
      );
    }
    const total = (k: keyof Acc) => round1(r3[k].reduce((a, b) => a + b, 0));
    summary.h.push(total('h'));
    summary.lo.push(total('lo'));
    summary.hi.push(total('hi'));
    summary.modis.push(total('modis'));
    summary.viirs.push(total('viirs'));
  }
  summary.daily_areas = [
    {
      name: DAILY_AREA.name,
      bbox: DAILY_AREA.bbox,
      res6_cells: selected.length,
      daily_start: `${START}-01`,
      daily_h: Array.from(areaSeries, (v) => v / 10),
    },
  ];
  bytes += await writeJson(root, paths.summary, summary);

  // Forecast fixture: for each res 4 area and calendar month, quantiles of the simulated
  // 2012 to 2025 values. It stands in for the prediction model's output and is not a forecast.
  const FC_START = '2027-01';
  const fcAreas = new Map<string, AreaForecast>();
  for (const cell of new Set(sums.flatMap((m) => [...m[4].keys()]))) {
    const a: AreaForecast = { p10: [], p50: [], p90: [], mean: [] };
    for (let cm = 1; cm <= 12; cm++) {
      const vals: number[] = [];
      for (let y = 2012; y <= 2025; y++) {
        const t = (y - parseMonth(START).year) * 12 + (cm - parseMonth(START).month);
        vals.push(sums[t]?.[4].get(cell)?.h ?? 0);
      }
      a.p10.push(quantile(vals, 10));
      a.p50.push(quantile(vals, 50));
      a.p90.push(quantile(vals, 90));
      a.mean.push(vals.reduce((x, v) => x + v, 0) / vals.length);
    }
    fcAreas.set(cell, a);
  }
  const fc = await writeForecastFiles(root, {
    source: 'fixture',
    start: FC_START,
    n: 12,
    areas: fcAreas,
    model: {
      name: 'Fixture: quantiles of the simulated 2012 to 2025 values',
      sensor: 'simulated',
      trained_through: '2025-12',
      notes: ['Simulated values for development. Not a forecast.'],
    },
    skill: [{ label: 'Fixture', value: 'no test results' }],
  });
  bytes += fc.bytes;
  console.log(`  forecast: ${fc.areas} res 4 areas, ${fc.files} files`);

  const places: PresetPlace[] = [
    ...REGIONS.map((d) => ({ id: d.id, name: d.name, lat: d.lat, lon: d.lon })),
    ...EXTRA_PLACES,
  ];
  bytes += await writeJson(root, paths.places, places);
  bytes += await writeJson(root, paths.method, {
    ratios: ratioRows,
    loyo: leaveOneYearOut(regions),
    daily: methodDaily(),
  } satisfies MethodTables);
  bytes += await writeJson(root, paths.manifest, manifest(r5Parts, selected.length));
  console.log(
    `  daily: ${selected.length} res 6 cells in ${DAILY_AREA.name}, ${daily.size} cell-months with day masks`,
  );

  console.log(
    `  wrote ${(bytes / 1e6).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );

  // Built-in checks (plan section 5). Any failure fails the run.
  const failures = runChecks(regions, summary);
  const report = await validateDataFolder(folderReader(root));
  console.log(
    `  check 1 and 6: validate-data ${report.ok ? 'passed' : 'FAILED'} (${report.filesChecked} files)`,
  );
  if (!report.ok) failures.push(...report.errors.map((e) => `validate-data: ${e}`));
  const fcReport = await validateForecastFolder(folderReader(root));
  console.log(
    `  forecast check ${fcReport.errors.length === 0 ? 'passed' : 'FAILED'} (${fcReport.files} files)`,
  );
  failures.push(...fcReport.errors.map((e) => `forecast: ${e}`));
  if (failures.length > 0) {
    throw new Error(`Fixture checks failed:\n- ${failures.join('\n- ')}`);
  }
  console.log(`Fixtures OK in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('make-fixtures.ts')) {
  const root = resolve(process.argv[2] ?? 'public/data');
  console.log(`Writing fixtures to ${root} (seed ${SEED})`);
  makeFixtures(root).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
