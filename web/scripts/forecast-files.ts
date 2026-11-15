/**
 * Writes the forecast files of src/data/forecast.ts from per-area monthly values.
 * Shared by the fixture generator and the importer of the prediction model's output.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { cellToParent } from 'h3-js';
import { ForecastManifest, ForecastMap, ForecastTile, forecastPaths } from '../src/data/forecast';
import { addMonths } from '../src/data/months';
import type { JsonReader } from '../src/data/validate';

export interface AreaForecast {
  p10: number[];
  p50: number[];
  p90: number[];
  /** Expected value, used only for world totals (medians of many areas do not add up). */
  mean: number[];
}

export interface ForecastInput {
  source: ForecastManifest['source'];
  start: string;
  n: number;
  /** Res 4 cell to its values, one per forecast month. */
  areas: Map<string, AreaForecast>;
  model: ForecastManifest['model'];
  skill: ForecastManifest['skill'];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

async function writeJson(root: string, path: string, value: unknown): Promise<number> {
  const file = join(root, path);
  await mkdir(dirname(file), { recursive: true });
  const text = JSON.stringify(value);
  await writeFile(file, text);
  return text.length;
}

export async function writeForecastFiles(
  root: string,
  input: ForecastInput,
): Promise<{ files: number; bytes: number; areas: number }> {
  const { n } = input;
  let bytes = 0;
  let files = 0;
  const world = { mean: new Array<number>(n).fill(0), p50: new Array<number>(n).fill(0) };

  // Areas with nothing forecast in any month are left out: a missing area means 0.
  const kept = [...input.areas.entries()]
    .map(([cell, a]) => ({
      cell,
      p10: a.p10.map(r1),
      p50: a.p50.map(r1),
      p90: a.p90.map(r1),
      mean: a.mean,
    }))
    .filter((a) => a.p90.some((v) => v > 0) || a.p50.some((v) => v > 0))
    .sort((a, b) => (a.cell < b.cell ? -1 : a.cell > b.cell ? 1 : 0));
  for (const a of input.areas.values()) {
    for (let k = 0; k < n; k++) {
      world.mean[k]! += a.mean[k] ?? 0;
      world.p50[k]! += a.p50[k] ?? 0;
    }
  }

  const byParent = new Map<string, typeof kept>();
  for (const a of kept) {
    const p = cellToParent(a.cell, 1);
    const list = byParent.get(p);
    if (list) list.push(a);
    else byParent.set(p, [a]);
  }
  for (const [parent, list] of byParent) {
    const tile: ForecastTile = {
      parent,
      start: input.start,
      n_months: n,
      cells: list.map((a) => a.cell),
      p10: list.flatMap((a) => a.p10),
      p50: list.flatMap((a) => a.p50),
      p90: list.flatMap((a) => a.p90),
    };
    bytes += await writeJson(root, forecastPaths.tile(parent), tile);
    files++;
  }

  for (let k = 0; k < n; k++) {
    const month = addMonths(input.start, k);
    const r4: ForecastMap = { month, res: 4, cell: [], v: [] };
    const sums3 = new Map<string, number>();
    for (const a of kept) {
      const v = a.p50[k]!;
      if (!(v > 0)) continue;
      r4.cell.push(a.cell);
      r4.v.push(v);
      const p = cellToParent(a.cell, 3);
      sums3.set(p, (sums3.get(p) ?? 0) + v);
    }
    const cells3 = [...sums3.keys()].sort();
    const r3: ForecastMap = {
      month,
      res: 3,
      cell: cells3,
      v: cells3.map((c) => r1(sums3.get(c)!)),
    };
    bytes += await writeJson(root, forecastPaths.map(4, month), r4);
    bytes += await writeJson(root, forecastPaths.map(3, month), r3);
    files += 2;
  }

  const manifest: ForecastManifest = {
    version: 1,
    source: input.source,
    start: input.start,
    n_months: n,
    res: 4,
    tile_res: 1,
    tiles: [...byParent.keys()].sort(),
    areas: kept.length,
    world: { mean: world.mean.map(r1), p50: world.p50.map(r1) },
    model: input.model,
    skill: input.skill,
  };
  bytes += await writeJson(root, forecastPaths.manifest, manifest);
  files++;
  return { files, bytes, areas: kept.length };
}

export interface ForecastReport {
  /** False when the folder has no forecast, which is allowed. */
  present: boolean;
  files: number;
  errors: string[];
}

/**
 * Checks the forecast files of a data folder: every file against its schema, every tile against
 * the manifest, and the res 3 map against the sum of the res 4 map for each month.
 */
export async function validateForecastFolder(read: JsonReader): Promise<ForecastReport> {
  const errors: string[] = [];
  const raw = await read(forecastPaths.manifest);
  if (raw === undefined) return { present: false, files: 0, errors };
  const parsed = ForecastManifest.safeParse(raw);
  if (!parsed.success) {
    return {
      present: true,
      files: 1,
      errors: [`${forecastPaths.manifest}: does not match the schema`],
    };
  }
  const m = parsed.data;
  let files = 1;
  if (m.world.mean.length !== m.n_months || m.world.p50.length !== m.n_months) {
    errors.push(`${forecastPaths.manifest}: world totals must have ${m.n_months} values`);
  }
  let areas = 0;
  for (const parent of m.tiles) {
    const path = forecastPaths.tile(parent);
    const t = ForecastTile.safeParse(await read(path));
    files++;
    if (!t.success) {
      errors.push(`${path}: missing or does not match the schema`);
      continue;
    }
    if (t.data.parent !== parent || t.data.start !== m.start || t.data.n_months !== m.n_months) {
      errors.push(`${path}: parent, start or n_months differ from the manifest`);
    }
    if (t.data.cells.some((c) => cellToParent(c, 1) !== parent)) {
      errors.push(`${path}: holds a cell of another parent`);
    }
    areas += t.data.cells.length;
  }
  if (areas !== m.areas) errors.push(`tiles hold ${areas} areas, the manifest says ${m.areas}`);
  for (let k = 0; k < m.n_months; k++) {
    const month = addMonths(m.start, k);
    const totals: number[] = [];
    for (const res of [3, 4] as const) {
      const path = forecastPaths.map(res, month);
      const f = ForecastMap.safeParse(await read(path));
      files++;
      if (!f.success || f.data.month !== month || f.data.res !== res) {
        errors.push(`${path}: missing or does not match the schema`);
        continue;
      }
      totals.push(f.data.v.reduce((a, b) => a + b, 0));
    }
    // Res 3 values are sums of res 4 values rounded to one decimal.
    if (totals.length === 2 && Math.abs(totals[0]! - totals[1]!) > 0.05 * m.areas + 1e-6) {
      errors.push(`map ${month}: res 3 total ${totals[0]} differs from res 4 total ${totals[1]}`);
    }
  }
  return { present: true, files, errors };
}
