/** App-side defaults for the history math. Not team decisions (plan section 13). */
export const statsConfig = {
  /** A calendar month is typical when fire is seen in at least this share of baseline years (6.5). */
  typicalMinYearsShare: 0.5,
  /** ...and its mean is at least this share of the largest monthly mean (6.5). */
  typicalMinMeanShare: 0.5,
  /** Unusual months listed at most (6.5). */
  maxUnusualShown: 12,
  /** Contributions: rows shown and the share floor (6.6). */
  topContributors: 5,
  minContributorShare: 0.05,
  /** Calendar colour scale: percentile of the place's non-zero months (decision D17). */
  calendarScalePercentile: 98,
  /** Seam check window in months (6.7). */
  seamWindow: 36,
  /**
   * Areas with fewer res 6 cells than this have low confidence in estimated months (D27) and get
   * no class there, only the value and the "Estimated" marker (plan S1). 49 cells is one res 4
   * cell (about 1,800 km²). Leave-one-year-out against S-NPP (Whitepaper Table 2): MODIS missed
   * activity in 53% of active res 6 cell-months, 47% at res 5 (7 cells), 41% at res 4 (49 cells)
   * and 15% for res 1 regions; where MODIS saw fire, the 75th percentile of the estimate is about
   * twice the observed one up to res 4 (6.3 / 3.0, 13.6 / 7.0, 27.3 / 14.0) and 1.24 times for
   * regions (927 / 749). At 49 cells the error is still large, so this is the smallest size that
   * gets medium, not a size where the estimate is good.
   */
  estimatedCompareMinCells: 49,
  /**
   * Estimated months before this month come from Terra alone (D5, Whitepaper 3.4): one satellite,
   * ratios of 7.3 to 8.2, no out-of-sample check, outage months not corrected (2001-06 has 15 of
   * 30 days missing). They have low confidence at every size (D27).
   */
  terraOnlyBefore: '2002-10',
} as const;
