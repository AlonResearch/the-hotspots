/** MapLibre map with the deck.gl cell overlay, controls, legend and tooltip (plan 7.3, 8.1 to 8.3). */
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Layer, PickingInfo } from '@deck.gl/core';
import {
  cellToLatLng,
  getHexagonAreaAvg,
  getHexagonEdgeLengthAvg,
  latLngToCell,
  UNITS,
} from 'h3-js';
import { AttributionControl, Map as MapLibre, NavigationControl, ScaleControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { forecastIndex, forecastLoader } from '../data/forecast';
import { monthLabel, monthStatus } from '../data/months';
import { nextRes } from '../grid/ladder';
import { bboxCells, type BBox } from '../grid/viewport';
import { useApp, useData } from '../state/store';
import { formatKm2, formatValue } from '../stats/wording';
import { motion } from '../styles/tokens';
import {
  applyMapStyle,
  CELLS_BEFORE_ID,
  CELLS_BEFORE_ID_LOCAL,
  chooseBasemap,
  localStyle,
  onlineStyle,
  type BasemapKind,
} from './basemap';
import { roundBBox, throughDay, useCellFrame, viewHasDaily, type CellFrame } from './cellData';
import {
  cellLayer,
  FORECAST_OUTLINE,
  GRID_MAX_CELLS,
  GRID_MIN_PIXELS,
  gridLayer,
  toDrawCells,
  toForecastCells,
  type DrawCell,
} from './CellLayer';
import { cellAreaKm2, hexagonPixels, LEGEND_WORDS, mapConfidence } from './density';
import { Legend } from './Legend';
import { prefersReducedMotion } from '../ui/motion';

interface Hover {
  x: number;
  y: number;
  cell: DrawCell;
}

/** The contributions recolour (plan 8.7.6): the place's cells by share, everything else dimmed. */
export interface ContributionView {
  month: string;
  cells: DrawCell[];
}

interface Props {
  contributions?: ContributionView | null;
  /** Called with the map once it exists (for drawing and outlines). */
  onMap?: (map: MapLibre | null) => void;
}

export function MapStage({ contributions, onMap }: Props) {
  const { manifest, forecast: fcManifest } = useData();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [basemap, setBasemap] = useState<BasemapKind | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [camera, setCamera] = useState(() => useApp.getState().view);
  const [hover, setHover] = useState<Hover | null>(null);
  const month = useApp((s) => s.month);
  const outlookMonth = useApp((s) => s.outlookMonth);
  const mode = useApp((s) => s.mode);
  const seriesView = useApp((s) => s.seriesView);
  const fly = useApp((s) => s.fly);
  const mapStyle = useApp((s) => s.mapStyle);
  const day = useApp((s) => s.day);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibre | null = null;
    void chooseBasemap().then((kind) => {
      if (cancelled || !container.current) return;
      const { view } = useApp.getState();
      map = new MapLibre({
        container: container.current,
        style: kind === 'online' ? onlineStyle(useApp.getState().mapStyle) : localStyle(),
        center: [view.lon, view.lat],
        zoom: view.zoom,
        minZoom: 1,
        // Street level, so people can find their own road and village (D25).
        maxZoom: 15,
        renderWorldCopies: true,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      // Credits (basemap sources add their own: OpenFreeMap and OpenStreetMap, or Natural Earth).
      // Compact: an (i) button under the More menu that opens the text by tap, closed at start.
      map.addControl(
        new AttributionControl({
          compact: true,
          customAttribution:
            'Fire data: <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener">NASA FIRMS</a> (MODIS, VIIRS)',
        }),
        'top-right',
      );
      map.once('load', () =>
        map!
          .getContainer()
          .querySelector('.maplibregl-ctrl-attrib')
          ?.classList.remove('maplibregl-compact-show'),
      );
      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
      // Scale bar like any digital map, updated as you zoom (D25).
      map.addControl(new ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-right');
      const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(overlay);
      overlayRef.current = overlay;
      mapRef.current = map;
      setBasemap(kind);
      useApp.getState().setBasemap(kind);

      const readBounds = () => {
        const b = map!.getBounds();
        setBbox((prev) =>
          roundBBox(
            { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
            prev,
          ),
        );
      };
      const onMove = () => {
        const z = map!.getZoom();
        const c = map!.getCenter();
        setCamera({ zoom: z, lat: c.lat, lon: c.lng });
        const s = useApp.getState();
        const r = nextRes(s.res, z, manifest.ladder, manifest.ladder_hysteresis);
        if (r !== s.res) s.setRes(r);
      };
      map.on('move', onMove);
      map.on('moveend', () => {
        const c = map!.getCenter();
        const v = {
          zoom: round(map!.getZoom(), 2),
          lat: round(c.lat, 4),
          lon: round(wrap(c.lng), 4),
        };
        const cur = useApp.getState().view;
        if (cur.zoom !== v.zoom || cur.lat !== v.lat || cur.lon !== v.lon)
          useApp.getState().setView(v);
        readBounds();
      });
      map.on('load', readBounds);
      map.on('resize', readBounds);
      readBounds();
      map.on('click', (e) => selectAt(e.lngLat.lat, e.lngLat.lng));
      map.getCanvas().setAttribute('role', 'application');
      if (import.meta.env.DEV) (window as unknown as { __map: MapLibre }).__map = map;
      // Consumers (drawing, outlines) get the map once its style has loaded.
      map.once('load', () => onMap?.(map));
    });
    return () => {
      cancelled = true;
      onMap?.(null);
      overlayRef.current = null;
      mapRef.current = null;
      map?.remove();
    };
    // The map is created once; later state is read from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas label (plan 8.11).
  useEffect(() => {
    mapRef.current
      ?.getCanvas()
      .setAttribute(
        'aria-label',
        `Map of ${outlookMonth ? 'the fire activity forecast' : 'fire activity'} for ${monthLabel(outlookMonth ?? month)}. Use search or the place list to choose a place.`,
      );
  }, [month, outlookMonth, basemap]);

  // Fly and fit requests.
  useEffect(() => {
    const map = mapRef.current;
    if (!fly || !map) return;
    const duration = prefersReducedMotion() ? 0 : 800;
    if (fly.bounds) {
      const [w, s, e, n] = fly.bounds;
      map.fitBounds([w, s, e, n], { padding: 48, duration, maxZoom: 11 });
    } else if (fly.center) {
      map.flyTo({ center: fly.center, zoom: fly.zoom ?? map.getZoom(), duration });
    }
  }, [fly, basemap]);

  const frame = useCellFrame(bbox);
  // Day mode (plan 4.6): offered only when every active cell in view has daily values.
  const dailyAvailable = useMemo(
    () => Boolean(frame && bbox && seriesView === 'harmonized' && viewHasDaily(frame.rows, bbox)),
    [frame, bbox, seriesView],
  );
  useEffect(() => {
    useApp.getState().setDailyMapAvailable(dailyAvailable);
  }, [dailyAvailable]);
  const dayOn = day !== null && dailyAvailable;
  const drawCells = useMemo(() => {
    if (!frame) return [];
    const rows = dayOn ? throughDay(frame.rows, day!) : frame.rows;
    const view = dayOn ? 'harmonized' : seriesView;
    const level = mapConfidence(
      monthStatus(manifest, frame.month),
      frame.month,
      frame.plan.res,
      view,
    );
    return toDrawCells(rows, view, manifest.color.density_breaks, frame.plan.res, level === 'low');
  }, [frame, seriesView, manifest, dayOn, day]);

  // The forecast replaces the activity cells while a forecast month is shown. The model works on
  // res 4 areas, so the map stays at res 4 however far it is zoomed in (res 3 when zoomed out).
  const outlookOn = forecastIndex(fcManifest, outlookMonth) >= 0;
  const fcRes: 3 | 4 = (frame?.plan.res ?? 4) <= 3 ? 3 : 4;
  const fcAll = useForecastFrame(
    outlookOn ? outlookMonth : null,
    fcRes,
    manifest.color.density_breaks,
  );
  // Zoomed in, only the areas near the view are drawn (the file holds the whole world).
  const zoomedIn = (frame?.plan.res ?? 3) >= 5;
  const fcFrame = useMemo(() => {
    if (!fcAll || !zoomedIn || !bbox) return fcAll;
    return { ...fcAll, cells: fcAll.cells.filter((c) => nearView(c.cell, bbox)) };
  }, [fcAll, zoomedIn, bbox]);

  // Crossfade between resolutions (200 ms, none with reduced motion).
  const fade = useCrossfade(frame, drawCells);

  // Map style preset (D23): switch layer visibility, the cell overlay stays as it is.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemap !== 'online') return;
    if (map.isStyleLoaded()) applyMapStyle(map, mapStyle);
    else map.once('load', () => applyMapStyle(map, mapStyle));
  }, [mapStyle, basemap]);

  // The cell grid of the view (D22), only where hexagons are wide enough to read as a grid.
  const gridRes = frame?.plan.res ?? null;
  // Quarter-zoom steps: enough to cross the pixel threshold, without recomputing on every frame.
  const zoomStep = Math.round(camera.zoom * 4);
  const gridCells = useMemo(() => {
    if (gridRes === null || !bbox) return [];
    const lat = (bbox.north + bbox.south) / 2;
    const px = hexagonPixels(getHexagonEdgeLengthAvg(gridRes, UNITS.m), zoomStep / 4, lat);
    if (px < GRID_MIN_PIXELS) return [];
    if (areaKm2(bbox) / getHexagonAreaAvg(gridRes, UNITS.km2) > GRID_MAX_CELLS) return [];
    return bboxCells(bbox, gridRes);
  }, [gridRes, bbox, zoomStep]);

  // Push layers to deck.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !frame) return;
    const beforeId = basemap === 'online' ? CELLS_BEFORE_ID : CELLS_BEFORE_ID_LOCAL;
    const onHover = (info: PickingInfo<DrawCell>) =>
      setHover(info.object ? { x: info.x, y: info.y, cell: info.object } : null);
    const layers: Layer[] = [];
    if (outlookOn) {
      if (fcFrame) {
        layers.push(
          cellLayer({
            id: `forecast-r${fcFrame.res}`,
            cells: fcFrame.cells,
            res: fcFrame.res,
            zoom: camera.zoom,
            lat: camera.lat,
            layerOpacity: 1,
            beforeId,
            onHover,
            outline: FORECAST_OUTLINE,
          }),
        );
      }
      overlay.setProps({ layers });
      exposeTestHook(frame, drawCells, null, false, bbox, fcFrame);
      return;
    }
    if (gridCells.length) layers.push(gridLayer({ cells: gridCells, beforeId }));
    if (fade.previous) {
      layers.push(
        cellLayer({
          id: `cells-r${fade.previous.res}`,
          cells: fade.previous.cells,
          res: fade.previous.res,
          zoom: camera.zoom,
          lat: camera.lat,
          layerOpacity: 1 - fade.t,
          beforeId,
          dimmed: Boolean(contributions),
        }),
      );
    }
    layers.push(
      cellLayer({
        id: `cells-r${frame.plan.res}`,
        cells: drawCells,
        res: frame.plan.res,
        zoom: camera.zoom,
        lat: camera.lat,
        layerOpacity: fade.previous ? fade.t : 1,
        beforeId,
        onHover: contributions ? undefined : onHover,
        dimmed: Boolean(contributions),
      }),
    );
    if (contributions) {
      layers.push(
        cellLayer({
          id: 'contributions',
          cells: contributions.cells,
          res: 6,
          zoom: camera.zoom,
          lat: camera.lat,
          layerOpacity: 1,
          beforeId,
        }),
      );
    }
    overlay.setProps({ layers });
    exposeTestHook(
      frame,
      drawCells,
      contributions?.cells.length ?? null,
      dailyAvailable,
      bbox,
      null,
    );
  }, [
    outlookOn,
    fcFrame,
    frame,
    drawCells,
    camera.zoom,
    camera.lat,
    basemap,
    fade,
    contributions,
    gridCells,
    dailyAvailable,
    bbox,
  ]);

  useEffect(() => {
    if (!frame) return;
    const s = useApp.getState();
    s.setDetailNotice(frame.plan.detailMissing ? 'missing' : null);
    if (s.displayRes !== frame.plan.res) s.setDisplayRes(frame.plan.res);
    if (s.filePlan?.key !== frame.plan.key) s.setFilePlan(frame.plan);
  }, [frame]);

  const status = monthStatus(manifest, month);
  const res = frame?.plan.res ?? useApp.getState().res;
  const showForecast = outlookOn && fcFrame !== null;
  const level = mapConfidence(status, month, res, seriesView);

  return (
    <>
      <div ref={container} className="map-canvas" />
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }} role="tooltip">
          {showForecast
            ? forecastTooltip(hover.cell, mode, fcFrame.month, fcFrame.res)
            : tooltipText(hover.cell, mode, month, res, status === 'estimated')}
          {!showForecast &&
            status !== 'observed' &&
            ` · ${status === 'estimated' ? 'Estimated' : 'Provisional'}`}
          {!showForecast && level === 'low' && ' · Low confidence'}
        </div>
      )}
      <Legend
        res={res}
        detailMissing={Boolean(frame?.plan.detailMissing)}
        contributions={contributions ? { month: contributions.month } : null}
        grid={gridCells.length > 0 && !showForecast}
        forecast={showForecast ? { month: fcFrame.month, res: fcFrame.res } : null}
      />
    </>
  );
}

function tooltipText(
  c: DrawCell,
  mode: 'simple' | 'sci',
  month: string,
  res: number,
  estimated: boolean,
): string {
  if (mode === 'sci') {
    return `${monthLabel(month)}: ${formatValue(c.value, estimated)} active cell-days in ${formatKm2(cellAreaKm2(c.cell))} (res ${res})`;
  }
  return `${monthLabel(month)}: ${LEGEND_WORDS[c.k]}`;
}

function forecastTooltip(c: DrawCell, mode: 'simple' | 'sci', month: string, res: number): string {
  if (mode === 'sci') {
    return `Forecast for ${monthLabel(month)}: about ${formatValue(c.value)} active cell-days in ${formatKm2(cellAreaKm2(c.cell))} (res ${res}, median)`;
  }
  return `Forecast for ${monthLabel(month)}: ${LEGEND_WORDS[c.k]}`;
}

interface ForecastFrame {
  month: string;
  res: 3 | 4;
  cells: DrawCell[];
}

/** True when a res 4 cell is inside the view or within about one cell of it. */
function nearView(cell: string, b: BBox): boolean {
  const pad = 0.6;
  const [lat, lon] = cellToLatLng(cell);
  if (lat < b.south - pad || lat > b.north + pad) return false;
  let x = lon;
  while (x < b.west - pad) x += 360;
  return x <= b.east + pad;
}

/** Forecast cells for a month. The previous frame stays until the next is ready. */
function useForecastFrame(
  month: string | null,
  res: 3 | 4,
  breaks: readonly number[],
): ForecastFrame | null {
  const [frame, setFrame] = useState<ForecastFrame | null>(null);
  useEffect(() => {
    if (!month) return;
    let cancelled = false;
    forecastLoader.map(res, month).then(
      (file) => {
        if (cancelled) return;
        setFrame({ month, res, cells: file ? toForecastCells(file.cell, file.v, breaks) : [] });
      },
      () => {
        if (!cancelled)
          useApp.getState().notify(`Could not load the forecast for ${monthLabel(month)}`, 'error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [month, res, breaks]);
  return month ? frame : null;
}

/** Click rules (plan 8.3): res 6 selects the 7-cell neighbourhood, res 3 to 5 the cell under the pointer. */
function selectAt(lat: number, lon: number): void {
  const s = useApp.getState();
  if (s.drawing !== 'off' || Date.now() - s.drawEndedAt < 400) return;
  const res = s.displayRes;
  if (res === 6) {
    const [clat, clon] = cellToLatLng(latLngToCell(lat, lon, 6));
    s.setPlace({ kind: 'point', lat: round(clat, 4), lon: round(clon, 4) });
  } else {
    s.setPlace({ kind: 'cell', cell: latLngToCell(lat, wrap(lon), res) });
  }
}

function useCrossfade(frame: CellFrame | null, cells: DrawCell[]) {
  const [state, setState] = useState<{
    previous: { res: number; cells: DrawCell[] } | null;
    t: number;
  }>({ previous: null, t: 1 });
  const last = useRef<{ res: number; cells: DrawCell[] } | null>(null);
  useEffect(() => {
    if (!frame) return;
    const prev = last.current;
    last.current = { res: frame.plan.res, cells };
    if (!prev || prev.res === frame.plan.res || prefersReducedMotion()) {
      setState({ previous: null, t: 1 });
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / motion.fast);
      setState({ previous: t < 1 ? prev : null, t });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frame, cells]);
  return state;
}

function exposeTestHook(
  frame: CellFrame,
  drawn: DrawCell[],
  contributionCells: number | null,
  dailyAvailable: boolean,
  bbox: BBox | null,
  forecast: ForecastFrame | null,
): void {
  if (!import.meta.env.DEV && import.meta.env.VITE_TEST_HOOK !== '1') return;
  const inView = (cell: string) => {
    if (!bbox) return true;
    const [lat, lon] = cellToLatLng(cell);
    let x = lon;
    while (x < bbox.west) x += 360;
    return lat >= bbox.south && lat <= bbox.north && x <= bbox.east;
  };
  (window as unknown as { __hotspots: unknown }).__hotspots = {
    res: frame.plan.res,
    renderedCells: drawn.length,
    /** Sum of the values drawn in view: the running total in day mode. */
    drawnTotal: drawn.reduce((a, c) => a + (inView(c.cell) ? c.value : 0), 0),
    dailyAvailable,
    day: useApp.getState().day,
    month: frame.month,
    /** Cells drawn by share, or null when the activity layer is shown undimmed. */
    contributionCells,
    dimmed: contributionCells !== null,
    /** The forecast layer, when it replaces the activity cells. */
    forecast: forecast
      ? { month: forecast.month, res: forecast.res, cells: forecast.cells.length }
      : null,
    get placeCells() {
      return useApp.getState().placeData?.cells ?? [];
    },
  };
}

function round(x: number, d: number): number {
  const p = 10 ** d;
  return Math.round(x * p) / p;
}

function wrap(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Rough area of a lon/lat box in km², enough to cap the grid. */
function areaKm2(b: BBox): number {
  const lat = ((b.north + b.south) / 2) * (Math.PI / 180);
  const w = Math.min(360, b.east - b.west) * 111.32 * Math.cos(lat);
  const h = (Math.min(85, b.north) - Math.max(-85, b.south)) * 110.57;
  return Math.max(0, w) * Math.max(0, h);
}
