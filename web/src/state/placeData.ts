/** Resolves the selected place into cells, loads its detail tiles and sums its series. */
import { cellToParent } from 'h3-js';
import { useEffect } from 'react';
import { forecastLoader, type ForecastTile } from '../data/forecast';
import { DataError, isAbort, loader } from '../data/loader';
import { monthCount } from '../data/months';
import type { TileData } from '../data/tile';
import { areaKm2, centroid } from '../grid/area';
import { resolvePlace, type Place } from '../grid/place';
import { FORECAST_RES, placeForecast, tileRows, type PlaceForecast } from '../stats/forecast';
import { sumCells, type Series } from '../stats/series';
import { useApp, type PlaceData } from './store';

export const TOO_LARGE_MESSAGE =
  'This area is too large for a history (limit about 180,000 km²). Draw a smaller area or click a cell.';

export function usePlaceDataLoader(): void {
  const place = useApp((s) => s.place);
  const data = useApp((s) => s.data);
  const nonce = useApp((s) => s.placeNonce);

  useEffect(() => {
    if (!data || !place) return;
    const controller = new AbortController();
    void loadPlace(place, controller.signal);
    return () => controller.abort();
  }, [place, data, nonce]);
}

export async function loadPlace(place: Place, signal: AbortSignal): Promise<void> {
  const { data, setPlaceData, setPlace, notify } = useApp.getState();
  if (!data) return;
  const { manifest, index, forecast: fc } = data;
  const r = resolvePlace(place, manifest.detail.max_place_cells);
  if (!r.ok) {
    setPlace(null);
    notify(r.reason === 'too-large' ? TOO_LARGE_MESSAGE : 'That place could not be read.', 'error');
    return;
  }
  const tileRes = manifest.detail.tile_res;
  const tiles = [...new Set(r.cells.map((c) => cellToParent(c, tileRes)))].sort();
  const base: PlaceData = {
    status: 'loading',
    cells: r.cells,
    partlyOutside: r.partlyOutside,
    areaKm2: areaKm2(r.cells),
    shapeKm2: r.shapeKm2,
    expanded: r.expanded,
    centre: place.kind === 'point' ? [place.lat, place.lon] : centroid(r.cells),
    tiles,
    series: null,
  };
  const available = new Set(index?.tiles ?? []);
  if (!index || !tiles.every((t) => available.has(t))) {
    setPlaceData({ ...base, status: 'unavailable' });
    return;
  }
  setPlaceData(base);
  try {
    const loaded = await Promise.all(tiles.map((t) => loader.tile(t, signal)));
    if (signal.aborted) return;
    const byParent = new Map<string, TileData>(loaded.map((t) => [t.parent, t]));
    const n = monthCount(manifest.record.start, manifest.record.end);
    const series = sumCells(
      r.cells,
      (c) => byParent.get(cellToParent(c, tileRes)),
      manifest.record.start,
      n,
    );
    const tileOf = (c: string) => byParent.get(cellToParent(c, tileRes));
    const forecast = fc ? await outlookFor(r.cells, series, tileOf, fc, manifest) : null;
    if (signal.aborted) return;
    setPlaceData({ ...base, status: 'ready', series, forecast });
  } catch (e) {
    if (isAbort(e) || signal.aborted) return;
    const msg = e instanceof DataError ? e.message : 'Could not load the history for this place.';
    setPlaceData({ ...base, status: 'error', error: msg });
  }
}

/** The place's outlook from the res 4 forecast tiles. A failed load leaves the place without one. */
async function outlookFor(
  cells: readonly string[],
  series: Series,
  tileOf: (cell: string) => TileData | null | undefined,
  fc: NonNullable<ReturnType<typeof useApp.getState>['data']>['forecast'] & object,
  manifest: Parameters<typeof placeForecast>[5],
): Promise<PlaceForecast | null> {
  try {
    const listed = new Set(fc.tiles);
    const parents = [
      ...new Set(cells.map((c) => cellToParent(cellToParent(c, FORECAST_RES), fc.tile_res))),
    ].filter((p) => listed.has(p));
    const loaded = await Promise.all(parents.map((p) => forecastLoader.tile(p)));
    const byParent = new Map<string, ForecastTile>();
    for (const t of loaded) if (t) byParent.set(t.parent, t);
    return placeForecast(
      cells,
      series,
      tileOf,
      (area) => tileRows(byParent.get(cellToParent(area, fc.tile_res)), area),
      fc,
      manifest,
    );
  } catch (e) {
    console.error(e);
    return null;
  }
}
