import { test } from '@playwright/test';
import { choosePreset, expect, openApp } from './helpers';

interface ContribHook {
  contributionCells: number | null;
  dimmed: boolean;
}

const contribHook = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __hotspots: ContribHook }).__hotspots;
    return { contributionCells: h.contributionCells, dimmed: h.dimmed };
  });

test('contributions: shares sum to 100%, the map dims outside the place, Show activity restores', async ({
  page,
}) => {
  await openApp(page, '#month=2017-10');
  await choosePreset(page, 'Portugal', /Central Portugal/);
  const list = page.locator('.contributions');
  await expect(list).toContainText(/cells? makes? up \d+% of October 2017\./);
  const shares = await page
    .locator('.contributions [data-share]')
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-share'))));
  expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  const percents = await page.locator('.contributions .contrib-share').allTextContents();
  const total = percents.reduce((a, p) => a + Number(p.replace('%', '')), 0);
  expect(Math.abs(total - 100)).toBeLessThanOrEqual(percents.length);

  await expect.poll(async () => (await contribHook(page)).dimmed).toBe(true);
  expect((await contribHook(page)).contributionCells).toBeGreaterThan(0);
  await expect(page.locator('.legend-title')).toHaveText(
    "Share of this place's activity in October 2017",
  );

  await page.getByRole('button', { name: 'Show activity' }).click();
  await expect.poll(async () => (await contribHook(page)).dimmed).toBe(false);
  await expect(page.locator('.legend-title')).toContainText('Fire activity, October 2017');
  await page.getByRole('button', { name: 'Show shares on the map' }).click();
  await expect.poll(async () => (await contribHook(page)).dimmed).toBe(true);
});

test('clicking a contribution row flies the map to that cell', async ({ page }) => {
  await openApp(page, '#map=4.00/30.0000/0.0000&month=2017-10');
  await choosePreset(page, 'Portugal', /Central Portugal/);
  await page.waitForTimeout(1200); // the search fly-to
  await page.locator('.contrib-row').first().click();
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          (window as unknown as { __map: { getZoom(): number } }).__map.getZoom(),
        ),
      {
        timeout: 5000,
      },
    )
    .toBeGreaterThanOrEqual(9.9);
  await expect(page).toHaveURL(/map=1\d\.\d\d\/39\.\d+\/-8\.\d+/);
});
