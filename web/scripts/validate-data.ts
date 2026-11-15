/**
 * Checks a data folder against the contract.
 * Usage: npm run validate-data [-- <folder>]   (default: public/data)
 */
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateDataFolder, type JsonReader } from '../src/data/validate';

export function folderReader(root: string): JsonReader {
  return async (path) => {
    let text: string;
    try {
      text = await readFile(join(root, path), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw e;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (e) {
      throw new Error(`invalid JSON: ${(e as Error).message}`, { cause: e });
    }
  };
}

async function main(): Promise<void> {
  const root = resolve(process.argv[2] ?? 'public/data');
  const started = Date.now();
  const report = await validateDataFolder(folderReader(root));
  // The forecast is an optional add-on: checked when present.
  const { validateForecastFolder } = await import('./forecast-files');
  const forecast = await validateForecastFolder(folderReader(root));
  if (forecast.present) {
    report.filesChecked += forecast.files;
    report.errors.push(...forecast.errors.map((e) => `forecast: ${e}`));
    report.ok = report.ok && forecast.errors.length === 0;
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (report.ok) {
    console.log(
      `OK: ${report.filesChecked} files in ${root} match contract v1 (${secs} s).` +
        (forecast.present ? ` Forecast: ${forecast.files} files.` : ' No forecast files.'),
    );
    return;
  }
  console.error(`FAILED: ${root} (${report.filesChecked} files read, ${secs} s)`);
  for (const e of report.errors) console.error(`- ${e}`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('validate-data.ts')) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
