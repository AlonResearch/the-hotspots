/**
 * Imports the prediction model's forecast (the Hackaton project: results/forecast_2027_res4.csv,
 * one row per H3 res 4 area and month) into the web data folder as forecast files.
 *
 * Usage: npm run import-forecast -- --csv <forecast csv> [--metrics <metrics.json>] [--out <data folder>]
 *        (default --out: public/firms)
 *
 * Reads only. `pred_p10`, `pred_p50` and `pred_p90` become the place values; `clim_mean` is used
 * for the world totals, as in the prediction report (medians of many areas do not add up).
 */
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { getResolution, isValidCell } from 'h3-js';
import type { ForecastManifest } from '../src/data/forecast';
import { formatMonth } from '../src/data/months';
import { folderReader } from './validate-data';
import { validateForecastFolder, writeForecastFiles, type AreaForecast } from './forecast-files';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Metrics {
  features?: string[];
  test?: Record<string, Record<string, Record<string, number>> | Record<string, number>>;
}

/** Test results quoted from the model's metrics.json, as measured on the held-out years. */
function skillRows(m: Metrics | null): ForecastManifest['skill'] {
  if (!m?.test) return [];
  const rows: ForecastManifest['skill'] = [];
  const f = (x: number | undefined, d = 2) => (x === undefined ? 'n/a' : x.toFixed(d));
  for (const [key, label] of [
    ['2025 (full year)', '2025'],
    ['2026 Jan-Oct', '2026 January to October'],
  ] as const) {
    const t = m.test[key] as Record<string, Record<string, number>> | undefined;
    if (!t) continue;
    rows.push({
      label: `Held-out ${label}: mean absolute error per area and month (cell-days)`,
      value:
        `model median ${f(t['LightGBM median (p50)']?.MAE)}, ` +
        `usual value (median of past years) ${f(t['climatology median']?.MAE)}, ` +
        `same month last year ${f(t['same month last year']?.MAE)}`,
    });
  }
  for (const [key, label] of [
    ['interval_2025', '2025'],
    ['interval_2026', '2026'],
  ] as const) {
    const t = m.test[key] as Record<string, number> | undefined;
    if (!t) continue;
    rows.push({
      label: `Held-out ${label}: share of area-months inside the 10% to 90% range`,
      value: `${f((t.coverage ?? 0) * 100, 0)}% (where there was fire: ${f((t.coverage_active ?? 0) * 100, 0)}%)`,
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const csv = arg('csv');
  if (!csv || !existsSync(csv)) {
    throw new Error('Give the forecast file: --csv <path to forecast_2027_res4.csv>');
  }
  const out = resolve(arg('out') ?? 'public/firms');
  const metricsPath = arg('metrics');
  const metrics =
    metricsPath && existsSync(metricsPath)
      ? // The model writes NaN for undefined correlations, which JSON does not allow.
        (JSON.parse(readFileSync(metricsPath, 'utf8').replace(/\bNaN\b/g, 'null')) as Metrics)
      : null;

  const areas = new Map<string, AreaForecast>();
  let header: string[] | null = null;
  let year = 0;
  let rows = 0;
  const lines = createInterface({ input: createReadStream(csv), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const parts = line.split(',');
    if (!header) {
      header = parts;
      for (const c of [
        'area_id',
        'year',
        'month',
        'clim_mean',
        'pred_p10',
        'pred_p50',
        'pred_p90',
      ]) {
        if (!header.includes(c)) throw new Error(`${csv}: column ${c} is missing`);
      }
      continue;
    }
    const get = (c: string) => parts[header!.indexOf(c)]!;
    const cell = get('area_id');
    const y = Number(get('year'));
    const m = Number(get('month'));
    if (!isValidCell(cell) || getResolution(cell) !== 4)
      throw new Error(`not a res 4 cell: ${cell}`);
    if (!(m >= 1 && m <= 12)) throw new Error(`bad month in row ${rows + 2}`);
    if (year === 0) year = y;
    else if (y !== year) throw new Error(`more than one year in ${csv}: ${year} and ${y}`);
    let a = areas.get(cell);
    if (!a) {
      a = { p10: zeros(), p50: zeros(), p90: zeros(), mean: zeros() };
      areas.set(cell, a);
    }
    const num = (c: string) => {
      const v = Number(get(c));
      if (!Number.isFinite(v) || v < 0) throw new Error(`bad ${c} in row ${rows + 2}`);
      return v;
    };
    a.p10[m - 1] = num('pred_p10');
    a.p50[m - 1] = num('pred_p50');
    a.p90[m - 1] = num('pred_p90');
    a.mean[m - 1] = num('clim_mean');
    rows++;
  }
  if (rows === 0) throw new Error(`${csv} has no rows`);

  const model: ForecastManifest['model'] = {
    name: 'LightGBM quantile regression (10%, 50%, 90%)',
    sensor: 'VIIRS NOAA-20, vegetation fires, nominal and high confidence',
    trained_through: `${year - 1}-10`,
    notes: [
      'One forecast per H3 res 4 area (about 1,800 km²) and month, in active cell-days of res 6 cells.',
      `Made from fire history only, with data up to 31 October ${year - 1}. Not a weather forecast.`,
      'Almost all of the skill is the usual season of each area; the model adds little over it.',
      'World totals are the sum of the expected values per area, because medians of many areas do not add up.',
      'The values are NOAA-20 cell-days. The record uses the mean of S-NPP and NOAA-20, about 1% lower.',
    ],
  };
  const r = await writeForecastFiles(out, {
    source: 'model',
    start: formatMonth(year, 1),
    n: 12,
    areas,
    model,
    skill: skillRows(metrics),
  });
  const check = await validateForecastFolder(folderReader(out));
  if (check.errors.length > 0) {
    throw new Error(`The written forecast files failed the check:\n- ${check.errors.join('\n- ')}`);
  }
  console.log(
    `Forecast ${year}: ${rows.toLocaleString('en-GB')} rows, ${areas.size.toLocaleString('en-GB')} areas ` +
      `(${r.areas.toLocaleString('en-GB')} with a non-zero forecast), ${r.files} files, ` +
      `${(r.bytes / 1e6).toFixed(1)} MB in ${out}/forecast`,
  );
}

function zeros(): number[] {
  return new Array<number>(12).fill(0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
