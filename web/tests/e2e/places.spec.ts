import { test } from '@playwright/test';
import { expect, hook, mapReady, openApp, placeCellCount } from './helpers';

test('a click at res 6 gives exactly 7 cells and survives a reload', async ({ page }) => {
  await openApp(page, '#map=8.20/44.6400/7.9300');
  await mapReady(page);
  await expect.poll(async () => (await hook(page)).res).toBe(6);
  const box = (await page.locator('.map-canvas canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => placeCellCount(page)).toBe(7);
  await expect(page).toHaveURL(/place=p:/);
  await expect(page.locator('.panel-header')).toContainText(
    'Neighbourhood: 7 cells, about 250 km²',
  );
  const before = (await hook(page)).placeCells;
  await page.reload();
  await expect
    .poll(async () => (await hook(page).catch(() => null))?.placeCells ?? [])
    .toEqual(before);
});

test('a drawn 50 ha rectangle gives at least 7 cells and the small-area message', async ({
  page,
}) => {
  await openApp(page, '#map=12.00/44.6400/7.9300');
  await mapReady(page);
  await page.getByRole('button', { name: 'Draw area' }).click();
  await page.getByRole('button', { name: 'Rectangle' }).click();
  const box = (await page.locator('.map-canvas canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // At zoom 12 and 44.6 N one pixel is about 13.5 m: 52 px is about 700 m.
  await page.mouse.click(cx, cy);
  await page.mouse.move(cx + 30, cy + 30, { steps: 5 });
  await page.mouse.click(cx + 52, cy + 52);
  await expect.poll(() => placeCellCount(page)).toBeGreaterThanOrEqual(7);
  await expect(page.locator('.panel-header')).toContainText(
    'Satellites cannot resolve an area this small',
  );
  await expect(page.locator('.panel-header')).toContainText(
    /Your shape: \d+ ha \(0\.\d+ km²\)\. Analysis area: \d+ cells/,
  );
  await expect(page).toHaveURL(/place=s:/);
});

test('a polygon over the limit gives the too-large message and no place', async ({ page }) => {
  await openApp(page, '#map=5.00/45.0000/8.0000');
  await mapReady(page);
  await page.getByRole('button', { name: 'Draw area' }).click();
  await page.getByRole('button', { name: 'Polygon' }).click();
  const box = (await page.locator('.map-canvas canvas').boundingBox())!;
  // Clicks on the floating controls, the drawing hint or the legend do not reach the map:
  // keep the points below the top controls and to the right of the legend.
  const pts: [number, number][] = [
    [box.x + 450, box.y + 180],
    [box.x + 1000, box.y + 200],
    [box.x + 950, box.y + 600],
    [box.x + 450, box.y + 580],
  ];
  for (const [x, y] of pts) {
    await page.mouse.move(x, y, { steps: 3 });
    await page.mouse.click(x, y);
  }
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('.toast')).toContainText('This area is too large for a history');
  expect(await placeCellCount(page)).toBe(0);
  await expect(page).not.toHaveURL(/place=/);
});

test('search: coordinates, then a preset', async ({ page }) => {
  await openApp(page);
  const input = page.getByRole('combobox', { name: /Search/ });
  await expect(input).toBeFocused();
  await input.fill('37.6, 14.2');
  await input.press('Enter');
  await expect.poll(() => placeCellCount(page)).toBe(7);
  await expect(page.locator('#place-title')).toContainText('37.6000° N, 14.2000° E');
  await input.fill('Langhe');
  await page.getByRole('option', { name: /Langhe, Italy/ }).click();
  await expect(page.locator('#place-title')).toHaveText('Langhe, Italy');
  await expect.poll(() => placeCellCount(page)).toBe(7);
});

test('geocoder offline: message, and presets still work', async ({ page }) => {
  await page.route('**/photon.komoot.io/**', (r) => r.abort());
  await openApp(page);
  const input = page.getByRole('combobox', { name: /Search/ });
  await input.fill('Somewhere unknown');
  await input.press('Enter');
  await expect(
    page.getByText('Search is offline. Try coordinates or a listed place.'),
  ).toBeVisible();
  await input.fill('Sicily');
  await page.getByRole('option', { name: /Sicily, Italy/ }).click();
  await expect(page.locator('#place-title')).toHaveText('Sicily, Italy');
});
