/** Class of a month against its baseline (plan 6.3), with the zero-normal rule. */
import type { Manifest } from '../data/contract';
import type { Baseline } from './baseline';

export type ClassName =
  | 'insufficient'
  | 'none_usual_none'
  | 'active_usual_none'
  | 'below'
  | 'usual'
  | 'above'
  | 'much_above'
  | 'partial'
  | 'estimated_only';

export const CLASS_CODE: Record<ClassName, number> = {
  insufficient: 0,
  none_usual_none: 1,
  active_usual_none: 2,
  below: 3,
  usual: 4,
  above: 5,
  much_above: 6,
  partial: 7,
  estimated_only: 8,
};

export interface Target {
  h: number;
  lo: number;
  hi: number;
}

export interface Classification {
  cls: ClassName;
  code: number;
  unusual: boolean;
  /** h / normal, only when the zero-normal rule allows it. Never computed from a zero normal. */
  ratio: number | null;
}

export function classify(
  target: Target,
  b: Baseline,
  partial: boolean,
  classes: Manifest['classes'],
  minYears: number,
): Classification {
  let cls: ClassName;
  if (partial) cls = 'partial';
  else if (b.n < minYears) cls = 'insufficient';
  else if (b.normal === 0 && target.h === 0) cls = 'none_usual_none';
  else if (b.normal === 0) cls = 'active_usual_none';
  else if (target.lo > b.p_very_high) cls = 'much_above';
  else if (target.lo > b.p_high) cls = 'above';
  else if (target.hi < b.p_low) cls = 'below';
  else cls = 'usual';

  const unusual =
    cls !== 'partial' && cls !== 'insufficient' && target.lo > 0 && target.lo > b.p_very_high;

  let ratio: number | null = null;
  if (
    (cls === 'above' || cls === 'much_above') &&
    b.normal > 0 &&
    b.normal >= classes.min_normal_for_ratio
  ) {
    ratio = target.h / b.normal;
  }
  return { cls, code: CLASS_CODE[cls], unusual, ratio };
}

/**
 * A low-confidence month (D27: an estimated month of a small place, or a Terra-only month) is
 * not compared with normal: the class becomes
 * estimated_only, with no unusual flag and no ratio. Partial and insufficient stay as they are.
 */
export function suppressEstimated(c: Classification): Classification {
  if (c.cls === 'partial' || c.cls === 'insufficient') return c;
  return { cls: 'estimated_only', code: CLASS_CODE.estimated_only, unusual: false, ratio: null };
}

/** Short words for a class, used in labels and the strip value text. */
export const CLASS_WORDS: Record<ClassName, string> = {
  insufficient: 'not enough years to compare',
  none_usual_none: 'usually none',
  active_usual_none: 'usually none',
  below: 'quieter than usual',
  usual: 'usual',
  above: 'more than usual',
  much_above: 'much more than usual',
  partial: 'month not complete',
  estimated_only: 'estimated, not compared',
};
