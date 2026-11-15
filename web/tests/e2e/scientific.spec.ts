import { readFileSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { monthToIndex } from '../../src/data/months';
import { parsePlaceCsv } from '../../src/stats/csv';
import { choosePreset, expect, expectedFor, manifest, openApp, openOptions } from './helpers';

const barValues = (page: Page) =>
  page
    .locator('.strip-svg g[data-month]')
    .evaluateAll((gs) => gs.map((g) => Number(g.getAttribute('data-value'))));

test('mode switch keeps place and month; Raw changes the strip before 2012-02 only', async ({
  page,
}) => {
  await openApp(page, '#month=2017-08');
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  await openOptions(page);
  await page.getByRole('button', { name: 'Scientific' }).click();
  await expect(page).toHaveURL(/mode=sci/);
  // The menu closes on the change and the sign shows the mode.
  await expect(page.locator('#more-menu')).toHaveCount(0);
  await expect(page.locator('.mode-sign')).toBeVisible();
  await expect(page).toHaveURL(/month=2017-08/);
  await expect(page.locator('#place-title')).toHaveText('Sicily, Italy');
  await expect(page.locator('.sci-extras')).toBeVisible();

  const harmonized = await barValues(page);
  await page
    .getByRole('group', { name: 'Strip values' })
    .getByRole('button', { name: 'Raw' })
    .click();
  await expect.poll(async () => (await barValues(page)).join(',')).not.toBe(harmonized.join(','));
  const raw = await barValues(page);
  const ref = monthToIndex(manifest.record.start, manifest.first_reference_month);
  const active = harmonized
    .slice(0, ref)
    .map((_, i) => i)
    .filter((i) => harmonized[i]! > 0);
  const changed = active.filter((i) => raw[i] !== harmonized[i]);
  expect(active.length).toBeGreaterThan(10);
  expect(changed.length).toBe(active.length);
  expect(raw.slice(ref)).toEqual(harmonized.slice(ref));
});

test('world seam check: raw step above 1.5, harmonized between 0.8 and 1.25', async ({ page }) => {
  await openApp(page, '#mode=sci');
  await page.getByRole('button', { name: 'Seams' }).click();
  const seam = page.locator('#strip-seams li[data-seam="2012-02"]');
  await expect(seam).toContainText('VIIRS starts (S-NPP)');
  const raw = Number(await seam.getAttribute('data-raw'));
  const h = Number(await seam.getAttribute('data-h'));
  expect(raw).toBeGreaterThan(1.5);
  expect(h).toBeGreaterThan(0.8);
  expect(h).toBeLessThan(1.25);
  await expect(page.locator('#strip-seams')).toContainText('A description, not a test');
});

test('sensor table, baseline, provenance and method tables are shown', async ({ page }) => {
  await openApp(page, '#month=2005-08&mode=sci');
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  const x = page.locator('.sci-extras');
  await expect(x).toContainText('Raw MODIS group');
  await expect(x).toContainText('Terra (MODIS)');
  await expect(x).toContainText(/band \d/);
  await expect(x.locator('.baseline-line')).toContainText(
    'Baseline 2003 to 2025, VIIRS-equivalent, 14 years (2005 left out).',
  );
  await expect(x).toContainText('Method version: fixture-1');
  await expect(x).toContainText('Transfer ratios for this place');
  await expect(x).toContainText('Leave-one-year-out');
  await expect(x).toContainText('Seam check');
});

test('known issues show on the months they touch', async ({ page }) => {
  await openApp(page, '#month=2022-07&mode=sci');
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  await expect(page.locator('.sci-extras')).toContainText('Known issues in July 2022');
});

test('series view drives the map layer and the URL', async ({ page }) => {
  await openApp(page, '#map=8.20/37.6000/14.2000&month=2005-08&mode=sci');
  await page
    .getByRole('group', { name: 'Values shown' })
    .getByRole('button', { name: 'Raw MODIS' })
    .click();
  await expect(page).toHaveURL(/view=raw-modis/);
  await expect(page.locator('.legend-title')).toContainText('(Raw MODIS)');
  await openOptions(page);
  await page.getByRole('button', { name: 'Simple' }).click();
  await expect(page).not.toHaveURL(/view=/);
  await expect(page.locator('.mode-sign')).toHaveCount(0);
});

test('CSV download parses and its h column equals the summed series', async ({ page }) => {
  await openApp(page, '#month=2017-08&mode=sci');
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).toContain('# Place definition: p:37.6000,14.2000');
  expect(text).toContain('# Method version: fixture-1');
  const rows = parsePlaceCsv(text);
  const e = expectedFor(37.6, 14.2);
  expect(rows).toHaveLength(e.series.n);
  rows.forEach((r, t) =>
    expect(Math.abs(Number(r.h) - e.series.h[t]!)).toBeLessThanOrEqual(0.05001),
  );
  expect(rows[0]!.status).toBe('estimated');
  expect(rows[rows.length - 1]!.status).toBe('partial');
});
