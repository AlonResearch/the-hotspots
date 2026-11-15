/** Areas, centres, distances and directions for places (plan 6.1 and 6.6). */
import { cellArea, cellToLatLng, greatCircleDistance, UNITS } from 'h3-js';

export type LatLng = [number, number];

export function areaKm2(cells: readonly string[]): number {
  let a = 0;
  for (const c of cells) a += cellArea(c, UNITS.km2);
  return a;
}

/** Mean of the cell centres. Good enough for areas up to a few hundred km across. */
export function centroid(cells: readonly string[]): LatLng {
  if (cells.length === 0) return [0, 0];
  let lat = 0;
  let x = 0;
  let y = 0;
  for (const c of cells) {
    const [la, lo] = cellToLatLng(c);
    lat += la;
    x += Math.cos((lo * Math.PI) / 180);
    y += Math.sin((lo * Math.PI) / 180);
  }
  return [lat / cells.length, (Math.atan2(y, x) * 180) / Math.PI];
}

export function distanceKm(a: LatLng, b: LatLng): number {
  return greatCircleDistance(a, b, UNITS.km);
}

/** Initial bearing from a to b in degrees, 0 = north, clockwise. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const f1 = a[0] * toRad;
  const f2 = b[0] * toRad;
  const dl = (b[1] - a[1]) * toRad;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (((Math.atan2(y, x) / toRad) % 360) + 360) % 360;
}

const COMPASS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

export function compass8(bearing: number): string {
  return COMPASS[Math.round(bearing / 45) % 8]!;
}

/** "4 km north-east of the centre", or "At the centre" under 1 km. */
export function describeOffset(centre: LatLng, point: LatLng): string {
  const d = distanceKm(centre, point);
  if (d < 1) return 'At the centre';
  return `${Math.round(d)} km ${compass8(bearingDeg(centre, point))} of the centre`;
}

/** Geodesic area of a lon/lat ring in km² (spherical excess, as in common GIS libraries). */
export function ringAreaKm2(ring: readonly [number, number][]): number {
  const R = 6371.0088;
  const n = ring.length;
  if (n < 3) return 0;
  const rad = Math.PI / 180;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [lon1, lat1] = ring[i]!;
    const [lon2, lat2] = ring[(i + 1) % n]!;
    total += (lon2 - lon1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return Math.abs((total * R * R) / 2);
}
