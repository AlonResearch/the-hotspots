/**
 * Phone audit: every feature reachable by touch, and scrolling a list, the strip or the
 * panel never triggers the controls under the finger (the failure seen in other fire apps).
 * Gestures are real touch input sent through the Chrome DevTools Protocol.
 */
import AxeBuilder from '@axe-core/playwright';
import { devices, test, type Page } from '@playwright/test';
import {
  choosePreset,
  expect,
  hook,
  mapReady,
  openApp,
  openOptions,
  placeCellCount,
  dailyHook,
  findDailyMonth,
} from './helpers';

const PHONE = {
  viewport: { width: 375, height: 667 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
  userAgent: devices['iPhone SE'].userAgent,
};

/** A touch swipe from (x, y) by (dx, dy): touch start, 12 moves, a short hold, touch end. */
async function swipe(page: Page, x: number, y: number, dx: number, dy: number): Promise<void> {
  test.skip(
    page.context().browser()?.browserType().name() !== 'chromium',
    'touch swipes use the Chrome DevTools Protocol',
  );
  const cdp = await page.context().newCDPSession(page);
  const point = (f: number) => [{ x: Math.round(x + dx * f), y: Math.round(y + dy * f), id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(0) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(i / 12) });
    await page.waitForTimeout(16);
  }
  // Hold still before lifting, so the swipe ends without a fling (a tap during a fling
  // only stops the scroll, as on a real phone).
  for (let i = 0; i < 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(1) });
    await page.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
}

const month = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __store: { getState(): { month: string } } }).__store.getState()
        .month,
  );
const place = (page: Page) =>
  page.evaluate(() =>
    JSON.stringify(
      (window as unknown as { __store: { getState(): { place: unknown } } }).__store.getState()
        .place,
    ),
  );

async function center(page: Page, selector: string) {
  const b = (await page.locator(selector).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
}

async function openSheetFull(page: Page) {
  const handle = page.getByRole('button', { name: /Panel is/ });
  for (let i = 0; i < 3 && !(await page.locator('.sheet-full').count()); i++) await handle.tap();
  await expect(page.locator('.sheet')).toHaveClass(/sheet-full/);
}

for (const [name, size] of [
  ['375 x 667', { width: 375, height: 667 }],
  ['320 x 568', { width: 320, height: 568 }],
  ['667 x 375 landscape', { width: 667, height: 375 }],
] as const) {
  test.describe(`phone ${name}`, () => {
    test.use({ ...PHONE, viewport: size });

    test('no sideways page scroll, top bar and strip controls on screen', async ({ page }) => {
      await openApp(page, '#month=2017-08&mode=sci');
      await choosePreset(page, 'Sicily', /Sicily, Italy/);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await openOptions(page);
      for (const label of ['More options', 'Simple', 'Scientific', 'Play months']) {
        const b = (await page.getByRole('button', { name: label, exact: true }).boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(size.width + 0.5);
      }
      await expect(page.getByRole('combobox', { name: /Search/ })).toBeInViewport();
    });
  });
}

test.describe('phone 375 x 667', () => {
  test.use(PHONE);

  test('swiping the strip scrolls it and does not change the month; a tap selects', async ({
    page,
  }) => {
    await openApp(page, '#month=2017-08');
    const before = await month(page);
    const scroller = page.locator('.strip-scroll');
    const start = await scroller.evaluate((el) => el.scrollLeft);
    const c = await center(page, '.strip-scroll');
    await swipe(page, c.x, c.y, 200, 0);
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).not.toBe(start);
    expect(await month(page)).toBe(before);
    // A tap on a bar selects its month.
    const bar = page.locator('.strip-svg g[data-month="2017-06"] rect.bar').first();
    await bar.scrollIntoViewIfNeeded();
    const svg = (await page.locator('.strip-svg').boundingBox())!;
    const x = Number(await bar.getAttribute('x'));
    await page.touchscreen.tap(svg.x + x + 1.5, svg.y + svg.height / 2);
    await expect.poll(() => month(page)).toBe('2017-06');
  });

  test('scrolling the panel over the calendar and lists never changes the month', async ({
    page,
  }) => {
    await openApp(page, '#month=2017-10');
    await choosePreset(page, 'Portugal', /Central Portugal/);
    await openSheetFull(page);
    const body = page.locator('.sheet .panel-body');
    const before = await month(page);
    await page.locator('.calendar').scrollIntoViewIfNeeded();
    // Start the swipe on a calendar row that is on screen.
    const bodyBox = (await body.boundingBox())!;
    const calBox = (await page.locator('.calendar tbody').boundingBox())!;
    const cal = {
      x: calBox.x + calBox.width / 2,
      y: Math.max(calBox.y, bodyBox.y) + Math.min(120, bodyBox.height / 3),
    };
    const top0 = await body.evaluate((el) => el.scrollTop);
    await swipe(page, cal.x, cal.y, 0, -250);
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(top0);
    await swipe(page, cal.x, cal.y, 0, 200);
    const list = await center(page, '.unusual-list, .contributions');
    await swipe(page, list.x, list.y, 0, -150);
    expect(await month(page)).toBe(before);
    // The page itself never scrolls; only the panel does.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('a tap on a calendar cell selects that month', async ({ page }) => {
    await openApp(page, '#month=2017-10');
    await choosePreset(page, 'Portugal', /Central Portugal/);
    await openSheetFull(page);
    const cell = page.getByRole('button', { name: /^August 2015:/ });
    await cell.scrollIntoViewIfNeeded();
    await cell.tap();
    await expect.poll(() => month(page)).toBe('2015-08');
  });

  test('forecast: a tap fills the strip with the forecast year and picks a month', async ({
    page,
  }) => {
    await openApp(page, '#month=2017-08');
    await choosePreset(page, 'Sicily', /Sicily, Italy/);
    const outlook = () =>
      page.evaluate(
        () =>
          (
            window as unknown as { __store: { getState(): { outlookMonth: string | null } } }
          ).__store.getState().outlookMonth,
      );
    const button = page.getByRole('button', { name: /forecast on the whole strip/ });
    const b = (await button.boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    await button.tap();
    const wide = page.locator('.strip-outlook');
    await expect(wide).toBeVisible();
    await expect(wide.locator('g[data-forecast-month]')).toHaveCount(12);
    expect(await outlook()).toBe('2027-01');
    // Twelve columns fit the phone without sideways scrolling.
    expect(await wide.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    const col = (await wide
      .locator('g[data-forecast-month="2027-08"] rect.outlook-hit')
      .boundingBox())!;
    expect(col.width).toBeGreaterThanOrEqual(20);
    await page.touchscreen.tap(col.x + col.width / 2, col.y + col.height / 2);
    await expect.poll(outlook).toBe('2027-08');
    await expect(page.locator('.summary.is-forecast')).toContainText('August 2027.');
    // The forecast row of the calendar acts on tap.
    await openSheetFull(page);
    const cell = page.locator('.cal-cell[data-forecast-month="2027-06"]');
    await cell.scrollIntoViewIfNeeded();
    await cell.tap();
    await expect.poll(outlook).toBe('2027-06');
  });

  test('forecast: a swipe across the forecast strip selects nothing', async ({ page }) => {
    await openApp(page, '#month=2017-08&outlook=2027-03');
    await page.getByRole('button', { name: /forecast on the whole strip/ }).tap();
    await expect(page.locator('.strip-outlook')).toBeVisible();
    const c = await center(page, '.strip-outlook');
    await swipe(page, c.x + 60, c.y, -120, 0);
    const now = await page.evaluate(
      () =>
        (
          window as unknown as { __store: { getState(): { outlookMonth: string | null } } }
        ).__store.getState().outlookMonth,
    );
    expect(now).toBe('2027-03');
  });

  test('scrolling the search list does not choose a place; a tap does', async ({ page }) => {
    await openApp(page);
    const input = page.getByRole('combobox', { name: /Search/ });
    await input.tap();
    await expect(page.getByRole('listbox')).toBeVisible();
    const list = await center(page, '.search-list');
    await swipe(page, list.x, list.y, 0, -120);
    expect(await place(page)).toBe('null');
    await page.getByRole('option', { name: /Evros, Greece/ }).tap();
    await expect(page.locator('#place-title')).toHaveText('Evros, Greece');
  });

  test('dragging the map pans it and does not select a place; a tap selects', async ({ page }) => {
    await openApp(page, '#map=8.20/37.6000/14.2000&month=2017-08');
    await mapReady(page);
    await expect.poll(async () => (await hook(page)).res).toBe(6);
    const m = await center(page, '.map-canvas canvas');
    const lon0 = await page.evaluate(
      () =>
        (window as unknown as { __map: { getCenter(): { lng: number } } }).__map.getCenter().lng,
    );
    await swipe(page, m.x, m.y, -120, 0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __map: { getCenter(): { lng: number } } }).__map.getCenter()
              .lng,
        ),
      )
      .not.toBeCloseTo(lon0, 3);
    expect(await place(page)).toBe('null');
    await page.touchscreen.tap(m.x, m.y - 60);
    await expect.poll(() => placeCellCount(page)).toBe(7);
  });

  test('a small place before 2012 reads as low confidence, after 2012 as high (D27)', async ({
    page,
  }) => {
    await openApp(page, '#month=2008-08');
    await choosePreset(page, 'Langhe', /Langhe, Italy/);
    await openSheetFull(page);
    const note = page.locator('.confidence-note');
    await expect(note).toHaveAttribute('data-confidence', 'low');
    await expect(note).toContainText('Before 2012 this area is too small for a reliable estimate');
    await expect(page.locator('.strip-svg g[data-month="2008-08"]')).toHaveAttribute(
      'data-confidence',
      'low',
    );
    await expect(page.locator('.strip-value')).toContainText('low confidence');
    // The guide opens by tap and lists the three levels.
    await note.getByRole('button', { name: 'How to read' }).tap();
    await expect(page.locator('.confidence-guide li')).toHaveCount(3);
    // An observed month of the same place: no warning.
    const cell = page.getByRole('button', { name: /^August 2016:/ });
    await cell.scrollIntoViewIfNeeded();
    await cell.tap();
    await expect.poll(() => month(page)).toBe('2016-08');
    await expect(page.locator('.summary')).toHaveAttribute('data-confidence', 'high');
    await expect(note).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^August 2008:.*low confidence$/ })).toHaveCount(
      1,
    );
  });

  test('peek shows the place name and the summary sentence', async ({ page }) => {
    await openApp(page, '#month=2017-08');
    await choosePreset(page, 'Sicily', /Sicily, Italy/);
    const handle = page.getByRole('button', { name: /Panel is/ });
    for (let i = 0; i < 3 && !(await page.locator('.sheet-peek').count()); i++) await handle.tap();
    await expect(page.locator('#place-title')).toBeInViewport();
    await expect(page.locator('.summary-sentence')).toBeInViewport({ ratio: 0.9 });
  });

  test('drawing a polygon and a rectangle with taps', async ({ page }) => {
    await openApp(page, '#map=9.00/37.6000/14.2000');
    await mapReady(page);
    const m = (await page.locator('.map-canvas canvas').boundingBox())!;
    await page.getByRole('button', { name: 'Draw area' }).tap();
    await page.getByRole('button', { name: 'Polygon' }).tap();
    for (const [dx, dy] of <[number, number][]>[
      [-60, -40],
      [60, -40],
      [40, 50],
      [-50, 40],
    ]) {
      await page.touchscreen.tap(m.x + m.width / 2 + dx, m.y + m.height / 2 + dy);
      await page.waitForTimeout(150);
    }
    await page.getByRole('button', { name: 'Finish' }).tap();
    await expect(page).toHaveURL(/place=s:/);
    expect(await placeCellCount(page)).toBeGreaterThanOrEqual(7);

    await page.getByRole('button', { name: 'Clear place' }).tap();
    await page.getByRole('button', { name: 'Draw area' }).tap();
    await page.getByRole('button', { name: 'Rectangle' }).tap();
    await page.touchscreen.tap(m.x + m.width / 2 - 40, m.y + m.height / 2 - 40);
    await page.waitForTimeout(150);
    await page.touchscreen.tap(m.x + m.width / 2 + 40, m.y + m.height / 2 + 40);
    await expect(page).toHaveURL(/place=s:/);
  });

  test('scientific features are all reachable: series view, Raw strip, seam check, CSV', async ({
    page,
  }) => {
    await openApp(page, '#month=2005-08&mode=sci');
    await choosePreset(page, 'Sicily', /Sicily, Italy/);
    await page
      .getByRole('group', { name: 'Values shown' })
      .getByRole('button', { name: 'Raw MODIS' })
      .tap();
    await expect(page).toHaveURL(/view=raw-modis/);
    await page.getByRole('button', { name: /Strip options/ }).tap();
    await page
      .getByRole('group', { name: 'Strip values' })
      .getByRole('button', { name: 'Raw' })
      .tap();
    await expect(page.locator('.strip-svg')).toHaveAttribute('data-which', 'raw');
    await expect(page.locator('#strip-seams li[data-seam="2012-02"]')).toBeVisible();
    await page.getByRole('button', { name: /Strip options/ }).tap();
    await openSheetFull(page);
    const csv = page.getByRole('button', { name: 'Download CSV' });
    await csv.scrollIntoViewIfNeeded();
    const [download] = await Promise.all([page.waitForEvent('download'), csv.tap()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('every control is at least 44 px high (calendar cells 24 px)', async ({ page }) => {
    await openApp(page, '#month=2017-10&mode=sci');
    await choosePreset(page, 'Portugal', /Central Portugal/);
    await openSheetFull(page);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>(
          '.sheet button, .sheet a, .topbar button, .strip button, .map-tools button, .series-switch button',
        ),
      )) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // Calendar cells: 12 columns cannot reach 24 px wide on a 320 px screen. The strip and the
        // unusual months list choose the same months with full-size targets (WCAG 2.5.8 exception).
        const inCalendar = el.classList.contains('cal-cell');
        const minH = inCalendar ? 24 : 44;
        const minW = inCalendar ? 20 : 24;
        if (r.height < minH - 0.5 || r.width < minW - 0.5) {
          out.push(
            `${el.className || el.tagName} "${el.textContent?.trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }
      return out;
    });
    expect(small).toEqual([]);
  });

  test('legend can be folded away so the map is usable', async ({ page }) => {
    await openApp(page, '#month=2017-08');
    const toggle = page.getByRole('button', { name: /legend/i });
    await toggle.tap();
    await expect(page.locator('.legend-ramp')).toBeHidden();
    await toggle.tap();
    await expect(page.locator('.legend-ramp')).toBeVisible();
  });

  test('axe at phone size, sheet open in scientific mode: no serious or critical issue', async ({
    page,
  }) => {
    await openApp(page, '#month=2017-10&mode=sci');
    await choosePreset(page, 'Portugal', /Central Portugal/);
    await openSheetFull(page);
    await page.getByRole('button', { name: /Strip options/ }).tap();
    const results = await new AxeBuilder({ page })
      .exclude('.maplibregl-canvas-container')
      .analyze();
    const bad = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(bad).toEqual([]);
  });

  test('daily curve: the view switch and a day act on tap; a swipe over the chart only scrolls', async ({
    page,
  }) => {
    await openApp(page, '#month=2019-01&place=p:44.9000,7.6000&label=Piemonte');
    await openSheetFull(page);
    const daily = page.locator('.daily');
    await expect(daily).toBeVisible();
    await expect(daily).toContainText('UTC days');
    await page
      .getByRole('group', { name: 'Daily view' })
      .getByRole('button', { name: '5-day sum' })
      .tap();
    await expect(daily.locator('svg')).toHaveAttribute('data-view', 'rolling');
    await page.locator('.daily svg').scrollIntoViewIfNeeded();
    const chart = await center(page, '.daily svg');
    const readout = daily.locator('.daily-readout');
    await page.touchscreen.tap(chart.b.x + chart.b.width * 0.3, chart.y);
    await expect(readout).toContainText('January:');
    const picked = await readout.textContent();
    // A vertical swipe that starts elsewhere on the chart scrolls the panel and picks nothing.
    await swipe(page, chart.b.x + chart.b.width * 0.8, chart.y, 0, -120);
    await expect(readout).toHaveText(picked!);
  });

  test('map day by day works by tap, with 44 px controls, and goes back to months', async ({
    page,
  }) => {
    await openApp(page, '#map=9.00/44.9000/6.9000&month=2024-03');
    await mapReady(page);
    await findDailyMonth(page);
    const toggle = page.getByRole('button', { name: 'Day by day' });
    await toggle.tap();
    const bar = page.getByRole('group', { name: /^Days of / });
    await expect(bar).toBeVisible();
    for (const name of ['Day by day', 'Play days', 'Back to the whole month']) {
      const b = (await page.getByRole('button', { name }).boundingBox())!;
      expect(b.height, name).toBeGreaterThanOrEqual(44);
      expect(b.width, name).toBeGreaterThanOrEqual(44);
    }
    const slider = (await bar.getByRole('slider').boundingBox())!;
    expect(slider.height).toBeGreaterThanOrEqual(44);
    expect(slider.x + slider.width).toBeLessThanOrEqual(375 + 0.5);
    await bar.getByRole('button', { name: 'Play days' }).tap();
    // Play starts again from day 1 and steps on.
    await expect
      .poll(
        async () => {
          const d = (await dailyHook(page)).day ?? 0;
          return d >= 2 && d < 31;
        },
        { timeout: 5000 },
      )
      .toBe(true);
    await bar.getByRole('button', { name: 'Pause days' }).tap();
    await bar.getByRole('button', { name: 'Back to the whole month' }).tap();
    await expect(bar).toHaveCount(0);
    expect((await dailyHook(page)).day).toBe(null);
  });

  test('axe with the day bar, then with the daily curve: no serious or critical issue', async ({
    page,
  }) => {
    const scan = async () => {
      const results = await new AxeBuilder({ page })
        .exclude('.maplibregl-canvas-container')
        .analyze();
      return results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    };
    await openApp(page, '#map=9.00/44.9000/6.9000&month=2024-03');
    await mapReady(page);
    await findDailyMonth(page);
    await page.getByRole('button', { name: 'Day by day' }).tap();
    await expect(page.getByRole('group', { name: /^Days of / })).toBeVisible();
    expect(await scan()).toEqual([]);
    await openApp(page, '#month=2019-01&place=p:44.9000,7.6000&label=Piemonte');
    await openSheetFull(page);
    await expect(page.locator('.daily')).toBeVisible();
    expect(await scan()).toEqual([]);
  });
});
