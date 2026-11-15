/** The one app store (plan 7.1). URL sync lives in state/urlSync.ts. */
import { create } from 'zustand';
import type { DetailIndex, Manifest, MethodTables, PresetPlace } from '../data/contract';
import type { ForecastManifest } from '../data/forecast';
import type { Res } from '../grid/ladder';
import type { FilePlan } from '../map/cellData';
import type { Place } from '../grid/place';
import type { PlaceForecast } from '../stats/forecast';
import type { Series } from '../stats/series';
import type { Mode, SeriesView, View } from './url';

export type LoadStatus = 'loading' | 'ready' | 'unavailable' | 'error';

export interface PlaceData {
  status: LoadStatus;
  cells: string[];
  partlyOutside: ReadonlySet<string>;
  areaKm2: number;
  shapeKm2: number | null;
  expanded: boolean;
  centre: [number, number];
  /** Detail tile parents the place needs. */
  tiles: string[];
  series: Series | null;
  /** The outlook for the place, when the build has a forecast. */
  forecast?: PlaceForecast | null;
  error?: string;
}

export type SlotId = 'outlook' | 'why' | 'actions' | 'history';
export type DrawMode = 'off' | 'polygon' | 'rectangle';

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export interface FlyRequest {
  id: number;
  /** [west, south, east, north] to fit, or a centre and zoom. */
  bounds?: [number, number, number, number];
  center?: [number, number]; // lon, lat
  zoom?: number;
}

/** Static data loaded once after the manifest. */
export interface StaticData {
  manifest: Manifest;
  places: PresetPlace[];
  index: DetailIndex | null;
  method: MethodTables | null;
  world: Series | null;
  worldError: string | null;
  /** The outlook from the prediction model, or null when the build has none. */
  forecast: ForecastManifest | null;
}

export interface AppState {
  data: StaticData | null;
  view: View;
  res: Res;
  /** The resolution actually drawn (5 where res 6 has no detail). */
  displayRes: Res;
  month: string;
  /**
   * A forecast month shown instead of the record month (strip, calendar, summary and map), or
   * null. `month` keeps the record month, so everything about the record stays as it was.
   */
  outlookMonth: string | null;
  playing: boolean;
  mode: Mode;
  seriesView: SeriesView;
  place: Place | null;
  placeData: PlaceData | null;
  /** Bumped by reloadPlace() to retry a failed load. */
  placeNonce: number;
  drawing: DrawMode;
  /** When drawing last ended (ms). The click that finishes a shape must not also select a cell. */
  drawEndedAt: number;
  /** The open panel section. */
  openSection: SlotId | null;
  /** Contributions recolour on the map; "Show activity" turns it off. */
  showContributions: boolean;
  notice: Notice | null;
  fly: FlyRequest | null;
  /** Text for the polite live region. */
  announcement: string;
  /** Map loading line under the top bar. */
  mapBusy: boolean;
  /** Notice from the cell layer, e.g. "Detail is not available here in this build." */
  detailNotice: string | null;
  /** The files the map layer reads now (play prefetches with it). */
  filePlan: FilePlan | null;
  /** Bottom sheet stop on mobile. */
  sheet: 'peek' | 'half' | 'full';
  /** Basemap that loaded: online vector tiles or the bundled fallback (null while choosing). */
  basemap: 'online' | 'local' | null;
  /** Map style preset (D23): roads, towns and borders, or the quiet data-first style. */
  mapStyle: MapStyle;
  /**
   * Day mode of the map (plan 4.6): the month shown day by day as a running total through this
   * UTC day, or null for the whole month (the default). Only while the view has daily values.
   */
  day: number | null;
  dayPlaying: boolean;
  /** Every active cell in view carries daily values, so day mode can be offered. */
  dailyMapAvailable: boolean;

  setData(d: StaticData): void;
  setView(v: View): void;
  setRes(r: Res): void;
  setDisplayRes(r: Res): void;
  setMonth(m: string): void;
  setOutlookMonth(m: string | null): void;
  setPlaying(p: boolean): void;
  setMode(m: Mode): void;
  setSeriesView(v: SeriesView): void;
  setPlace(p: Place | null): void;
  setPlaceData(d: PlaceData | null): void;
  reloadPlace(): void;
  setDrawing(d: DrawMode): void;
  setOpenSection(s: SlotId | null): void;
  setShowContributions(v: boolean): void;
  notify(text: string, tone?: Notice['tone']): void;
  clearNotice(): void;
  flyTo(f: Omit<FlyRequest, 'id'>): void;
  announce(text: string): void;
  setMapBusy(b: boolean): void;
  setDetailNotice(t: string | null): void;
  setSheet(s: AppState['sheet']): void;
  setFilePlan(p: FilePlan | null): void;
  setBasemap(b: AppState['basemap']): void;
  setMapStyle(m: MapStyle): void;
  setDay(d: number | null): void;
  setDayPlaying(p: boolean): void;
  setDailyMapAvailable(v: boolean): void;
}

export type MapStyle = 'detailed' | 'quiet';

const MAP_STYLE_KEY = 'hotspots.mapStyle';

/** A per-viewer convenience, so it lives in the browser and not in the URL. */
function readMapStyle(): MapStyle {
  try {
    return localStorage.getItem(MAP_STYLE_KEY) === 'quiet' ? 'quiet' : 'detailed';
  } catch {
    return 'detailed';
  }
}

function saveMapStyle(m: MapStyle): void {
  try {
    localStorage.setItem(MAP_STYLE_KEY, m);
  } catch {
    // Storage can be blocked (private mode); the choice then lasts for the visit.
  }
}

let seq = 0;

export const useApp = create<AppState>()((set) => ({
  data: null,
  view: { zoom: 2, lat: 25, lon: 10 },
  res: 3,
  displayRes: 3,
  month: '',
  outlookMonth: null,
  playing: false,
  mode: 'simple',
  seriesView: 'harmonized',
  place: null,
  placeData: null,
  placeNonce: 0,
  drawing: 'off',
  drawEndedAt: 0,
  openSection: null,
  showContributions: true,
  notice: null,
  fly: null,
  announcement: '',
  mapBusy: false,
  detailNotice: null,
  sheet: 'half',
  filePlan: null,
  basemap: null,
  mapStyle: readMapStyle(),
  day: null,
  dayPlaying: false,
  dailyMapAvailable: false,

  setData: (data) => set({ data }),
  setView: (view) => set({ view }),
  setRes: (res) => set({ res }),
  setDisplayRes: (displayRes) => set({ displayRes }),
  setBasemap: (basemap) => set({ basemap }),
  setMapStyle: (mapStyle) => {
    saveMapStyle(mapStyle);
    set({ mapStyle });
  },
  // Another month leaves day mode: days belong to one month.
  // Choosing a record month also leaves the outlook.
  setMonth: (month) =>
    set((s) =>
      s.month === month
        ? s.outlookMonth === null
          ? {}
          : { outlookMonth: null }
        : { month, outlookMonth: null, day: null, dayPlaying: false },
    ),
  // A forecast month has no days and does not play.
  setOutlookMonth: (outlookMonth) =>
    set(
      outlookMonth === null
        ? { outlookMonth }
        : { outlookMonth, playing: false, day: null, dayPlaying: false },
    ),
  // Monthly playback and day mode do not run together.
  setPlaying: (playing) =>
    set(playing ? { playing, outlookMonth: null, day: null, dayPlaying: false } : { playing }),
  setDay: (day) =>
    set(day === null ? { day, dayPlaying: false } : { day, playing: false, outlookMonth: null }),
  setDayPlaying: (dayPlaying) => set({ dayPlaying }),
  setDailyMapAvailable: (dailyMapAvailable) =>
    set((s) =>
      s.dailyMapAvailable === dailyMapAvailable
        ? {}
        : dailyMapAvailable
          ? { dailyMapAvailable }
          : { dailyMapAvailable, day: null, dayPlaying: false },
    ),
  setMode: (mode) =>
    set((s) => ({ mode, seriesView: mode === 'simple' ? 'harmonized' : s.seriesView })),
  setSeriesView: (seriesView) => set({ seriesView }),
  setPlace: (place) =>
    set(() => ({
      place,
      placeData: null,
      showContributions: true,
      sheet: place ? 'half' : 'peek',
    })),
  setPlaceData: (placeData) => set({ placeData }),
  reloadPlace: () => set((s) => ({ placeData: null, placeNonce: s.placeNonce + 1 })),
  setDrawing: (drawing) =>
    set((s) => ({
      drawing,
      drawEndedAt: drawing === 'off' && s.drawing !== 'off' ? Date.now() : s.drawEndedAt,
    })),
  setOpenSection: (openSection) => set({ openSection }),
  setShowContributions: (showContributions) => set({ showContributions }),
  notify: (text, tone = 'info') => set({ notice: { id: ++seq, text, tone } }),
  clearNotice: () => set({ notice: null }),
  flyTo: (f) => set({ fly: { ...f, id: ++seq } }),
  announce: (announcement) => set({ announcement }),
  setMapBusy: (mapBusy) => set({ mapBusy }),
  setDetailNotice: (detailNotice) => set({ detailNotice }),
  setSheet: (sheet) => set({ sheet }),
  setFilePlan: (filePlan) => set({ filePlan }),
}));

/** Non-null static data, for components that render only after loading. */
export function useData(): StaticData {
  const d = useApp((s) => s.data);
  if (!d) throw new Error('Static data used before it was loaded');
  return d;
}

if (import.meta.env.DEV) {
  (window as unknown as { __store: typeof useApp }).__store = useApp;
}
