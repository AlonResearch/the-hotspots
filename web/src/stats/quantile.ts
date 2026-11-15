/**
 * Percentile with linear interpolation between order statistics ("type 7",
 * the default of R and NumPy). p is in percent, 0 to 100. Returns NaN for an empty input.
 */
export function quantile(values: readonly number[], p: number): number {
  const n = values.length;
  if (n === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return quantileSorted(sorted, p);
}

/** Same as quantile, for an input that is already sorted ascending. */
export function quantileSorted(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const h = (n - 1) * (Math.min(100, Math.max(0, p)) / 100);
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (h - lo) * (b - a);
}

export function median(values: readonly number[]): number {
  return quantile(values, 50);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}
