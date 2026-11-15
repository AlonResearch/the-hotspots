/**
 * Basemap (plan 8.10, decisions D13 and D23): OpenFreeMap vector tiles drawn with a
 * small style in the app tokens (Detailed or Quiet preset), or the bundled Natural Earth layers when the online
 * tiles do not answer within 4 s or VITE_BASEMAP=local is set.
 */
import type { MapOptions } from 'maplibre-gl';
import { color } from '../styles/tokens';

type Style = Exclude<MapOptions['style'], string | undefined>;

const OPENFREEMAP = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const PROBE_TIMEOUT_MS = 4000;

export type BasemapKind = 'online' | 'local';

const base = import.meta.env.BASE_URL ?? '/';

export function localStyle(): Style {
  return {
    version: 8,
    sources: {
      land: {
        type: 'geojson',
        data: `${base}basemap/ne_50m_land.geojson`,
        attribution:
          '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>',
      },
      lakes: { type: 'geojson', data: `${base}basemap/ne_50m_lakes.geojson` },
      borders: {
        type: 'geojson',
        data: `${base}basemap/ne_50m_admin_0_boundary_lines_land.geojson`,
      },
    },
    layers: [
      { id: 'water', type: 'background', paint: { 'background-color': color.water } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': color.ash } },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': color.water } },
      {
        id: 'borders',
        type: 'line',
        source: 'borders',
        paint: { 'line-color': color.inkMuted, 'line-opacity': 0.45, 'line-width': 0.7 },
      },
    ],
  };
}

/** English names for countries and regions, local (Latin script) names for towns and villages. */
const NAME_EN = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
const NAME_LOCAL = ['coalesce', ['get', 'name:latin'], ['get', 'name'], ['get', 'name:en']];

/** Water label colour: 4.6:1 on the water token. */
const WATER_TEXT = '#34505B';

const zoomed = (stops: [number, number][]) => [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...stops.flat(),
];

/**
 * Layers drawn only with the Detailed preset (D23). The Quiet preset hides them and keeps land,
 * water, country borders, country names and city names.
 */
export const DETAIL_LAYERS = [
  'landuse-residential',
  'road-minor',
  'road-secondary',
  'road-major',
  'admin-8',
  'admin-6',
  'label-water',
  'label-state',
  'label-town',
  'label-village',
  'building',
  'road-ref',
  'road-name',
  'road-name-minor',
  'label-suburb',
] as const;

/**
 * The cells and the cell grid are drawn under this layer: roads, borders and names stay on top,
 * so a place can be recognised through the fire colours.
 */
export const CELLS_BEFORE_ID = 'road-minor';
/** Same for the bundled basemap: country lines over the cells. */
export const CELLS_BEFORE_ID_LOCAL = 'borders';

export function onlineStyle(preset: 'detailed' | 'quiet' = 'detailed'): Style {
  const visibility = (id: string) =>
    preset === 'quiet' && (DETAIL_LAYERS as readonly string[]).includes(id) ? 'none' : 'visible';
  const halo = { 'text-halo-color': color.ash, 'text-halo-width': 1.5 };
  const roads = (
    id: string,
    classes: string[],
    minzoom: number,
    opacity: number,
    width: [number, number][],
  ) => ({
    id,
    type: 'line',
    source: 'omt',
    'source-layer': 'transportation',
    minzoom,
    filter: ['in', ['get', 'class'], ['literal', classes]],
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: visibility(id) },
    paint: { 'line-color': color.ink, 'line-opacity': opacity, 'line-width': zoomed(width) },
  });
  const roadNames = (id: string, classes: string[], minzoom: number) => ({
    id,
    type: 'symbol',
    source: 'omt',
    'source-layer': 'transportation_name',
    minzoom,
    filter: ['in', ['get', 'class'], ['literal', classes]],
    layout: {
      'symbol-placement': 'line',
      'text-field': NAME_LOCAL,
      'text-font': ['Noto Sans Regular'],
      'text-size': zoomed([
        [minzoom, 10],
        [15, 12],
      ]),
      visibility: visibility(id),
    },
    paint: { 'text-color': color.inkMuted, ...halo },
  });
  const admin = (id: string, level: number, minzoom: number, opacity: number, dash: number[]) => ({
    id,
    type: 'line',
    source: 'omt',
    'source-layer': 'boundary',
    minzoom,
    filter: ['all', ['==', ['get', 'admin_level'], level], ['!=', ['get', 'maritime'], 1]],
    layout: { visibility: visibility(id) },
    paint: {
      'line-color': color.inkMuted,
      'line-opacity': opacity,
      'line-width': zoomed([
        [minzoom, 0.6],
        [12, 1.2],
      ]),
      'line-dasharray': dash,
    },
  });
  const places = (
    id: string,
    classes: string[],
    minzoom: number,
    maxzoom: number,
    size: [number, number][],
    textColor: string,
    font = 'Noto Sans Regular',
    name: unknown = NAME_LOCAL,
  ) => ({
    id,
    type: 'symbol',
    source: 'omt',
    'source-layer': 'place',
    minzoom,
    maxzoom,
    filter: ['in', ['get', 'class'], ['literal', classes]],
    layout: {
      'text-field': name,
      'text-font': [font],
      'text-size': zoomed(size),
      'text-max-width': 8,
      visibility: visibility(id),
    },
    paint: { 'text-color': textColor, ...halo },
  });

  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      omt: {
        type: 'vector',
        url: OPENFREEMAP,
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap contributors</a>',
      },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': color.ash } },
      {
        id: 'landuse-residential',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        minzoom: 9,
        filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood']]],
        layout: { visibility: visibility('landuse-residential') },
        paint: { 'fill-color': color.ink, 'fill-opacity': 0.06 },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 13,
        layout: { visibility: visibility('building') },
        paint: { 'fill-color': color.ink, 'fill-opacity': 0.08 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'omt',
        'source-layer': 'water',
        paint: { 'fill-color': color.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'omt',
        'source-layer': 'waterway',
        minzoom: 8,
        paint: {
          'line-color': color.water,
          'line-width': zoomed([
            [8, 0.8],
            [12, 1.8],
          ]),
        },
      },
      // Cells and the cell grid are inserted here (CELLS_BEFORE_ID).
      roads('road-minor', ['tertiary', 'minor'], 11, 0.25, [
        [11, 0.4],
        [15, 2.6],
      ]),
      roads('road-secondary', ['primary', 'secondary'], 7, 0.32, [
        [7, 0.4],
        [12, 1.4],
        [15, 3.4],
      ]),
      roads('road-major', ['motorway', 'trunk'], 5, 0.42, [
        [5, 0.5],
        [12, 2],
        [15, 4],
      ]),
      admin('admin-8', 8, 10, 0.3, [1, 2]),
      admin('admin-6', 6, 8, 0.35, [3, 2]),
      admin('admin-1', 4, 4, 0.45, [4, 2]),
      {
        id: 'admin-0',
        type: 'line',
        source: 'omt',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: {
          'line-color': color.inkMuted,
          'line-opacity': 0.6,
          'line-width': zoomed([
            [2, 0.7],
            [10, 1.6],
          ]),
        },
      },
      {
        id: 'label-water',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'water_name',
        minzoom: 3,
        layout: {
          'text-field': NAME_EN,
          'text-font': ['Noto Sans Italic'],
          'text-size': 12,
          'text-max-width': 8,
          visibility: visibility('label-water'),
        },
        paint: { 'text-color': WATER_TEXT, 'text-halo-color': color.water, 'text-halo-width': 1 },
      },
      {
        id: 'road-ref',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'transportation_name',
        minzoom: 8,
        filter: [
          'all',
          ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
          ['has', 'ref'],
        ],
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 400,
          'text-field': ['get', 'ref'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 10,
          visibility: visibility('road-ref'),
        },
        paint: { 'text-color': color.inkMuted, ...halo },
      },
      roadNames('road-name', ['primary', 'secondary'], 11),
      roadNames('road-name-minor', ['tertiary', 'minor'], 13),
      places(
        'label-country',
        ['country'],
        1,
        7,
        [
          [2, 11],
          [6, 14],
        ],
        color.inkMuted,
        'Noto Sans Regular',
        NAME_EN,
      ),
      places(
        'label-state',
        ['state', 'province'],
        5,
        9,
        [
          [5, 11],
          [8, 13],
        ],
        color.inkMuted,
        'Noto Sans Italic',
        NAME_EN,
      ),
      places(
        'label-city',
        ['city'],
        4,
        24,
        [
          [4, 11],
          [10, 16],
        ],
        color.ink,
        'Noto Sans Bold',
      ),
      places(
        'label-town',
        ['town'],
        7,
        24,
        [
          [7, 11],
          [12, 14],
        ],
        color.ink,
      ),
      places(
        'label-suburb',
        ['suburb', 'quarter', 'neighbourhood'],
        12,
        24,
        [
          [12, 11],
          [15, 13],
        ],
        color.inkMuted,
        'Noto Sans Italic',
      ),
      places(
        'label-village',
        ['village', 'hamlet'],
        10,
        24,
        [
          [10, 11],
          [14, 13],
        ],
        color.inkMuted,
      ),
    ],
  } as Style;
}

/** Switches the preset on a loaded map without rebuilding the style (the cell overlay stays). */
export function applyMapStyle(
  map: {
    getLayer(id: string): unknown;
    setLayoutProperty(id: string, k: string, v: unknown): void;
  },
  preset: 'detailed' | 'quiet',
): void {
  for (const id of DETAIL_LAYERS) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', preset === 'quiet' ? 'none' : 'visible');
    }
  }
}

/** Picks the basemap: local when asked, otherwise online if its TileJSON answers in time. */
export async function chooseBasemap(): Promise<BasemapKind> {
  if (import.meta.env.VITE_BASEMAP === 'local') return 'local';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(OPENFREEMAP, { signal: controller.signal });
    return res.ok ? 'online' : 'local';
  } catch {
    return 'local';
  } finally {
    clearTimeout(timer);
  }
}
