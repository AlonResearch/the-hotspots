import { test } from '@playwright/test';
import { monthToIndex } from '../../src/data/months';
import { choosePreset, expect, expectedFor, manifest, openApp } from './helpers';

function monthOfLabel(label: string): string {
  const [name, year] = label.trim().split(' ');
  const m = new Date(`${name} 1, ${year} UTC`).getUTCMonth() + 1;
  return `${year}-${String(m).padStart(2, '0')}`;
}

test('Langhe: sentence, class and lists match the unit-tested functions, zero-normal wording', async ({
  page,
}) => {
  const e = expectedFor(44.64, 7.93);
  const quiet = e.results.find(
    (r) => r.year >= 2015 && r.classification.cls === 'none_usual_none',
  )!;
  await openApp(page, `#month=${quiet.month}`);
  await choosePreset(page, 'Langhe', /Langhe, Italy/);
  await expect(page.locator('.summary')).toHaveAttribute('data-class', 'none_usual_none');
  await expect(page.locator('.summary-sentence')).toContainText(quiet.sentence);
  await expect(page.locator('.summary-sentence')).toContainText('Usually no fire activity in');
  await expect(page.locator('.typical')).toHaveText(e.typical.sentence);
  const shown = (await page.locator('.unusual-list li .link-button').allTextContents()).map(
    monthOfLabel,
  );
  expect(shown).toEqual(e.unusual.slice(0, 12).map((r) => r.month));
});

test('Susa Valley: no activity in the record gives the empty-record sentence and zero-normal wording', async ({
  page,
}) => {
  const e = expectedFor(45.14, 7.05);
  test.skip(
    e.results.some((r) => r.h > 0),
    'this fixture place has activity',
  );
  await openApp(page, '#month=2024-02');
  await choosePreset(page, 'Susa', /Susa Valley, Italy/);
  await expect(page.locator('.summary-sentence')).toContainText(
    'Usually no fire activity in February. None in 2024.',
  );
  await expect(page.locator('.record')).toHaveText(
    'No fire activity was detected here in the record (2000 to 2026).',
  );
  await expect(page.locator('.typical')).toHaveText(
    'No regular fire season in this area in the record.',
  );
  // 27 years of record and the forecast year.
  await expect(page.locator('.calendar tbody tr')).toHaveCount(28);
  await expect(page.locator('.calendar .cal-cell.is-forecast')).toHaveCount(12);
});

test('Central Portugal: a month with activity and a zero normal uses the active wording', async ({
  page,
}) => {
  const e = expectedFor(39.9, -8.1);
  const active = e.results.find((r) => r.classification.cls === 'active_usual_none');
  test.skip(!active, 'no such month in this fixture');
  await openApp(page, `#month=${active!.month}`);
  await choosePreset(page, 'Portugal', /Central Portugal/);
  await expect(page.locator('.summary')).toHaveAttribute('data-class', 'active_usual_none');
  await expect(page.locator('.summary-sentence')).toContainText(active!.sentence);
  await expect(page.locator('.summary-sentence')).toContainText('Usually no fire activity in');
});

test('Central Portugal: 2017-10 is listed as unusual', async ({ page }) => {
  const e = expectedFor(39.9, -8.1);
  const oct = e.results[monthToIndex(manifest.record.start, '2017-10')]!;
  expect(oct.classification.unusual).toBe(true);
  await openApp(page, '#month=2017-10');
  await choosePreset(page, 'Portugal', /Central Portugal/);
  await expect(page.locator('.summary')).toHaveAttribute('data-unusual', 'true');
  await expect(page.locator('.unusual-list')).toContainText('October 2017');
  await expect(page.locator('.summary-sentence')).toContainText(oct.sentence);
});

test('calendar: arrow keys move the month and cells carry text labels', async ({ page }) => {
  await openApp(page, '#month=2017-08');
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  const selected = page.locator('.cal-cell[aria-pressed="true"]');
  await expect(selected).toHaveAttribute('aria-label', /^August 2017: .* active cell-/);
  await selected.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.cal-cell[aria-pressed="true"]')).toHaveAttribute(
    'aria-label',
    /^September 2017/,
  );
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.cal-cell[aria-pressed="true"]')).toHaveAttribute(
    'aria-label',
    /^September 2016/,
  );
  await expect(page).toHaveURL(/month=2016-09/);
});

test('the partial month shows the partial sentence and no class word', async ({ page }) => {
  await openApp(page, '#month=2026-11');
  await choosePreset(page, 'Sahel', /Sahel savanna/);
  await expect(page.locator('.summary')).toHaveAttribute('data-class', 'partial');
  await expect(page.locator('.summary-sentence')).toContainText('so far (14 of 30 days)');
  await expect(page.locator('.summary-sentence')).not.toContainText(/than usual|Usual for/);
  await expect(page.locator('.summary-sentence .status')).toHaveText('Partial');
});

test('an estimated month shows the marker in the panel and the legend', async ({ page }) => {
  await openApp(page, '#month=2005-08');
  await choosePreset(page, 'Sicily', /Sicily, Italy/);
  await expect(page.locator('.summary-sentence .status')).toHaveText('Estimated');
  await expect(page.locator('.legend .status')).toHaveText('Estimated');
});
