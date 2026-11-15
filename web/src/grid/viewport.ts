/** Cells that overlap a polygon or a viewport rectangle (plan 8.2 and 8.4). */
import * as h3 from 'h3-js';

export type LonLat = [number, number];

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** True when the installed h3-js has the overlap mode (added in 4.2). */
export function hasOverlapMode(): boolean {
  return (
    typeof h3.polygonToCellsExperimental === 'function' &&
    typeof h3.POLYGON_TO_CELLS_FLAGS?.containmentOverlapping === 'string'
  );
}

/** Cells overlapping a lon/lat ring, through h3's overlap mode or the fallback. */
export function overlappingCells(
  ring: readonly LonLat[],
  res: number,
  forceFallback = false,
): string[] {
  const closed = closeRing(ring);
  if (!forceFallback && hasOverlapMode()) {
    return h3.polygonToCellsExperimental(
      [closed as number[][]],
      res,
      h3.POLYGON_TO_CELLS_FLAGS.containmentOverlapping,
      true,
    );
  }
  return fallbackOverlap(closed, res);
}

/** Cells whose whole area lies inside the ring. */
export function containedCells(ring: readonly LonLat[], res: number): string[] {
  const closed = closeRing(ring);
  if (hasOverlapMode()) {
    return h3.polygonToCellsExperimental(
      [closed as number[][]],
      res,
      h3.POLYGON_TO_CELLS_FLAGS.containmentFull,
      true,
    );
  }
  return h3.polygonToCells([closed as number[][]], res, true);
}

/**
 * Fallback overlap (plan 8.4): centre-mode cells, plus the cell of every vertex,
 * plus the cell of points sampled every 1 km along the boundary.
 */
export function fallbackOverlap(ring: readonly LonLat[], res: number): string[] {
  const closed = closeRing(ring);
  const out = new Set(h3.polygonToCells([closed as number[][]], res, true));
  for (let i = 0; i < closed.length - 1; i++) {
    const [lon1, lat1] = closed[i]!;
    const [lon2, lat2] = closed[i + 1]!;
    out.add(h3.latLngToCell(lat1, lon1, res));
    const km = h3.greatCircleDistance([lat1, lon1], [lat2, lon2], h3.UNITS.km);
    const steps = Math.ceil(km);
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      out.add(h3.latLngToCell(lat1 + (lat2 - lat1) * f, lon1 + (lon2 - lon1) * f, res));
    }
  }
  return [...out];
}

function closeRing(ring: readonly LonLat[]): LonLat[] {
  const r = ring.map(([lon, lat]) => [lon, lat] as LonLat);
  const first = r[0];
  const last = r[r.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) r.push([first[0], first[1]]);
  return r;
}

/**
 * Cells overlapping a viewport rectangle. The rectangle is cut into pieces at most
 * 90 degrees wide, so H3 never sees an ambiguous polygon, and clamped to the poles.
 */
export function bboxCells(bbox: BBox, res: number): string[] {
  const south = Math.max(-85, bbox.south);
  const north = Math.min(85, bbox.north);
  let west = bbox.west;
  let east = bbox.east;
  if (east - west >= 360) {
    west = -180;
    east = 180;
  }
  const out = new Set<string>();
  const step = 90;
  for (let x = west; x < east; x += step) {
    const width = Math.min(east, x + step) - x;
    const a = wrapLon(x);
    const b = a + width;
    // A piece that crosses the antimeridian is split in two.
    const pieces: [number, number][] =
      b > 180
        ? [
            [a, 180],
            [-180, b - 360],
          ]
        : [[a, b]];
    for (const [w, e] of pieces) {
      if (e - w <= 0) continue;
      const ring: LonLat[] = [
        [w, south],
        [e, south],
        [e, north],
        [w, north],
        [w, south],
      ];
      for (const c of overlappingCells(ring, res)) out.add(c);
    }
  }
  return [...out];
}

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
