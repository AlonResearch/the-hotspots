/** Place definitions and their analysis cells (plan 7.1, 8.3 and 8.4). */
import { cellToChildren, getResolution, gridDisk, isValidCell, latLngToCell } from 'h3-js';
import { ringAreaKm2 } from './area';
import { containedCells, overlappingCells, type LonLat } from './viewport';

export const ATOM_RES = 6;
/** Smallest analysis area in res 6 cells (the 7-cell neighbourhood). */
export const MIN_PLACE_CELLS = 7;

export type Place =
  | { kind: 'cell'; cell: string }
  | { kind: 'point'; lat: number; lon: number; label?: string }
  | { kind: 'shape'; ring: LonLat[]; label?: string };

export type PlaceResolution =
  | {
      ok: true;
      cells: string[];
      /** Cells added by the 7-cell minimum or cut by a drawn boundary (D15). */
      partlyOutside: Set<string>;
      /** Area of the drawn shape, for shapes only. */
      shapeKm2: number | null;
      /** True when the 7-cell minimum added cells around a small shape. */
      expanded: boolean;
    }
  | { ok: false; reason: 'too-large' | 'invalid' };

export function resolvePlace(place: Place, maxCells: number): PlaceResolution {
  switch (place.kind) {
    case 'cell': {
      if (!isValidCell(place.cell)) return { ok: false, reason: 'invalid' };
      const res = getResolution(place.cell);
      if (res > ATOM_RES || res < 0) return { ok: false, reason: 'invalid' };
      const cells = res === ATOM_RES ? [place.cell] : cellToChildren(place.cell, ATOM_RES);
      return {
        ok: true,
        cells: cells.sort(),
        partlyOutside: new Set(),
        shapeKm2: null,
        expanded: false,
      };
    }
    case 'point': {
      if (!validLatLon(place.lat, place.lon)) return { ok: false, reason: 'invalid' };
      const centre = latLngToCell(place.lat, place.lon, ATOM_RES);
      return {
        ok: true,
        cells: gridDisk(centre, 1).sort(),
        partlyOutside: new Set(),
        shapeKm2: null,
        expanded: false,
      };
    }
    case 'shape':
      return resolveShape(place.ring, maxCells);
  }
}

function resolveShape(ring: LonLat[], maxCells: number): PlaceResolution {
  if (ring.length < 3 || ring.some(([lon, lat]) => !validLatLon(lat, lon))) {
    return { ok: false, reason: 'invalid' };
  }
  const shapeKm2 = ringAreaKm2(ring);
  // Reject before filling: a continent-sized shape would create millions of cells.
  if (shapeKm2 > maxCells * 36.13 * 1.5) return { ok: false, reason: 'too-large' };
  const overlap = new Set(overlappingCells(ring, ATOM_RES));
  if (overlap.size > maxCells) return { ok: false, reason: 'too-large' };
  const inside = new Set(containedCells(ring, ATOM_RES));
  const partlyOutside = new Set([...overlap].filter((c) => !inside.has(c)));
  let expanded = false;
  if (overlap.size < MIN_PLACE_CELLS) {
    expanded = true;
    for (const c of [...overlap]) {
      for (const n of gridDisk(c, 1)) {
        if (!overlap.has(n)) {
          overlap.add(n);
          partlyOutside.add(n);
        }
      }
    }
  }
  return { ok: true, cells: [...overlap].sort(), partlyOutside, shapeKm2, expanded };
}

function validLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

/** Closes a drawn rectangle given two corners. */
export function rectangleRing(a: LonLat, b: LonLat): LonLat[] {
  const [w, e] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [s, n] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
  ];
}
