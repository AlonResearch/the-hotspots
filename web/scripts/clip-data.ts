/**
 * Copies a data folder with fine detail only for a lon/lat box (cells by H3 centre). Used by
 * build-deploy --clip, to fit the real build into a 1 GB static site.
 *
 * - World, copied whole: manifest, method, summary, overview r3 and r4, the forecast.
 * - Overview r5: only the res 0 parts that reach the box (whole files, so the map keeps res 5
 *   around the box).
 * - Detail tiles (res 3): only those with a res 5 child whose centre is in the box. Places outside
 *   them get the app's "History is not available for this area in this build" message.
 * - places.json keeps the presets whose point is in the box.
 * The copied manifest and detail index list only the files that exist. The source is only read.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cellToChildren, cellToLatLng, getResolution } from 'h3-js';

export type Box = [west: number, south: number, east: number, north: number];

export interface ClipStats {
  detailTiles: number;
  r5Parts: number;
  places: string[];
}

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
function writeJson(p: string, v: unknown): void {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v));
}

export function clipData(src: string, dst: string, box: Box): ClipStats {
  const [w, s, e, n] = box;
  const inBox = (lat: number, lon: number) => lon >= w && lon <= e && lat >= s && lat <= n;
  const touches = (parent: string) =>
    cellToChildren(parent, Math.max(getResolution(parent), 5)).some((c) =>
      inBox(...cellToLatLng(c)),
    );
  const copy = (rel: string) => cpSync(join(src, rel), join(dst, rel), { recursive: true });

  mkdirSync(dst, { recursive: true });
  for (const rel of ['method.json', 'summary', 'overview/r3', 'overview/r4', 'forecast']) copy(rel);

  const places = readJson<{ id: string; lat: number; lon: number }[]>(join(src, 'places.json'));
  const keptPlaces = places.filter((p) => inBox(p.lat, p.lon));
  writeJson(join(dst, 'places.json'), keptPlaces);

  const manifest = readJson<{ overview: { r5_parts: string[] } }>(join(src, 'manifest.json'));
  manifest.overview.r5_parts = manifest.overview.r5_parts.filter(touches);
  for (const part of manifest.overview.r5_parts) copy(`overview/r5/${part}`);
  writeJson(join(dst, 'manifest.json'), manifest);

  const index = readJson<{ tile_res: number; tiles: string[] }>(join(src, 'detail', 'index.json'));
  index.tiles = index.tiles.filter(touches);
  for (const t of index.tiles) copy(`detail/${t}.json`);
  writeJson(join(dst, 'detail', 'index.json'), index);

  return {
    detailTiles: index.tiles.length,
    r5Parts: manifest.overview.r5_parts.length,
    places: keptPlaces.map((p) => p.id),
  };
}
