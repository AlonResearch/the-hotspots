/**
 * Daily views (plan 4.6): only where the build has daily fields. The fixtures have a small daily
 * area (Piemonte west); everywhere else the app must look and work as before.
 */
import { test } from '@playwright/test';
import { daysInMonth } from '../../src/data/months';
import { dailyHook, expect, findDailyMonth, hook, mapReady, openApp, setStore } from './helpers';

const PIEMONTE = 'place=p:44.9000,7.6000&label=Piemonte';
const EAST = 'place=p:44.9000,8.3000&label=East%20of%20the%20area';
const EDGE = 'place=p:44.9000,7.7500&label=Edge';

test.describe('History: day by day', () => {
  test('a place inside the daily area shows the running total, then a 5-day sum', async ({
    page,
  }) => {
    await openApp(page, `#month=2019-01&${PIEMONTE}`);
    const daily = page.locator('.daily');
    await expect(daily).toBeVisible();
    await expect(daily.locator('h4')).toHaveText('Day by day');
    await expect(daily).toContainText('UTC days');
    const chart = daily.locator('svg');
    await expect(chart).toHaveAttribute('data-view', 'total');
    await expect(chart).toHaveAttribute('data-days', '31');
    // The running total ends at the month value (1.0 for this place in January 2019).
    expect(Number(await chart.getAttribute('data-total'))).toBeCloseTo(1, 5);
    await expect(daily.locator('.daily-readout')).toContainText('active cell-days in January 2019');
    const group = page.getByRole('group', { name: 'Daily view' });
    await expect(group.getByRole('button', { name: 'Running total' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await group.getByRole('button', { name: '5-day sum' }).click();
    await expect(chart).toHaveAttribute('data-view', 'rolling');
    await expect(daily.locator('.daily-readout')).toContainText('5-day sum');
    // Hover is a desktop extra: the day under the pointer is read out.
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await expect(daily.locator('.daily-readout')).toContainText('January:');
  });

  test('an estimated month keeps the Estimated marker on the daily view', async ({ page }) => {
    await openApp(page, `#month=2005-03&${PIEMONTE}`);
    await expect(page.locator('.daily .status')).toHaveText('Estimated');
    expect(Number(await page.locator('.daily svg').getAttribute('data-total'))).toBeCloseTo(1.4, 5);
  });

  test('a quiet month of a covered place says so instead of drawing nothing', async ({ page }) => {
    await openApp(page, `#month=2019-07&${PIEMONTE}`);
    await expect(page.locator('.daily-readout')).toContainText('No fire detected on any day');
  });

  for (const [what, p] of [
    ['outside the daily area', EAST],
    ['only partly inside it', EDGE],
  ] as const) {
    test(`a place ${what} has no daily control at all`, async ({ page }) => {
      await openApp(page, `#month=2019-01&${p}`);
      await expect(page.locator('.summary-sentence')).toBeVisible();
      await expect(page.locator('.daily')).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Daily view' })).toHaveCount(0);
    });
  }
});

test.describe('Map: day by day', () => {
  test('zoomed on the daily area: the month builds up day by day, then back', async ({ page }) => {
    await openApp(page, '#map=9.50/44.9000/6.9000&month=2024-03');
    await mapReady(page);
    const month = await findDailyMonth(page);
    const whole = (await dailyHook(page)).drawnTotal;
    expect(whole).toBeGreaterThan(0);
    // Monthly playback stays the default and stays available.
    await expect(page.getByRole('button', { name: 'Play months' })).toBeVisible();

    await page.getByRole('button', { name: 'Day by day' }).click();
    const bar = page.getByRole('group', { name: /^Days of / });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('UTC days');
    const slider = bar.getByRole('slider', { name: 'Day of the month' });
    // It starts on the last day: the same map as the whole month.
    await expect(slider).toHaveValue(String(daysInMonth(month)));
    expect((await dailyHook(page)).drawnTotal).toBeCloseTo(whole, 3);

    await slider.fill('1');
    await expect.poll(async () => (await dailyHook(page)).day).toBe(1);
    expect((await dailyHook(page)).drawnTotal).toBeLessThanOrEqual(whole + 1e-6);

    await bar.getByRole('button', { name: 'Play days' }).click();
    await expect
      .poll(async () => (await dailyHook(page)).day, { timeout: 5000 })
      .toBeGreaterThan(2);
    await bar.getByRole('button', { name: 'Pause days' }).click();

    await bar.getByRole('button', { name: 'Back to the whole month' }).click();
    await expect(bar).toHaveCount(0);
    expect((await dailyHook(page)).drawnTotal).toBeCloseTo(whole, 3);
  });

  test('moving the view past the daily area leaves day mode without a broken control', async ({
    page,
  }) => {
    await openApp(page, '#map=9.50/44.9000/6.9000&month=2024-03');
    await mapReady(page);
    await findDailyMonth(page);
    await page.getByRole('button', { name: 'Day by day' }).click();
    await expect(page.getByRole('group', { name: /^Days of / })).toBeVisible();
    await setStore(page, 'flyTo({ center: [10, 25], zoom: 2 })');
    await expect.poll(async () => (await dailyHook(page)).dailyAvailable).toBe(false);
    await expect(page.getByRole('group', { name: /^Days of / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Day by day' })).toHaveCount(0);
    expect((await dailyHook(page)).day).toBe(null);
  });

  test('outside the daily area the map offers monthly playback only', async ({ page }) => {
    for (const hash of [
      '#map=2.00/25.0000/10.0000&month=2024-03',
      '#map=9.00/37.6000/14.2000&month=2017-08',
    ]) {
      await openApp(page, hash);
      await mapReady(page);
      await expect.poll(async () => (await hook(page)).renderedCells).toBeGreaterThan(0);
      expect((await dailyHook(page)).dailyAvailable).toBe(false);
      await expect(page.getByRole('button', { name: 'Day by day' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Play months' })).toBeVisible();
    }
  });
});
