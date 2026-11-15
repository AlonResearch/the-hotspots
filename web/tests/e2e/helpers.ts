import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { cellToParent, gridDisk, latLngToCell } from 'h3-js';
import { DetailTile, Manifest } from '../../src/data/contract';
import { monthCount } from '../../src/data/months';
import { toTileData } from '../../src/data/tile';
import { allMonthResults, typicalMonths, unusualMonths } from '../../src/stats/history';
import { sumCells } from '../../src/stats/series';

export interface Hook {
  res: number;
  renderedCells: number;
  month: string;
  placeCells: string[];
}

export async function hook(page: Page): Promise<Hook> {
  return page.evaluate(() => {
    const h = (window as unknown as { __hotspots: Hook }).__hotspots;
    return {
      res: h.res,
      renderedCells: h.renderedCells,
      month: h.month,
      placeCells: [...h.placeCells],
    };
  });
}

/** Opens the app at a hash and waits for the first cell frame. */
export async function openApp(page: Page, hash = ''): Promise<void> {
  await page.goto(`/${hash}`);
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __hotspots?: unknown }).__hotspots),
  );
}

/** Waits until the map has finished loading its style. */
export async function mapReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const m = (window as unknown as { __map?: { loaded(): boolean } }).__map;
    return Boolean(m && m.loaded());
  });
}

/** Opens the More options menu, where the detail level (simple or scientific) lives. */
export async function openOptions(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'More options' });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

export async function setStore(page: Page, fn: string): Promise<void> {
  await page.evaluate(`window.__store.getState().${fn}`);
}

export async function placeCellCount(page: Page): Promise<number> {
  return (await hook(page)).placeCells.length;
}

export interface DailyHook {
  dailyAvailable: boolean;
  day: number | null;
  drawnTotal: number;
}

export async function dailyHook(page: Page): Promise<DailyHook> {
  return page.evaluate(() => {
    const h = (window as unknown as { __hotspots: DailyHook }).__hotspots;
    return { dailyAvailable: h.dailyAvailable, day: h.day, drawnTotal: h.drawnTotal };
  });
}

/** Months of the fixture daily area with active cells (Piemonte west, February and March). */
export const DAILY_MONTHS = ['2024-03', '2024-02', '2022-03', '2014-02', '2017-03', '2020-02'];

/** Steps through candidate months until the view offers day mode; returns that month. */
export async function findDailyMonth(page: Page): Promise<string> {
  for (const m of DAILY_MONTHS) {
    await setStore(page, `setMonth('${m}')`);
    try {
      await expect
        .poll(async () => (await dailyHook(page)).dailyAvailable, { timeout: 4000 })
        .toBe(true);
      return m;
    } catch {
      // No active cell in view this month: try the next.
    }
  }
  throw new Error('no month with daily values in view');
}

export { expect };

const DATA = join(process.cwd(), 'public/data');
const read = (p: string): unknown => JSON.parse(readFileSync(join(DATA, p), 'utf8'));
export const manifest = Manifest.parse(read('manifest.json'));

/** The same computation as the app, from the unit-tested functions and the files on disk. */
export function expectedFor(lat: number, lon: number) {
  const cells = gridDisk(latLngToCell(lat, lon, 6), 1);
  const tiles = new Map<string, ReturnType<typeof toTileData>>();
  for (const c of cells) {
    const p = cellToParent(c, 3);
    if (!tiles.has(p)) tiles.set(p, toTileData(DetailTile.parse(read(`detail/${p}.json`))));
  }
  const n = monthCount(manifest.record.start, manifest.record.end);
  const series = sumCells(cells, (c) => tiles.get(cellToParent(c, 3)), manifest.record.start, n);
  const results = allMonthResults(series, manifest);
  return {
    cells,
    series,
    results,
    typical: typicalMonths(series, manifest),
    unusual: unusualMonths(results),
  };
}

export async function choosePreset(page: Page, query: string, name: RegExp): Promise<void> {
  const input = page.getByRole('combobox', { name: /Search/ });
  await input.fill(query);
  await page.getByRole('option', { name }).click();
  await expect(page.locator('.summary-sentence')).toBeVisible();
}
