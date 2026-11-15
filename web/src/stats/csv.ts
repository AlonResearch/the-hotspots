/** Place series as CSV (plan 8.7.12): one row per month with a commented header. */
import type { MonthResult } from './history';
import type { Series } from './series';

export interface CsvMeta {
  place: string;
  definition: string;
  areaKm2: number;
  cells: number;
  methodVersion: string;
  dataThrough: string;
  source: string;
}

const r1 = (x: number) => String(Math.round(x * 10) / 10);

function quote(v: string): string {
  return /[",\n#]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function placeCsv(series: Series, results: MonthResult[], meta: CsvMeta): string {
  const lines = [
    `# The Hotspots, monthly active cell-days for ${meta.place}`,
    `# Place definition: ${meta.definition}`,
    `# Analysis area: ${meta.cells} res 6 cells, ${Math.round(meta.areaKm2)} km2`,
    `# Method version: ${meta.methodVersion}. Data source: ${meta.source}. Data through: ${meta.dataThrough}`,
    '# h, lo, hi: harmonized VIIRS-equivalent value and band. modis, viirs: raw group values.',
    'month,h,lo,hi,modis,viirs,status,class',
  ];
  for (let t = 0; t < series.n; t++) {
    const r = results[t]!;
    lines.push(
      [
        r.month,
        r1(series.h[t]!),
        r1(series.lo[t]!),
        r1(series.hi[t]!),
        r1(series.modis[t]!),
        r1(series.viirs[t]!),
        r.partial ? 'partial' : r.status,
        quote(r.classification.cls),
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Parses the CSV back (for tests and checks): header comments skipped. */
export function parsePlaceCsv(text: string): Record<string, string>[] {
  const rows = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const [head, ...body] = rows;
  const keys = head!.split(',');
  return body.map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i]!, v])));
}
