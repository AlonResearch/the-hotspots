import { test } from '@playwright/test';
import { expect, hook, mapReady, openApp, openOptions, placeCellCount } from './helpers';

const zoomTo = (page: import('@playwright/test').Page, zoom: number, center?: [number, number]) =>
  page.evaluate(
    ([z, c]) =>
      (window as unknown as { __map: { jumpTo(o: object): void } }).__map.jumpTo(
        c ? { zoom: z, center: c } : { zoom: z },
      ),
    [zoom, center ?? null] as const,
  );

test('first load: map, legend, world strip, focused search, fixture badge and data date', async ({
  page,
}) => {
  await openApp(page);
  await mapReady(page);
  await expect(page.locator('.map-canvas canvas')).toBeVisible();
  await expect(page.locator('.legend')).toContainText('Fire activity');
  await expect(page.locator('.strip-label')).toHaveText('World');
  await expect(page.getByRole('combobox', { name: /Search/ })).toBeFocused();
  await expect(page.getByText('Fixture data', { exact: true })).toBeVisible();
  await expect(page.locator('.footer .data-through')).toHaveText('Data through 14 Nov 2026');
  expect((await hook(page)).renderedCells).toBeGreaterThan(0);
  // The tests run with the bundled Natural Earth basemap.
  const layers = await page.evaluate(() =>
    (window as unknown as { __map: { getStyle(): { layers: { id: string }[] } } }).__map
      .getStyle()
      .layers.map((l) => l.id),
  );
  expect(layers).toContain('land');
});

test('zoom steps through res 3, 4, 5 and 6 and the legend chip follows', async ({ page }) => {
  await openApp(page, '#map=3.00/37.6000/14.2000');
  await mapReady(page);
  const steps: [number, number, string][] = [
    [3, 3, 'Cells: about 12,400 km²'],
    [5.2, 4, 'Cells: about 1,770 km²'],
    [6.7, 5, 'Cells: about 250 km²'],
    [8.3, 6, 'Finest cell: 36 km² (3,600 ha)'],
  ];
  for (const [zoom, res, chip] of steps) {
    await zoomTo(page, zoom);
    await expect.poll(async () => (await hook(page)).res).toBe(res);
    await expect(page.locator('.legend .chip').first()).toHaveText(chip);
  }
});

test('outside the fixture regions at res 6 the detail notice shows', async ({ page }) => {
  await openApp(page, '#map=8.30/48.0000/2.0000');
  await mapReady(page);
  await expect(page.locator('.legend')).toContainText(
    'Detail is not available here in this build.',
  );
});

test('a click at res 4 selects a cell, opens History and puts the cell in the URL', async ({
  page,
}) => {
  await openApp(page, '#map=5.20/39.9000/-8.1000&month=2017-08');
  await mapReady(page);
  await expect.poll(async () => (await hook(page)).res).toBe(4);
  const box = (await page.locator('.map-canvas canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(/place=c:84/);
  await expect(page.locator('#place-title')).toHaveText('Selected cell');
  await expect(page.locator('.summary-sentence')).toContainText('August 2017.');
  await expect.poll(() => placeCellCount(page)).toBe(49);
});

test('a reload with a full URL restores map, month, place, mode and view', async ({ page }) => {
  const hash =
    '#map=7.50/39.9000/-8.1000&month=2017-10&place=p:39.9000,-8.1000&label=Central%20Portugal&mode=sci&view=raw-viirs';
  await openApp(page, hash);
  await mapReady(page);
  await expect(page.locator('#place-title')).toHaveText('Central Portugal');
  await expect(page.locator('.summary-sentence')).toContainText('October 2017.');
  await expect(page.locator('.mode-sign')).toHaveText('Scientific mode');
  await openOptions(page);
  await expect(page.getByRole('button', { name: 'Scientific' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('group', { name: 'Values shown' }).getByRole('button', { name: 'Raw VIIRS' }),
  ).toHaveAttribute('aria-pressed', 'true');
  const view = await page.evaluate(() => {
    const m = (
      window as unknown as {
        __map: { getZoom(): number; getCenter(): { lat: number; lng: number } };
      }
    ).__map;
    return { z: m.getZoom(), lat: m.getCenter().lat, lon: m.getCenter().lng };
  });
  expect(view.z).toBeCloseTo(7.5, 1);
  expect(view.lat).toBeCloseTo(39.9, 2);
  expect(view.lon).toBeCloseTo(-8.1, 2);
  await page.reload();
  await expect(page.locator('#place-title')).toHaveText('Central Portugal');
  await expect(page).toHaveURL(new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(1)));
});

test('the manifest failing shows a blocking message with Retry', async ({ page }) => {
  let fail = true;
  await page.route('**/data/manifest.json', (r) =>
    fail ? r.fulfill({ status: 500 }) : r.continue(),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The data could not be loaded');
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.legend')).toBeVisible();
});

test('a failing detail tile shows a panel message with Retry', async ({ page }) => {
  let fail = true;
  await page.route('**/data/detail/833f*.json', (r) =>
    fail ? r.fulfill({ status: 500 }) : r.continue(),
  );
  await openApp(page, '#map=4.00/37.6000/14.2000&place=p:37.6000,14.2000&label=Sicily');
  await expect(page.locator('.notice-inline.is-error')).toContainText('HTTP 500');
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.summary-sentence')).toBeVisible();
});

test('the map style choice in the menu works and is remembered (D23)', async ({ page }) => {
  await openApp(page);
  await mapReady(page);
  await openOptions(page);
  const group = page.getByRole('group', { name: 'Map style' });
  await expect(group.getByRole('button', { name: 'Detailed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The tests run on the bundled basemap, which has no roads or names: the menu says so.
  await expect(page.locator('#more-menu')).toContainText('The online map did not load');
  await group.getByRole('button', { name: 'Quiet' }).click();
  await expect(group.getByRole('button', { name: 'Quiet' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await mapReady(page);
  await openOptions(page);
  await expect(
    page.getByRole('group', { name: 'Map style' }).getByRole('button', { name: 'Quiet' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('the cell grid shows when hexagons are wide enough, with its legend entry (D22)', async ({
  page,
}) => {
  await openApp(page, '#map=2.00/25.0000/10.0000&month=2017-08');
  await mapReady(page);
  await expect(page.locator('.legend-none')).toHaveCount(0);
  await openApp(page, '#map=8.20/37.6000/14.2000&month=2017-08');
  await mapReady(page);
  await expect(page.locator('.legend-none')).toHaveText('No fire detected');
});
