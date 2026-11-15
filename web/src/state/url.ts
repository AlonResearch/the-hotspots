/**
 * URL hash state (plan 7.2): #map=z/lat/lon&month=YYYY-MM&place=...&label=...&mode=sci&view=raw-modis
 * The place is stored as its definition (cell id, point, or encoded polygon), never as cell lists.
 */
import polyline from '@mapbox/polyline';
import { getResolution, isValidCell } from 'h3-js';
import { MONTH_RE } from '../data/contract';
import type { Place } from '../grid/place';
import type { LonLat } from '../grid/viewport';

export type Mode = 'simple' | 'sci';
export type SeriesView = 'harmonized' | 'raw-modis' | 'raw-viirs';

export interface View {
  lat: number;
  lon: number;
  zoom: number;
}

export interface UrlState {
  view: View;
  month: string;
  place: Place | null;
  mode: Mode;
  seriesView: SeriesView;
  /** A forecast month shown instead of the record month. The key is absent when none is. */
  outlook?: string;
}

export interface UrlDefaults {
  view: View;
  month: string;
  /** Inclusive record range for month validation. */
  record: { start: string; end: string };
  /** Inclusive forecast range, when the build has a forecast. */
  forecast?: { start: string; end: string } | null;
}

/** Build-time default view, `VITE_DEFAULT_VIEW=z/lat/lon` (set by scripts/build-deploy.ts --view). */
function envView(): View | null {
  const raw = import.meta.env?.VITE_DEFAULT_VIEW as string | undefined;
  if (!raw) return null;
  const [zoom, lat, lon] = raw.split('/').map(Number);
  if (![zoom, lat, lon].every((x) => x !== undefined && Number.isFinite(x))) return null;
  return { zoom: zoom!, lat: lat!, lon: lon! };
}

export const DEFAULT_VIEW: View = envView() ?? { zoom: 2, lat: 25, lon: 10 };

export interface Parsed {
  state: UrlState;
  /** True when any present value was invalid and a default was used. */
  hadInvalid: boolean;
}

export function parseHash(hash: string, d: UrlDefaults): Parsed {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  let hadInvalid = false;
  const bad = () => {
    hadInvalid = true;
  };

  let view = d.view;
  const map = params.get('map');
  if (map !== null) {
    const parts = map.split('/').map(Number);
    const [z, lat, lon] = parts;
    if (
      parts.length === 3 &&
      parts.every(Number.isFinite) &&
      z! >= 0 &&
      z! <= 22 &&
      Math.abs(lat!) <= 85 &&
      Math.abs(lon!) <= 180
    ) {
      view = { zoom: z!, lat: lat!, lon: lon! };
    } else bad();
  }

  let month = d.month;
  const m = params.get('month');
  if (m !== null) {
    if (MONTH_RE.test(m) && d.record.start <= m && m <= d.record.end) month = m;
    else bad();
  }

  let place: Place | null = null;
  const p = params.get('place');
  if (p !== null) {
    place = decodePlace(p, params.get('label') ?? undefined);
    if (!place) bad();
  }

  let mode: Mode = 'simple';
  const mo = params.get('mode');
  if (mo !== null) {
    if (mo === 'sci') mode = 'sci';
    else if (mo !== 'simple') bad();
  }

  let seriesView: SeriesView = 'harmonized';
  const v = params.get('view');
  if (v !== null) {
    if (v === 'raw-modis' || v === 'raw-viirs' || v === 'harmonized') seriesView = v;
    else bad();
  }
  // Simple mode always shows harmonized values.
  if (mode === 'simple' && seriesView !== 'harmonized') seriesView = 'harmonized';

  const state: UrlState = { view, month, place, mode, seriesView };
  const o = params.get('outlook');
  if (o !== null) {
    if (MONTH_RE.test(o) && d.forecast && d.forecast.start <= o && o <= d.forecast.end) {
      state.outlook = o;
    } else bad();
  }
  return { state, hadInvalid };
}

export function serializeHash(s: UrlState, d: Pick<UrlDefaults, 'month'>): string {
  const parts: string[] = [];
  parts.push(`map=${s.view.zoom.toFixed(2)}/${s.view.lat.toFixed(4)}/${s.view.lon.toFixed(4)}`);
  if (s.month !== d.month) parts.push(`month=${s.month}`);
  if (s.outlook) parts.push(`outlook=${s.outlook}`);
  if (s.place) {
    parts.push(`place=${encodePlace(s.place)}`);
    const label = 'label' in s.place ? s.place.label : undefined;
    if (label) parts.push(`label=${encodeURIComponent(label)}`);
  }
  if (s.mode === 'sci') parts.push('mode=sci');
  if (s.mode === 'sci' && s.seriesView !== 'harmonized') parts.push(`view=${s.seriesView}`);
  return `#${parts.join('&')}`;
}

export function encodePlace(p: Place): string {
  switch (p.kind) {
    case 'cell':
      return `c:${p.cell}`;
    case 'point':
      return `p:${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
    case 'shape':
      return `s:${encodeURIComponent(
        polyline.encode(
          p.ring.map(([lon, lat]) => [lat, lon]),
          5,
        ),
      )}`;
  }
}

export function decodePlace(text: string, label?: string): Place | null {
  const kind = text.slice(0, 2);
  const body = text.slice(2);
  try {
    if (kind === 'c:') {
      if (!isValidCell(body)) return null;
      const res = getResolution(body);
      return res >= 3 && res <= 5 ? { kind: 'cell', cell: body } : null;
    }
    if (kind === 'p:') {
      const [lat, lon] = body.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (Math.abs(lat!) > 90 || Math.abs(lon!) > 180) return null;
      return withLabel({ kind: 'point', lat: lat!, lon: lon! }, label);
    }
    if (kind === 's:') {
      const pts = polyline.decode(decodeURIComponent(body), 5);
      if (pts.length < 3) return null;
      const ring = pts.map(([lat, lon]) => [lon, lat] as LonLat);
      if (ring.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat))) return null;
      if (ring.some(([lon, lat]) => Math.abs(lat) > 90 || Math.abs(lon) > 180)) return null;
      return withLabel({ kind: 'shape', ring }, label);
    }
  } catch {
    return null;
  }
  return null;
}

function withLabel<T extends Place & { label?: string }>(p: T, label?: string): T {
  return label ? { ...p, label } : p;
}

/** True when two places have the same definition (labels ignored). */
export function samePlace(a: Place | null, b: Place | null): boolean {
  if (a === null || b === null) return a === b;
  return encodePlace(a) === encodePlace(b);
}
