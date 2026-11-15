/**
 * Seam check (plan 6.7): mean of the window after a seam over the mean of the
 * window before. A description, not a test. Returns null when either window
 * does not fit in the series or the mean before is zero.
 */
export function seamStep(series: ArrayLike<number>, seamIndex: number, window = 36): number | null {
  if (seamIndex - window < 0 || seamIndex + window > series.length) return null;
  let before = 0;
  let after = 0;
  for (let i = 0; i < window; i++) {
    before += series[seamIndex - window + i]!;
    after += series[seamIndex + i]!;
  }
  if (before <= 0) return null;
  return after / before;
}

export interface SeamCheck {
  month: string;
  label: string;
  raw: number | null;
  harmonized: number | null;
}

/** Seam check for every seam inside the record, on the raw and the harmonized series. */
export function seamChecks(
  seams: readonly { month: string; label: string }[],
  monthIndex: (m: string) => number,
  raw: ArrayLike<number>,
  harmonized: ArrayLike<number>,
  window = 36,
): SeamCheck[] {
  return seams
    .map((s) => ({ s, i: monthIndex(s.month) }))
    .filter(({ i }) => i > 0 && i < harmonized.length)
    .map(({ s, i }) => ({
      month: s.month,
      label: s.label,
      raw: seamStep(raw, i, window),
      harmonized: seamStep(harmonized, i, window),
    }));
}
