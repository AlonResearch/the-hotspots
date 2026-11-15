import { describe, expect, it } from 'vitest';
import { layoutSeamLabels, shortSeamLabel } from '../../src/strip/seamLabels';

const SEAMS = [
  { month: '2002-07', label: 'Aqua starts' },
  { month: '2002-10', label: 'Terra-only ratio ends (Aqua nominal)' },
  { month: '2012-02', label: 'VIIRS starts (S-NPP)' },
  { month: '2018-04', label: 'NOAA-20 added' },
  { month: '2023-03', label: 'NOAA-21 in orbit (not in the VIIRS series)' },
  { month: '2026-11', label: 'S-NPP ends' },
];
const measure = (t: string) => t.length * 6;
/** Months from 2000-11, like the strip. */
const index = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return (y! - 2000) * 12 + mo! - 11;
};

function overlaps(widthPx: number, rows: number) {
  const n = index('2026-11') + 1;
  const barW = Math.max(3, (widthPx - 8) / (n + 14));
  const x = (i: number) => 4 + i * barW;
  const out = layoutSeamLabels(
    SEAMS.map((s) => ({ key: s.month, x: x(index(s.month)), label: s.label })),
    { rows, minX: 0, maxX: x(n), measure },
  );
  const boxes = out
    .filter((o) => o.text)
    .map((o) => {
      const w = measure(o.text!);
      const a = o.anchor === 'start' ? o.tx : o.tx - w;
      return { row: o.row, a, b: a + w };
    });
  let bad = 0;
  for (const p of boxes)
    for (const q of boxes) if (p !== q && p.row === q.row && p.a < q.b && q.a < p.b) bad++;
  return { out, bad, boxes, maxX: x(n) };
}

describe('seam labels', () => {
  it('shortens a trailing parenthesis only', () => {
    expect(shortSeamLabel('Terra-only ratio ends (Aqua nominal)')).toBe('Terra-only ratio ends');
    expect(shortSeamLabel('Aqua starts')).toBe('Aqua starts');
  });

  for (const w of [360, 600, 1000, 1400, 2400])
    for (const rows of [1, 2])
      it(`no two labels overlap at ${w} px, ${rows} row(s)`, () => {
        const { bad, boxes, maxX } = overlaps(w, rows);
        expect(bad).toBe(0);
        for (const b of boxes) {
          expect(b.a).toBeGreaterThanOrEqual(0);
          expect(b.b).toBeLessThanOrEqual(maxX);
        }
      });

  it('keeps both 2002 labels readable at 1400 px on two rows', () => {
    const { out } = overlaps(1400, 2);
    const aqua = out.find((o) => o.key === '2002-07')!;
    const terra = out.find((o) => o.key === '2002-10')!;
    expect(aqua.text).toBe('Aqua starts');
    expect(terra.text).not.toBeNull();
    expect(terra.row).not.toBe(aqua.row);
  });
});
