/**
 * Forecast files: the outlook from the prediction model (optional add-on to contract v1).
 * A build without a `forecast/` folder simply has no outlook.
 *
 *   forecast/manifest.json          months, world totals, model and test notes
 *   forecast/map/r{3,4}/YYYY-MM.json  median forecast per cell, for the map
 *   forecast/r4/<res 1 parent>.json   p10, p50, p90 per res 4 area and month, for places
 *
 * Values are active cell-days per H3 res 4 area per month (res 6 cell-days, like the record).
 */
import { z } from 'zod';
import { MONTH_RE } from './contract';
import { fetchJson } from './loader';
import { addMonths } from './months';

const Month = z.string().regex(MONTH_RE);
const Num = z.number().nonnegative();

export const ForecastManifest = z.object({
  version: z.literal(1),
  source: z.enum(['fixture', 'model']),
  start: Month,
  n_months: z.number().int().min(1).max(24),
  res: z.literal(4),
  tile_res: z.literal(1),
  /** Res 1 parents that have a tile. Areas outside them are forecast as 0. */
  tiles: z.array(z.string()),
  areas: z.number().int().nonnegative(),
  /** World totals per month: `mean` is the expected total, `p50` the sum of area medians. */
  world: z.object({ mean: z.array(Num), p50: z.array(Num) }),
  model: z.object({
    name: z.string(),
    sensor: z.string(),
    trained_through: z.string(),
    notes: z.array(z.string()),
  }),
  /** Held-out test results, shown as given in scientific mode. */
  skill: z.array(z.object({ label: z.string(), value: z.string() })),
});
export type ForecastManifest = z.infer<typeof ForecastManifest>;

/** Flat arrays: the values of cell k are at k * n_months to (k + 1) * n_months. */
export const ForecastTile = z
  .object({
    parent: z.string(),
    start: Month,
    n_months: z.number().int().positive(),
    cells: z.array(z.string()),
    p10: z.array(Num),
    p50: z.array(Num),
    p90: z.array(Num),
  })
  .refine(
    (t) =>
      [t.p10, t.p50, t.p90].every((a) => a.length === t.cells.length * t.n_months) &&
      t.cells.every((c, i) => i === 0 || t.cells[i - 1]! < c),
    'cells must be sorted and every value array cells x n_months long',
  );
export type ForecastTile = z.infer<typeof ForecastTile>;

export const ForecastMap = z
  .object({
    month: Month,
    res: z.union([z.literal(3), z.literal(4)]),
    cell: z.array(z.string()),
    v: z.array(Num),
  })
  .refine((m) => m.cell.length === m.v.length, 'cell and v must have the same length');
export type ForecastMap = z.infer<typeof ForecastMap>;

export const forecastPaths = {
  manifest: 'forecast/manifest.json',
  tile: (parent: string) => `forecast/r4/${parent}.json`,
  map: (res: 3 | 4, month: string) => `forecast/map/r${res}/${month}.json`,
} as const;

export function forecastEnd(f: Pick<ForecastManifest, 'start' | 'n_months'>): string {
  return addMonths(f.start, f.n_months - 1);
}

/** Index of a month in the forecast, or -1. */
export function forecastIndex(
  f: Pick<ForecastManifest, 'start' | 'n_months'> | null | undefined,
  month: string | null | undefined,
): number {
  if (!f || !month) return -1;
  for (let k = 0; k < f.n_months; k++) if (addMonths(f.start, k) === month) return k;
  return -1;
}

function memo<T>(load: (key: string, signal?: AbortSignal) => Promise<T>) {
  const cache = new Map<string, Promise<T>>();
  return (key: string, signal?: AbortSignal): Promise<T> => {
    let p = cache.get(key);
    if (!p) {
      p = load(key, signal).catch((e: unknown) => {
        cache.delete(key);
        throw e;
      });
      cache.set(key, p);
    }
    return p;
  };
}

const tiles = memo((parent) => fetchJson(forecastPaths.tile(parent), ForecastTile, undefined));
const maps = memo((key) => {
  const [res, month] = key.split('|') as [string, string];
  return fetchJson(forecastPaths.map(Number(res) as 3 | 4, month), ForecastMap, undefined);
});

export const forecastLoader = {
  /** Null when the build has no forecast. */
  manifest: (signal?: AbortSignal) =>
    fetchJson(forecastPaths.manifest, ForecastManifest, signal, true),
  tile: (parent: string) => tiles(parent),
  map: (res: 3 | 4, month: string) => maps(`${res}|${month}`),
};
