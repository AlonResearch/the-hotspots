/** The demo insight for the selected place: the selected forecast month, or the region's peak. */
import { parseMonth } from '../data/months';
import { useApp, type PlaceData } from '../state/store';
import { demoRegionAt, insightFor, peakMonth, type Insight } from './demo';

export function useInsight(data: PlaceData): Insight | null {
  const outlookMonth = useApp((s) => s.outlookMonth);
  const region = demoRegionAt(data.centre[0], data.centre[1]);
  if (!region) return null;
  const month = outlookMonth ? parseMonth(outlookMonth).month : peakMonth(region);
  return insightFor(region, month);
}
