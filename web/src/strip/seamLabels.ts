/**
 * Places the seam labels of the time strip so that no two overlap.
 *
 * Labels are tried left to right. Each one takes the first free spot in this order:
 * right of its line, then left of it; on each side the full text, then the text without
 * its trailing "(...)"; for each text, row 1 then row 2. A label with no free spot keeps its
 * dashed line and shows its text only in the tooltip (and in the seam check list).
 */

export interface SeamLabelIn {
  key: string;
  /** x of the seam line. */
  x: number;
  label: string;
}

export interface SeamLabelOut {
  key: string;
  /** Text drawn on the strip, or null when no spot is free. */
  text: string | null;
  row: number;
  /** x of the text and its anchor. */
  tx: number;
  anchor: 'start' | 'end';
}

export interface SeamLayoutOptions {
  rows: number;
  /** Labels stay inside [minX, maxX]. */
  minX: number;
  maxX: number;
  /** Text width in px. */
  measure: (text: string) => number;
  /** Space between the line and its text. */
  pad?: number;
  /** Least space between two labels on one row. */
  gap?: number;
}

/** The label without a trailing parenthesis: "Terra-only ratio ends (Aqua nominal)" -> "Terra-only ratio ends". */
export function shortSeamLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label;
}

export function layoutSeamLabels(
  seams: readonly SeamLabelIn[],
  { rows, minX, maxX, measure, pad = 3, gap = 6 }: SeamLayoutOptions,
): SeamLabelOut[] {
  const taken: [number, number][][] = Array.from({ length: Math.max(1, rows) }, () => []);
  const free = (row: number, a: number, b: number) =>
    a >= minX && b <= maxX && taken[row]!.every(([l, r]) => b + gap <= l || a >= r + gap);
  const sorted = [...seams].sort((p, q) => p.x - q.x);
  return sorted.map((s) => {
    const short = shortSeamLabel(s.label);
    const texts = short === s.label ? [s.label] : [s.label, short];
    // Right of the line reads as belonging to it, so every text tries that side first.
    for (const side of ['start', 'end'] as const) {
      for (const text of texts) {
        const w = measure(text);
        const [a, b] = side === 'start' ? [s.x + pad, s.x + pad + w] : [s.x - pad - w, s.x - pad];
        for (let row = 0; row < taken.length; row++) {
          if (free(row, a, b)) {
            taken[row]!.push([a, b]);
            return { key: s.key, text, row, tx: side === 'start' ? a : b, anchor: side };
          }
        }
      }
    }
    return { key: s.key, text: null, row: 0, tx: s.x + pad, anchor: 'start' };
  });
}
