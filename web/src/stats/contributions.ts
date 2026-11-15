/** Per-cell contributions to a place's month (plan 6.6). */
import { cellToLatLng } from 'h3-js';
import { describeOffset, type LatLng } from '../grid/area';
import { statsConfig } from './config';

export interface Contribution {
  cell: string;
  value: number;
  share: number;
  where: string;
  partlyOutside: boolean;
}

export interface Contributions {
  total: number;
  /** All active cells, by share, largest first. Shares sum to 1. */
  rows: Contribution[];
  /** The first rows with a share of at least the floor, at most topContributors. */
  top: Contribution[];
  topShare: number;
}

export function contributions(
  cells: readonly string[],
  valueOf: (cell: string) => number,
  centre: LatLng,
  partlyOutside: ReadonlySet<string>,
): Contributions | null {
  if (cells.length < 2) return null;
  const values = cells.map((c) => ({ cell: c, value: Math.max(0, valueOf(c)) }));
  const total = values.reduce((a, v) => a + v.value, 0);
  if (!(total > 0)) return null;
  const rows = values
    .filter((v) => v.value > 0)
    .map((v) => ({
      cell: v.cell,
      value: v.value,
      share: v.value / total,
      where: describeOffset(centre, cellToLatLng(v.cell) as LatLng),
      partlyOutside: partlyOutside.has(v.cell),
    }))
    .sort((a, b) => b.share - a.share || a.cell.localeCompare(b.cell));
  const top = rows
    .filter((r) => r.share >= statsConfig.minContributorShare)
    .slice(0, statsConfig.topContributors);
  return { total, rows, top, topShare: top.reduce((a, r) => a + r.share, 0) };
}

/** "{j} cells make up {p}% of {Month} {year}." */
export function contributionSentence(c: Contributions, monthLabel: string): string {
  const j = c.top.length;
  const p = Math.round(c.topShare * 100);
  return `${j} ${j === 1 ? 'cell makes' : 'cells make'} up ${p}% of ${monthLabel}.`;
}
