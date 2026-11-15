/** Month results per series, computed once per series object and shared by the strip and History. */
import type { Manifest } from '../data/contract';
import { allMonthResults, type MonthResult } from './history';
import type { Series } from './series';

const cache = new WeakMap<Series, { manifest: Manifest; results: MonthResult[] }>();

export function monthResults(series: Series, manifest: Manifest): MonthResult[] {
  const hit = cache.get(series);
  if (hit && hit.manifest === manifest) return hit.results;
  const results = allMonthResults(series, manifest);
  cache.set(series, { manifest, results });
  return results;
}
