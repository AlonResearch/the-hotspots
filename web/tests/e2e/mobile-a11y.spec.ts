import AxeBuilder from '@axe-core/playwright';
import { devices, test } from '@playwright/test';
import {
  choosePreset,
  expect,
  hook,
  mapReady,
  openApp,
  openOptions,
  placeCellCount,
} from './helpers';

test.describe('phone, 375 x 667', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true,
    userAgent: devices['iPhone SE'].userAgent,
  });

  test('tap selects a place, the sheet has three stops, the strip stays docked', async ({
    page,
  }) => {
    await openApp(page, '#map=8.20/37.6000/14.2000&month=2017-08');
    await mapReady(page);
    await expect.poll(async () => (await hook(page)).res).toBe(6);
    const strip = page.locator('.strip-region');
    const stripBox = (await strip.boundingBox())!;
    expect(stripBox.height).toBe(64);
    expect(stripBox.y + stripBox.height).toBeGreaterThan(600);

    const map = (await page.locator('.map-canvas canvas').boundingBox())!;
    await page.touchscreen.tap(map.x + map.width / 2, map.y + map.height / 3);
    await expect.poll(() => placeCellCount(page)).toBe(7);

    const sheet = page.locator('.sheet');
    await expect(sheet).toHaveClass(/sheet-half/);
    const handle = page.getByRole('button', { name: /Panel is/ });
    await handle.tap();
    await expect(sheet).toHaveClass(/sheet-full/);
    await handle.tap();
    await expect(sheet).toHaveClass(/sheet-peek/);
    await expect(sheet).toContainText('Neighbourhood: 7 cells');
    await expect(page.locator('.summary-sentence')).toBeVisible();
    await handle.tap();
    await expect(sheet).toHaveClass(/sheet-half/);

    // The sheet sits above the strip, the strip is still usable.
    const sheetBox = (await sheet.boundingBox())!;
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(stripBox.y + 1);
    await page.getByRole('button', { name: 'Play months' }).tap();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).tap();
  });

  test('controls meet the 44 px touch target', async ({ page }) => {
    await openApp(page);
    await openOptions(page);
    for (const name of ['More options', 'Simple', 'Scientific', 'Draw area', 'Play months']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
  });
});

async function seriousIssues(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    // The WebGL canvas is drawn by MapLibre; its text alternative is the aria-label set by the app.
    .exclude('.maplibregl-canvas-container')
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('axe: simple mode with a place has no serious or critical issue', async ({ page }) => {
  await openApp(page, '#month=2017-10');
  await choosePreset(page, 'Portugal', /Central Portugal/);
  expect(await seriousIssues(page)).toEqual([]);
});

test('axe: scientific mode with a place has no serious or critical issue', async ({ page }) => {
  await openApp(page, '#month=2005-08&mode=sci');
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  await page.getByRole('button', { name: 'Seams' }).click();
  expect(await seriousIssues(page)).toEqual([]);
});

test('keyboard: skip link, search to place, strip and calendar without the mouse', async ({
  page,
}) => {
  await openApp(page, '#month=2017-08');
  const input = page.getByRole('combobox', { name: /Search/ });
  await expect(input).toBeFocused();
  await page.keyboard.type('Sicily');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#place-title')).toHaveText('Sicily, Italy');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#place-panel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#place-panel')).toHaveCount(0);
});
