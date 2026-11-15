import { rawSeries, type Series } from '../stats/series';

export type StripValues = 'view' | 'raw';

/** Values drawn as bars: the series view (simple mode is always harmonized) or the raw seam series. */
export function stripValues(
  s: Series,
  mode: 'simple' | 'sci',
  seriesView: string,
  which: StripValues,
  firstRefIndex: number,
): Float64Array {
  if (mode === 'simple') return s.h;
  if (which === 'raw') return rawSeries(s, firstRefIndex);
  return seriesView === 'raw-modis' ? s.modis : seriesView === 'raw-viirs' ? s.viirs : s.h;
}
