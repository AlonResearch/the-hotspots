/**
 * Place outlines (plan 7.3 and 8.4): the drawn shape (thin, dashed) and the analysis
 * area (solid, the boundary of the place's res 6 cells), as two MapLibre line layers.
 */
import { cellsToMultiPolygon } from 'h3-js';
import type { GeoJSONSource, Map as MapLibre } from 'maplibre-gl';
import { useEffect } from 'react';
import { useApp } from '../state/store';
import { color } from '../styles/tokens';

const AREA = 'place-area';
const SHAPE = 'place-shape';

type FC = GeoJSON.FeatureCollection;
const empty: FC = { type: 'FeatureCollection', features: [] };

function ensureLayers(map: MapLibre): void {
  if (!map.getSource(AREA)) map.addSource(AREA, { type: 'geojson', data: empty });
  if (!map.getSource(SHAPE)) map.addSource(SHAPE, { type: 'geojson', data: empty });
  if (!map.getLayer(AREA)) {
    map.addLayer({
      id: AREA,
      type: 'line',
      source: AREA,
      paint: { 'line-color': color.teal, 'line-width': 2.5 },
    });
  }
  if (!map.getLayer(SHAPE)) {
    map.addLayer({
      id: SHAPE,
      type: 'line',
      source: SHAPE,
      paint: { 'line-color': color.teal, 'line-width': 1.2, 'line-dasharray': [2, 2] },
    });
  }
}

/** The map passed in has loaded its style (MapStage hands it out on 'load'). */
export function usePlaceOutline(map: MapLibre | null): void {
  const place = useApp((s) => s.place);
  const cells = useApp((s) => s.placeData?.cells);

  useEffect(() => {
    if (!map) return;
    ensureLayers(map);
    const area: FC =
      cells && cells.length > 0
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'MultiPolygon', coordinates: cellsToMultiPolygon(cells, true) },
              },
            ],
          }
        : empty;
    const shape: FC =
      place?.kind === 'shape'
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: [[...place.ring, place.ring[0]!]] },
              },
            ],
          }
        : empty;
    (map.getSource(AREA) as GeoJSONSource).setData(area);
    (map.getSource(SHAPE) as GeoJSONSource).setData(shape);
  }, [map, place, cells]);
}
