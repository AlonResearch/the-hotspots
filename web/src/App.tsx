import { useCallback, useEffect, useMemo, useState } from 'react';
import { forecastLoader } from './data/forecast';
import { DataError, isAbort, loader } from './data/loader';
import { monthLabel } from './data/months';
import { initialRes } from './grid/ladder';
import type { Map as MapLibre } from 'maplibre-gl';
import { SeriesViewSwitch } from './map/SeriesViewSwitch';
import { MapStage } from './map/MapStage';
import { usePlaceOutline } from './map/PlaceOutline';
import { PlacePanel } from './panel/PlacePanel';
import { shareCells, useContributionsLayerOn, usePlaceContributions } from './state/contributions';
import { usePlaceDataLoader } from './state/placeData';
import { useApp, useData, type StaticData } from './state/store';
import { startUrlSync } from './state/urlSync';
import { seriesFromDense } from './stats/series';
import { TimeStrip } from './strip/TimeStrip';
import { formatDate } from './ui/format';
import { StatusMarker } from './ui/StatusMarker';
import { TopBar } from './ui/TopBar';
import { Notices } from './ui/Notices';

type Boot = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready' };

async function loadStatic(signal: AbortSignal): Promise<StaticData> {
  const manifest = await loader.manifest(signal);
  const [places, index, method, world, forecastFile] = await Promise.all([
    loader.places(signal).catch(() => []),
    loader.detailIndex(signal).catch((e: unknown) => {
      if (isAbort(e)) throw e;
      console.error(e);
      return null;
    }),
    loader.method(signal).catch(() => null),
    loader.summary(signal).then(
      (s) => ({ series: seriesFromDense(s), error: null }),
      (e: unknown) => {
        if (isAbort(e)) throw e;
        return {
          series: null,
          error: e instanceof Error ? e.message : 'Could not load the world series',
        };
      },
    ),
    forecastLoader.manifest(signal).catch((e: unknown) => {
      if (isAbort(e)) throw e;
      console.error(e);
      return null;
    }),
  ]);
  // A forecast must start after the record; anything else is ignored.
  const forecast = forecastFile && forecastFile.start > manifest.record.end ? forecastFile : null;
  return {
    manifest,
    places,
    index,
    method,
    world: world.series,
    worldError: world.error,
    forecast,
  };
}

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setBoot({ state: 'loading' });
    setAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let stopSync: (() => void) | null = null;
    loadStatic(controller.signal).then(
      (data) => {
        useApp.getState().setData(data);
        stopSync = startUrlSync(data.manifest, data.forecast);
        const { view } = useApp.getState();
        useApp.getState().setRes(initialRes(view.zoom, data.manifest.ladder));
        setBoot({ state: 'ready' });
      },
      (e: unknown) => {
        if (isAbort(e)) return;
        const message =
          e instanceof DataError
            ? e.message
            : 'The data could not be loaded. Check the connection.';
        setBoot({ state: 'error', message });
      },
    );
    return () => {
      controller.abort();
      stopSync?.();
    };
  }, [attempt]);

  if (boot.state === 'loading') {
    return (
      <div className="boot" role="status">
        <p>Loading The Hotspots...</p>
      </div>
    );
  }
  if (boot.state === 'error') {
    return (
      <div className="boot" role="alert">
        <h1>The data could not be loaded</h1>
        <p>{boot.message}</p>
        <button type="button" className="button" onClick={retry}>
          Retry
        </button>
      </div>
    );
  }
  return <Shell />;
}

function Shell() {
  usePlaceDataLoader();
  const [map, setMap] = useState<MapLibre | null>(null);
  usePlaceOutline(map);
  const contrib = usePlaceContributions();
  const layerOn = useContributionsLayerOn();
  const contribMonth = useApp((s) => s.month);
  const outlookMonth = useApp((s) => s.outlookMonth);
  const contributionView = useMemo(
    () =>
      layerOn && contrib && !outlookMonth
        ? { month: contribMonth, cells: shareCells(contrib) }
        : null,
    [layerOn, contrib, contribMonth, outlookMonth],
  );
  const place = useApp((s) => s.place);
  const month = useApp((s) => s.month);
  const announcement = useApp((s) => s.announcement);
  const data = useData();
  const setPlace = useApp((s) => s.setPlace);

  // Escape clears the place unless a control handles it first (drawing, search).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (useApp.getState().drawing !== 'off') return;
      if (useApp.getState().place) setPlace(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPlace]);

  return (
    <div className={`shell ${place ? 'has-place' : ''}`}>
      <a
        className="skip-link"
        href="#place-panel"
        onClick={(e) => {
          // The hash holds the app state, so move focus without changing it.
          e.preventDefault();
          const target =
            document.getElementById('place-panel') ??
            document.querySelector<HTMLElement>('.strip-scroll');
          target?.focus();
        }}
      >
        Skip to place details
      </a>
      <TopBar map={map} />
      <main
        className="map-region"
        aria-label={
          outlookMonth
            ? `Map of the fire activity forecast for ${monthLabel(outlookMonth)}`
            : `Map of fire activity for ${month ? monthLabel(month) : ''}`
        }
      >
        <MapStage onMap={setMap} contributions={contributionView} />
        <SeriesViewSwitch />
      </main>
      <PlacePanel />
      <section className="strip-region" aria-label="Time strip">
        <TimeStrip />
      </section>
      <footer className="footer caption">
        <span>
          <span className="data-through">
            Data through{' '}
            <time dateTime={data.manifest.data_through}>
              {formatDate(data.manifest.data_through)}
            </time>
          </span>
          .
        </span>
        {data.manifest.source === 'fixture' && (
          <>
            <StatusMarker kind="fixture" />
            <span className="footer-fixture">Fixture data.</span>
          </>
        )}
        <span className="footer-long">Historical satellite record of burning activity.</span>
        <span>Not for safety of life decisions.</span>
      </footer>
      <Notices />
      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
