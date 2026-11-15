/** Series view (plan 8.8, scientific mode only): drives the map layer and the strip. */
import { useApp } from '../state/store';
import type { SeriesView } from '../state/url';

const OPTIONS: { id: SeriesView; label: string }[] = [
  { id: 'harmonized', label: 'Harmonized' },
  { id: 'raw-modis', label: 'Raw MODIS' },
  { id: 'raw-viirs', label: 'Raw VIIRS' },
];

export function SeriesViewSwitch() {
  const mode = useApp((s) => s.mode);
  const view = useApp((s) => s.seriesView);
  const setView = useApp((s) => s.setSeriesView);
  if (mode !== 'sci') return null;
  return (
    <div className="series-switch segmented" role="group" aria-label="Values shown">
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" aria-pressed={view === o.id} onClick={() => setView(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
