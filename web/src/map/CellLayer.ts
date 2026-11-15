/** Builds the H3 cell layer props (plan 7.3 and 8.2). */
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import type { PickingInfo } from '@deck.gl/core';
import { getHexagonEdgeLengthAvg, UNITS } from 'h3-js';
import type { SeriesView } from '../state/url';
import { forecastRgb } from '../stats/forecast';
import { color, opacity, rgb } from '../styles/tokens';
import type { CellRow } from './cellData';
import {
  cellAreaKm2,
  density,
  densityClass,
  fillColor,
  hexagonPixels,
  mapCellAlpha,
} from './density';

export interface DrawCell {
  cell: string;
  value: number;
  densityValue: number;
  k: number;
  color: [number, number, number, number];
}

export function valueOf(row: CellRow, view: SeriesView): number {
  return view === 'raw-modis' ? row.modis : view === 'raw-viirs' ? row.viirs : row.h;
}

/** Drawable cells: zero is not drawn (plan 8.2). */
export function toDrawCells(
  rows: CellRow[],
  view: SeriesView,
  breaks: readonly number[],
  res?: number,
  /** Low confidence (D27): the fill is faded further. */
  low = false,
): DrawCell[] {
  const out: DrawCell[] = [];
  const alpha = res === undefined ? undefined : mapCellAlpha(res, low ? 'low' : null);
  for (const r of rows) {
    const value = valueOf(r, view);
    if (!(value > 0)) continue;
    const d = density(value, cellAreaKm2(r.cell));
    const k = densityClass(d, breaks);
    if (k < 0) continue;
    out.push({ cell: r.cell, value, densityValue: d, k, color: fillColor(k, alpha) });
  }
  return out;
}

export interface LayerOptions {
  id: string;
  cells: DrawCell[];
  res: number;
  zoom: number;
  lat: number;
  layerOpacity: number;
  beforeId?: string;
  onHover?: (info: PickingInfo<DrawCell>) => void;
  /** Cells drawn dimmed (outside the place in the contributions view). */
  dimmed?: boolean;
  /** Outline colour, when not the warm outline of observed cells. */
  outline?: [number, number, number, number];
}

const OUTLINE: [number, number, number, number] = [
  ...rgb.cellOutline,
  Math.round(opacity.outline * 255),
];

export function cellLayer(o: LayerOptions): H3HexagonLayer<DrawCell> {
  const px = hexagonPixels(getHexagonEdgeLengthAvg(o.res, UNITS.m), o.zoom, o.lat);
  const outline = px >= 10;
  return new H3HexagonLayer<DrawCell>({
    id: o.id,
    data: o.cells,
    getHexagon: (d) => d.cell,
    getFillColor: (d) => d.color,
    filled: true,
    extruded: false,
    stroked: outline,
    getLineColor: o.outline ?? OUTLINE,
    lineWidthUnits: 'pixels',
    getLineWidth: 1,
    highPrecision: 'auto',
    pickable: Boolean(o.onHover),
    onHover: o.onHover,
    opacity: o.layerOpacity * (o.dimmed ? opacity.dimmed : 1),
    updateTriggers: { getFillColor: [o.cells] },
    ...(o.beforeId ? { beforeId: o.beforeId } : {}),
  });
}

/** Hexagons narrower than this get no grid: the mesh would turn into grey noise. */
export const GRID_MIN_PIXELS = 16;
/** A safety cap on grid cells for one view. */
export const GRID_MAX_CELLS = 20000;

const GRID_LINE: [number, number, number, number] = [...rgb.ink, Math.round(opacity.grid * 255)];

/**
 * The cell grid (D22): every cell of the view as a faint outline, so cells without detected fire
 * read as checked rather than missing, and a lone active cell sits in its grid. Drawn under the
 * active cells and without fill, so roads and names stay readable.
 */
export function gridLayer(o: { cells: string[]; beforeId?: string }): H3HexagonLayer<string> {
  return new H3HexagonLayer<string>({
    id: 'cell-grid',
    data: o.cells,
    getHexagon: (d) => d,
    filled: false,
    extruded: false,
    stroked: true,
    getLineColor: GRID_LINE,
    lineWidthUnits: 'pixels',
    getLineWidth: 1,
    highPrecision: 'auto',
    pickable: false,
    ...(o.beforeId ? { beforeId: o.beforeId } : {}),
  });
}

/** Fill opacity of forecast cells: clearly see-through, so they never read as observations. */
export const FORECAST_CELL_ALPHA = 0.5;
export const FORECAST_OUTLINE: [number, number, number, number] = [...rgb.ink, 90];

/** Forecast cells (median per cell): the same density classes, greyed and see-through. */
export function toForecastCells(
  cells: readonly string[],
  values: readonly number[],
  breaks: readonly number[],
): DrawCell[] {
  const out: DrawCell[] = [];
  for (let i = 0; i < cells.length; i++) {
    const value = values[i]!;
    if (!(value > 0)) continue;
    const d = density(value, cellAreaKm2(cells[i]!));
    const k = densityClass(d, breaks);
    if (k < 0) continue;
    const c = forecastRgb(color.ember[k]!);
    out.push({
      cell: cells[i]!,
      value,
      densityValue: d,
      k,
      color: [c[0], c[1], c[2], Math.round(FORECAST_CELL_ALPHA * 255)],
    });
  }
  return out;
}
