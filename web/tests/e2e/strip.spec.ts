import { test } from '@playwright/test';
import { expect, openApp } from './helpers';

const slider = (page: import('@playwright/test').Page) =>
  page.getByRole('slider', { name: /Month/ });

test('bars match the world series values', async ({ page, request }) => {
  await openApp(page);
  const summary = (await (await request.get('/data/summary/global.json')).json()) as {
    h: number[];
  };
  const bars = page.locator('.strip-svg g[data-month]');
  await expect(bars).toHaveCount(summary.h.length);
  const values = await bars.evaluateAll((gs) =>
    gs.map((g) => Number(g.getAttribute('data-value'))),
  );
  expect(values).toEqual(summary.h);
  // Heights follow a square-root scale of the value.
  const h = await bars.evaluateAll((gs) =>
    gs.map((g) => (g.querySelector('rect.bar') as SVGRectElement).getBBox().height),
  );
  const max = Math.max(...summary.h);
  const i = summary.h.indexOf(max);
  const j = summary.h.findIndex((v) => v > 0 && v < max / 4);
  expect(h[j]! / h[i]!).toBeCloseTo(Math.sqrt(summary.h[j]! / max), 1);
});

test('keyboard: Right, Page Up, Home and End change the month and the value text', async ({
  page,
}) => {
  await openApp(page, '#month=2024-08');
  const s = slider(page);
  await s.focus();
  await expect(s).toHaveAttribute('aria-valuetext', /^August 2024, /);
  await page.keyboard.press('ArrowRight');
  await expect(s).toHaveAttribute('aria-valuetext', /^September 2024, /);
  await page.keyboard.press('PageUp');
  await expect(s).toHaveAttribute('aria-valuetext', /^September 2023, /);
  await page.keyboard.press('PageDown');
  await expect(s).toHaveAttribute('aria-valuetext', /^September 2024, /);
  await page.keyboard.press('Home');
  await expect(s).toHaveAttribute('aria-valuetext', /^November 2000, .*estimated/);
  await expect(page).toHaveURL(/month=2000-11/);
  await page.keyboard.press('End');
  await expect(s).toHaveAttribute('aria-valuetext', /^November 2026, .*month not complete/);
});

test('estimated months are hatched, provisional dotted, partial outlined', async ({ page }) => {
  await openApp(page);
  const est = page.locator('.strip-svg g[data-month="2005-08"] rect[fill="url(#hatch-est)"]');
  await expect(est).toHaveCount(1);
  await expect(
    page.locator('.strip-svg g[data-month="2013-08"] rect[fill^="url(#hatch"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('.strip-svg g[data-month="2026-09"] rect[fill="url(#hatch-prov)"]'),
  ).toHaveCount(1);
  await expect(page.locator('.strip-svg g[data-month="2026-11"] rect.bar').first()).toHaveAttribute(
    'fill',
    'none',
  );
});

test('play advances and stops at the last month', async ({ page }) => {
  await openApp(page, '#month=2026-07');
  await page.getByRole('button', { name: 'Play months' }).click();
  await expect(slider(page)).toHaveAttribute('aria-valuetext', /^August 2026/, { timeout: 5000 });
  await expect(slider(page)).toHaveAttribute('aria-valuetext', /^November 2026/, {
    timeout: 10000,
  });
  await expect(page.getByRole('button', { name: 'Play months' })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(slider(page)).toHaveAttribute('aria-valuetext', /^November 2026/);
});

test('clicking a bar selects its month', async ({ page }) => {
  await openApp(page, '#month=2024-08');
  const bar = page.locator('.strip-svg g[data-month="2017-10"] rect.bar').first();
  const box = (await page.locator('.strip-svg').boundingBox())!;
  const x = Number(await bar.getAttribute('x'));
  await page.mouse.click(box.x + x + 1, box.y + box.height / 2);
  await expect(slider(page)).toHaveAttribute('aria-valuetext', /^October 2017/);
});
