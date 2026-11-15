/**
 * Draw area (plan 8.4): polygon or rectangle with terra-draw. Click to add points,
 * double click or Enter (or the Finish button) to finish, Escape to cancel.
 */
import type { Map as MapLibre } from 'maplibre-gl';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { useEffect, useRef, useState } from 'react';
import { resolvePlace } from '../grid/place';
import type { LonLat } from '../grid/viewport';
import { TOO_LARGE_MESSAGE } from '../state/placeData';
import { useApp } from '../state/store';
import { color } from '../styles/tokens';

const TEAL = color.teal;
const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

export function DrawControl({ map }: { map: MapLibre | null }) {
  const drawing = useApp((s) => s.drawing);
  const setDrawing = useApp((s) => s.setDrawing);
  const [menu, setMenu] = useState(false);
  const drawRef = useRef<TerraDraw | null>(null);

  // Create terra-draw. The map has loaded its style when it gets here.
  useEffect(() => {
    if (!map) return;
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawPolygonMode({
          styles: {
            fillColor: TEAL,
            fillOpacity: 0.08,
            outlineColor: TEAL,
            outlineWidth: 2,
            closingPointColor: TEAL,
            closingPointOutlineColor: '#FFFFFF',
          },
        }),
        new TerraDrawRectangleMode({
          styles: { fillColor: TEAL, fillOpacity: 0.08, outlineColor: TEAL, outlineWidth: 2 },
        }),
      ],
    });
    draw.start();
    draw.on('finish', (id) => {
      const f = draw.getSnapshotFeature(id);
      draw.clear();
      const coords =
        f?.geometry.type === 'Polygon' ? (f.geometry.coordinates[0] as LonLat[]) : null;
      finishShape(coords);
    });
    drawRef.current = draw;
    return () => {
      try {
        draw.stop();
      } catch {
        // The map may already be gone.
      }
      drawRef.current = null;
    };
  }, [map]);

  // Mode follows the store; double click zoom is off while drawing.
  useEffect(() => {
    const draw = drawRef.current;
    if (!map) return;
    if (drawing === 'off') {
      map.doubleClickZoom.enable();
      if (draw?.enabled) {
        draw.clear();
        draw.setMode('static');
      }
      return;
    }
    map.doubleClickZoom.disable();
    draw?.setMode(drawing);
    map.getCanvas().focus();
  }, [drawing, map]);

  // Escape cancels, Enter finishes a polygon (also when focus is not on the canvas).
  useEffect(() => {
    if (drawing === 'off') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDrawing('off');
      } else if (e.key === 'Enter' && drawing === 'polygon' && e.target !== map?.getCanvas()) {
        e.preventDefault();
        finishPolygon(map);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drawing, map, setDrawing]);

  const start = (mode: 'polygon' | 'rectangle') => {
    setMenu(false);
    useApp.getState().clearNotice();
    setDrawing(mode);
  };

  return (
    <>
      <div className="map-tools">
        <button
          type="button"
          className="draw-button"
          aria-label="Draw area"
          title="Draw an area"
          aria-expanded={menu}
          aria-pressed={drawing !== 'off'}
          onClick={() => (drawing !== 'off' ? setDrawing('off') : setMenu((m) => !m))}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M2.5 13.5l1.2-4.1 7.6-7.6a1.4 1.4 0 012 0l.9.9a1.4 1.4 0 010 2l-7.6 7.6z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path d="M9.8 3.3l2.9 2.9" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span className="draw-label" aria-hidden="true">
            Draw area
          </span>
        </button>
        {menu && drawing === 'off' && (
          <div className="draw-menu">
            <button type="button" onClick={() => start('polygon')}>
              Polygon
            </button>
            <button type="button" onClick={() => start('rectangle')}>
              Rectangle
            </button>
          </div>
        )}
      </div>
      {drawing !== 'off' && (
        <div className="draw-bar" role="status">
          <span>
            {drawing === 'polygon'
              ? 'Click or tap to add points. Double click, Enter or Finish to close the shape.'
              : 'Click or tap one corner, then the opposite corner.'}
          </span>
          {drawing === 'polygon' && (
            <button type="button" className="button" onClick={() => finishPolygon(map)}>
              Finish
            </button>
          )}
          <button type="button" className="button" onClick={() => setDrawing('off')}>
            Cancel
          </button>
        </div>
      )}
    </>
  );
}

/** Turns a finished drawing into a shape place, or refuses it with the plan's message. */
function finishShape(coords: LonLat[] | null): void {
  const s = useApp.getState();
  const maxCells = s.data?.manifest.detail.max_place_cells ?? 5000;
  s.setDrawing('off');
  if (!coords || coords.length < 4) return;
  const ring = coords.slice(0, -1).map(([lon, lat]) => [round5(lon), round5(lat)] as LonLat);
  const r = resolvePlace({ kind: 'shape', ring }, maxCells);
  if (!r.ok) {
    s.notify(
      r.reason === 'too-large' ? TOO_LARGE_MESSAGE : 'That shape could not be used.',
      'error',
    );
    return;
  }
  s.setPlace({ kind: 'shape', ring });
}

/** terra-draw finishes a polygon on an Enter key event on the map canvas. */
function finishPolygon(map: MapLibre | null): void {
  const canvas = map?.getCanvas();
  if (!canvas) return;
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
}
