/**
 * Keeps the store and the URL hash in step (plan 7.2). Map moves and month changes
 * replace the history entry (debounced 300 ms). Place and mode changes push an entry,
 * so Back returns to the previous place. Invalid values fall back and are rewritten.
 */
import type { Manifest } from '../data/contract';
import { forecastEnd, type ForecastManifest } from '../data/forecast';
import { latestCompleteMonth } from '../data/months';
import { useApp, type AppState } from './store';
import {
  DEFAULT_VIEW,
  parseHash,
  samePlace,
  serializeHash,
  type UrlDefaults,
  type UrlState,
} from './url';

const REPLACE_DELAY = 300;

export function urlDefaults(manifest: Manifest, forecast?: ForecastManifest | null): UrlDefaults {
  return {
    view: DEFAULT_VIEW,
    month: latestCompleteMonth(manifest),
    record: manifest.record,
    forecast: forecast ? { start: forecast.start, end: forecastEnd(forecast) } : null,
  };
}

function pick(s: AppState): UrlState {
  const state: UrlState = {
    view: s.view,
    month: s.month,
    place: s.place,
    mode: s.mode,
    seriesView: s.seriesView,
  };
  if (s.outlookMonth) state.outlook = s.outlookMonth;
  return state;
}

/** Applies the URL to the store. Returns true when the URL had to be rewritten. */
export function applyUrl(manifest: Manifest, forecast?: ForecastManifest | null): boolean {
  const d = urlDefaults(manifest, forecast);
  const { state, hadInvalid } = parseHash(window.location.hash, d);
  const s = useApp.getState();
  const placeChanged = !samePlace(s.place, state.place);
  useApp.setState({
    view: state.view,
    month: state.month,
    outlookMonth: state.outlook ?? null,
    mode: state.mode,
    seriesView: state.seriesView,
    playing: false,
  });
  if (placeChanged) s.setPlace(state.place);
  else if (state.place) useApp.setState({ place: state.place }); // label may differ
  return hadInvalid;
}

/** Starts the sync. Returns a function that stops it. */
export function startUrlSync(manifest: Manifest, forecast?: ForecastManifest | null): () => void {
  const d = urlDefaults(manifest, forecast);
  let applying = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  applying = true;
  const hadInvalid = applyUrl(manifest, forecast);
  applying = false;
  const canonical = serializeHash(pick(useApp.getState()), d);
  if (hadInvalid || window.location.hash !== canonical) {
    history.replaceState(null, '', canonical);
  }

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const next = serializeHash(pick(useApp.getState()), d);
    if (window.location.hash !== next) history.replaceState(null, '', next);
  };

  const unsub = useApp.subscribe((s, prev) => {
    if (applying) return;
    const pushed =
      !samePlace(s.place, prev.place) ||
      (s.place && prev.place && s.place !== prev.place && labelOf(s) !== labelOf(prev)) ||
      s.mode !== prev.mode;
    const replaced =
      s.view !== prev.view ||
      s.month !== prev.month ||
      s.outlookMonth !== prev.outlookMonth ||
      s.seriesView !== prev.seriesView;
    if (pushed) {
      if (timer) clearTimeout(timer);
      timer = null;
      const next = serializeHash(pick(s), d);
      if (window.location.hash !== next) history.pushState(null, '', next);
    } else if (replaced) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, REPLACE_DELAY);
    }
  });

  const onPop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    applying = true;
    const invalid = applyUrl(manifest, forecast);
    applying = false;
    useApp.getState().flyTo({
      center: [useApp.getState().view.lon, useApp.getState().view.lat],
      zoom: useApp.getState().view.zoom,
    });
    if (invalid) history.replaceState(null, '', serializeHash(pick(useApp.getState()), d));
  };
  window.addEventListener('popstate', onPop);

  return () => {
    unsub();
    if (timer) clearTimeout(timer);
    window.removeEventListener('popstate', onPop);
  };
}

function labelOf(s: AppState): string | undefined {
  return s.place && 'label' in s.place ? s.place.label : undefined;
}
