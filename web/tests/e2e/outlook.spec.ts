/**
 * The outlook: forecast months after the record on the strip, the strip filled by the forecast
 * year, the forecast row of the calendar, the forecast on the map, and both detail levels.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { cellToParent } from 'h3-js';
import { DetailTile } from '../../src/data/contract';
import { ForecastManifest, ForecastTile } from '../../src/data/forecast';
import { toTileData } from '../../src/data/tile';
import { placeForecast, tileRows } from '../../src/stats/forecast';
import { formatValue } from '../../src/stats/wording';
import { choosePreset, expect, expectedFor, manifest, openApp } from './helpers';

const DATA = join(process.cwd(), 'public/data');
const read = (p: string): unknown => JSON.parse(readFileSync(join(DATA, p), 'utf8'));
const fc = ForecastManifest.parse(read('forecast/manifest.json'));

/** The forecast of the 7 cells around a point, from the unit-tested functions and the files. */
function expectedForecast(lat: number, lon: number) {
  const e = expectedFor(lat, lon);
  const tiles = new Map<string, ForecastTile>();
  const rowsOf = (area: string) => {
    const p = cellToParent(area, 1);
    if (!fc.tiles.includes(p)) return null;
    if (!tiles.has(p)) tiles.set(p, ForecastTile.parse(read(`forecast/r4/${p}.json`)));
    return tileRows(tiles.get(p), area);
  };
  // expectedFor sums from the detail tiles; the same tiles give the area shares.
  const detail = new Map<string, ReturnType<typeof detailTile>>();
  const tileOf = (c: string) => {
    const p = cellToParent(c, 3);
    if (!detail.has(p)) detail.set(p, detailTile(p));
    return detail.get(p);
  };
  return placeForecast(e.cells, e.series, tileOf, rowsOf, fc, manifest);
}

function detailTile(parent: string) {
  return toTileData(DetailTile.parse(read(`detail/${parent}.json`)));
}

const slider = (page: Page) => page.getByRole('slider', { name: /^Month/ });
const toggle = (page: Page) => page.getByRole('button', { name: /forecast on the whole strip/ });
const store = <T>(page: Page, key: string) =>
  page.evaluate(
    (k) =>
      (
        window as unknown as { __store: { getState(): Record<string, unknown> } }
      ).__store.getState()[k] as T,
    key,
  );
const mapForecast = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __hotspots: { forecast: { month: string; res: number; cells: number } | null };
        }
      ).__hotspots.forecast,
  );

test('the strip shows the forecast months after the record, with the world totals', async ({
  page,
}) => {
  await openApp(page);
  const bars = page.locator('.strip-svg g[data-forecast-month]');
  await expect(bars).toHaveCount(fc.n_months);
  const values = await bars.evaluateAll((gs) =>
    gs.map((g) => Number(g.getAttribute('data-value'))),
  );
  expect(values).toEqual(fc.world.mean);
  // Forecast bars are see-through and never the solid data colour.
  const bar = bars.first().locator('rect.forecast-bar');
  await expect(bar).toHaveAttribute('fill-opacity', '0.6');
  const observed = await page
    .locator('.strip-svg g[data-month="2024-08"] rect.bar')
    .first()
    .getAttribute('fill');
  expect(await bar.getAttribute('fill')).not.toBe(observed);
});

test('keyboard: Right from the last month enters the forecast, Left comes back', async ({
  page,
}) => {
  await openApp(page);
  const s = slider(page);
  await s.focus();
  await page.keyboard.press('End');
  await expect(s).toHaveAttribute('aria-valuetext', /^November 2026/);
  await page.keyboard.press('ArrowRight');
  await expect(s).toHaveAttribute('aria-valuetext', /^January 2027, forecast, about /);
  await expect(page).toHaveURL(/outlook=2027-01/);
  await expect.poll(async () => (await mapForecast(page))?.month).toBe('2027-01');
  await page.keyboard.press('ArrowRight');
  await expect(s).toHaveAttribute('aria-valuetext', /^February 2027, forecast/);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(s).toHaveAttribute('aria-valuetext', /^November 2026/);
  await expect(page).not.toHaveURL(/outlook=/);
  expect(await mapForecast(page)).toBeNull();
});

test('one button makes the forecast year the whole strip, and back', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.strip-outlook')).toHaveCount(0);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  const wide = page.locator('.strip-outlook');
  await expect(wide).toBeVisible();
  await expect(wide.locator('g[data-forecast-month]')).toHaveCount(fc.n_months);
  await expect(page.getByRole('slider', { name: /^Forecast month/ })).toHaveAttribute(
    'aria-valuetext',
    /^January 2027, forecast/,
  );
  // The twelve bars fill the strip.
  const box = (await wide.boundingBox())!;
  const lastBar = (await wide
    .locator('g[data-forecast-month="2027-12"] rect.outlook-hit')
    .boundingBox())!;
  expect(lastBar.x + lastBar.width).toBeGreaterThan(box.x + box.width - 12);
  // A click on a column selects that month, on the strip and on the map.
  await wide.locator('g[data-forecast-month="2027-08"] rect.outlook-hit').click();
  await expect.poll(() => store<string>(page, 'outlookMonth')).toBe('2027-08');
  await expect.poll(async () => (await mapForecast(page))?.month).toBe('2027-08');
  expect((await mapForecast(page))!.cells).toBeGreaterThan(0);
  await expect(page.locator('.legend')).toContainText('Forecast, August 2027');
  await expect(page.locator('.legend')).toContainText('a forecast, not an observation');
  await toggle(page).click();
  await expect(page.locator('.strip-outlook')).toHaveCount(0);
  await expect(slider(page)).toBeVisible();
});

test('zoomed in, the forecast stays at res 4 and only the areas near the view are drawn', async ({
  page,
}) => {
  await openApp(page, '#map=8.20/37.6000/14.2000&outlook=2027-08');
  const all = (read('forecast/map/r4/2027-08.json') as { cell: string[] }).cell.length;
  await expect.poll(async () => (await mapForecast(page))?.res).toBe(4);
  await expect.poll(async () => (await mapForecast(page))?.cells ?? 0).toBeGreaterThan(0);
  expect((await mapForecast(page))!.cells).toBeLessThan(all);
  await expect(page.locator('.legend')).toContainText('Cells: about 1,770 km²');
});

test('a place gets a forecast row in the calendar and a forecast sentence', async ({ page }) => {
  await openApp(page, '#month=2017-08');
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  const e = expectedForecast(37.6, 14.2);
  const cells = page.locator('.calendar .cal-cell.is-forecast');
  await expect(cells).toHaveCount(fc.n_months);
  // The row sits above the newest year of the record.
  await expect(page.locator('.calendar tbody tr').first().locator('th')).toHaveText('2027');
  const august = page.locator('.cal-cell[data-forecast-month="2027-08"]');
  await expect(august).toHaveAttribute(
    'aria-label',
    `August 2027, forecast, about ${formatValue(e.p50[7]!)} active cell-days`,
  );
  // Place bars on the strip are the same values.
  const stripValues = await page
    .locator('.strip-svg g[data-forecast-month]')
    .evaluateAll((gs) => gs.map((g) => Number(g.getAttribute('data-value'))));
  stripValues.forEach((v, k) => expect(v).toBeCloseTo(e.p50[k]!, 6));

  await august.click();
  const summary = page.locator('.summary.is-forecast');
  await expect(summary).toContainText('August 2027.');
  await expect(summary.locator('.status-forecast')).toHaveText('Forecast');
  await expect(summary).toContainText('not a weather forecast');
  await expect(august).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cal-cell[aria-pressed="true"]')).toHaveCount(1);
  // The record sentence is replaced, not shown next to it.
  await expect(page.locator('.summary')).toHaveCount(1);
  await expect(page).toHaveURL(/outlook=2027-08/);

  await summary.getByRole('button', { name: 'Back to August 2017' }).click();
  await expect(page.locator('.summary.is-forecast')).toHaveCount(0);
  await expect(page.locator('.summary-sentence')).toContainText('August 2017.');
  expect(await store<string | null>(page, 'outlookMonth')).toBeNull();
});

test('arrow keys in the calendar step from the record into the forecast row', async ({ page }) => {
  await openApp(page, '#month=2026-11');
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  await page.locator('.cal-cell[aria-pressed="true"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => store<string>(page, 'outlookMonth')).toBe('2027-01');
  await expect(page.locator('.cal-cell[data-forecast-month="2027-01"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => store<string | null>(page, 'outlookMonth')).toBeNull();
  await expect(page.locator('.summary-sentence')).toContainText('November 2026');
});

test('simple mode keeps to words; scientific mode adds the range, the model and a CSV', async ({
  page,
}) => {
  await openApp(page, '#month=2017-08&outlook=2027-08');
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  const e = expectedForecast(37.6, 14.2);
  await expect(page.locator('.outlook')).toContainText('Forecast for 2027');
  await expect(page.locator('.outlook table')).toHaveCount(0);
  await expect(page.locator('.summary.is-forecast')).toContainText('Likely between');

  await page.evaluate(() =>
    (window as unknown as { __store: { getState(): { setMode(m: string): void } } }).__store
      .getState()
      .setMode('sci'),
  );
  await expect(page.locator('.summary.is-forecast')).toContainText('10% to 90% range');
  const table = page.getByRole('table', { name: /Forecast by month/ });
  await expect(table.locator('tbody tr')).toHaveCount(fc.n_months);
  await expect(table.locator('tbody tr[aria-current="true"] th')).toHaveText('August 2027');
  await expect(page.locator('.outlook')).toContainText('How the forecast is made');
  await expect(page.locator('.outlook')).toContainText(fc.model.name);
  await expect(slider(page)).toHaveAttribute('aria-valuetext', /likely .* to .*, usual /);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download forecast CSV' }).click(),
  ]);
  const rows = readFileSync((await download.path())!, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'));
  expect(rows[0]).toBe('month,p10,p50,p90,usual,status');
  expect(rows).toHaveLength(fc.n_months + 1);
  const august = rows[8]!.split(',');
  expect(august[0]).toBe('2027-08');
  expect(Number(august[2])).toBeCloseTo(e.p50[7]!, 1);
  expect(august[5]).toBe('forecast');
});

test('a build without forecast files has no forecast anywhere', async ({ page }) => {
  await page.route('**/forecast/**', (route) => route.fulfill({ status: 404, body: '' }));
  await openApp(page, '#month=2017-08&outlook=2027-08');
  await expect(page).not.toHaveURL(/outlook=/);
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  await expect(page.locator('.strip-svg g[data-month]')).not.toHaveCount(0);
  await expect(page.locator('g[data-forecast-month]')).toHaveCount(0);
  await expect(toggle(page)).toHaveCount(0);
  await expect(page.locator('.cal-cell.is-forecast')).toHaveCount(0);
  await expect(page.locator('.outlook')).toHaveCount(0);
});
