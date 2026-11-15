/** Place header text and bounds. */
import { cellToBoundary } from 'h3-js';
import type { Place } from '../grid/place';
import type { PlaceData } from '../state/store';
import { formatArea } from '../stats/wording';

export function placeTitle(place: Place): string {
  if ('label' in place && place.label) return place.label;
  switch (place.kind) {
    case 'cell':
      return 'Selected cell';
    case 'point':
      return `${formatLat(place.lat)}, ${formatLon(place.lon)}`;
    case 'shape':
      return 'Drawn area';
  }
}

function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
}
function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

export function analysisLine(place: Place, d: PlaceData): string {
  const n = d.cells.length.toLocaleString('en-GB');
  const area = `about ${formatArea(d.areaKm2)}`;
  switch (place.kind) {
    case 'point':
      return `Neighbourhood: ${n} cells, ${area}`;
    case 'cell':
      return `Cell: ${n} cells, ${area}`;
    case 'shape':
      return `Your shape: ${formatArea(d.shapeKm2 ?? 0)}. Analysis area: ${n} cells, ${area}.`;
  }
}

export const SMALL_AREA_MESSAGE =
  'Satellites cannot resolve an area this small. We use the cells around it (about 250 km²).';

/** Bounds [w, s, e, n] of a set of cells, for "Zoom to place". */
export function cellsBounds(cells: readonly string[]): [number, number, number, number] {
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  for (const c of cells) {
    for (const [lat, lon] of cellToBoundary(c)) {
      w = Math.min(w, lon);
      e = Math.max(e, lon);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  }
  return [w, s, e, n];
}
