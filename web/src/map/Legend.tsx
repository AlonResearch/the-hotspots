import { useState, type CSSProperties } from 'react';
import { monthLabel, monthStatus, isPartial } from '../data/months';
import { cellSizeChip, type Res } from '../grid/ladder';
import { useApp, useData } from '../state/store';
import { forecastRgb } from '../stats/forecast';
import { color, overLand } from '../styles/tokens';
import { StatusMarker } from '../ui/StatusMarker';
import { FORECAST_CELL_ALPHA } from './CellLayer';
import { ConfidenceMarker } from '../ui/Confidence';
import { statsConfig } from '../stats/config';
import { breakLabels, cellAlpha, LEGEND_WORDS, mapCellAlpha, mapConfidence } from './density';

/** Swatch colour as a custom property: the CSS draws it as a hexagon inside the cell outline. */
const swatch = (fill: string) => ({ '--swatch': fill }) as CSSProperties;

interface Props {
  res: Res;
  detailMissing: boolean;
  /** Shown instead of the activity ramp while the contributions view is on. */
  contributions: { month: string } | null;
  /** The cell grid is on screen: explain the empty hexagons. */
  grid?: boolean;
  /** The forecast is on the map instead of the record. */
  forecast?: { month: string; res: number } | null;
}

/** Colour ramp, cell size chip, month status chip (plan 7.3, 8.1, U7). */
export function Legend({
  res,
  detailMissing,
  contributions,
  grid = false,
  forecast = null,
}: Props) {
  const { manifest } = useData();
  const mode = useApp((s) => s.mode);
  const month = useApp((s) => s.month);
  const seriesView = useApp((s) => s.seriesView);
  const [info, setInfo] = useState(false);
  const [folded, setFolded] = useState(false);

  if (folded) {
    return (
      <div className="legend is-folded">
        <button
          type="button"
          className="link-button legend-toggle"
          aria-expanded={false}
          onClick={() => setFolded(false)}
        >
          Show legend
        </button>
      </div>
    );
  }
  const hide = (
    <button
      type="button"
      className="icon-button legend-toggle"
      aria-expanded={true}
      aria-label="Hide legend"
      title="Hide legend"
      onClick={() => setFolded(true)}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    </button>
  );
  const status = monthStatus(manifest, month);
  const partial = isPartial(manifest, month);

  if (forecast) {
    const words = mode === 'sci' ? breakLabels(manifest.color.density_breaks) : LEGEND_WORDS;
    return (
      <div className="legend is-forecast" aria-label="Map legend">
        {hide}
        <p className="legend-title">
          {mode === 'sci' ? 'Forecast, active cell-days per 1,000 km²' : 'Forecast'},{' '}
          {monthLabel(forecast.month)}
        </p>
        <ol className="legend-ramp">
          {words.map((l, i) => (
            <li key={l}>
              <span
                className="legend-swatch"
                style={swatch(forecastOverLand(color.ember[i]!, FORECAST_CELL_ALPHA))}
              />
              <span className="legend-label">{l}</span>
            </li>
          ))}
        </ol>
        <div className="legend-chips">
          <span className="chip">{cellSizeChip(forecast.res as Res, manifest.ladder)}</span>
          <StatusMarker kind="forecast" />
        </div>
        <p className="caption legend-note">Greyed: a forecast, not an observation.</p>
      </div>
    );
  }

  if (contributions) {
    return (
      <div className="legend" aria-label="Map legend">
        {hide}
        <p className="legend-title">
          Share of this place&apos;s activity in {monthLabel(contributions.month)}
        </p>
        <ol className="legend-ramp is-share">
          {['Smallest', '', '', '', 'Largest'].map((w, i) => (
            <li key={i}>
              <span
                className="legend-swatch"
                style={swatch(overLand(color.ember[i + 1]!, cellAlpha(6)))}
              />
              <span className="legend-label">{w}</span>
            </li>
          ))}
        </ol>
        <div className="legend-chips">
          {grid && (
            <span className="legend-none">
              <span className="legend-swatch is-none" aria-hidden="true" />
              No fire detected
            </span>
          )}
          <StatusMarker kind={partial ? 'partial' : status} />
        </div>
      </div>
    );
  }

  const labels = mode === 'sci' ? breakLabels(manifest.color.density_breaks) : LEGEND_WORDS;
  const viewLabel =
    seriesView === 'raw-modis' ? 'Raw MODIS' : seriesView === 'raw-viirs' ? 'Raw VIIRS' : null;
  const level = mapConfidence(status, month, res, seriesView);
  const lowLine =
    level !== 'low'
      ? null
      : month < statsConfig.terraOnlyBefore
        ? 'Before October 2002 only Terra was flying: the estimate is not checked, so cells are shown faded.'
        : 'Before 2012, cells this small are not a reliable estimate, so they are shown faded. Zoom out to compare years.';

  return (
    <div className="legend" aria-label="Map legend">
      {hide}
      <p className="legend-title">
        {mode === 'sci' ? (
          <>
            Active cell-days per 1,000 km², {monthLabel(month)}
            {viewLabel && <> ({viewLabel})</>}
          </>
        ) : (
          <>Fire activity, {monthLabel(month)}</>
        )}{' '}
        {mode === 'simple' && (
          <button
            type="button"
            className="link-button"
            aria-expanded={info}
            onClick={() => setInfo((v) => !v)}
          >
            What is this?
          </button>
        )}
      </p>
      {info && mode === 'simple' && (
        <p className="caption" style={{ maxWidth: 320, margin: '0 0 6px' }}>
          Colours show active cell-days per 1,000 km² in the month: for each small cell of about 36
          km², the number of days with at least one satellite fire detection, added up and divided
          by the area.
        </p>
      )}
      <ol className="legend-ramp">
        {labels.map((l, i) => (
          <li key={l}>
            <span
              className="legend-swatch"
              style={swatch(overLand(color.ember[i]!, mapCellAlpha(res, level)))}
            />
            <span className="legend-label">{l}</span>
          </li>
        ))}
      </ol>
      <div className="legend-chips">
        {grid && (
          <span className="legend-none">
            <span className="legend-swatch is-none" aria-hidden="true" />
            No fire detected
          </span>
        )}
        <span className="chip">{cellSizeChip(res, manifest.ladder)}</span>
        <StatusMarker kind={partial ? 'partial' : status} />
        {detailMissing && <span className="chip">Detail is not available here in this build.</span>}
        {lowLine && (
          <span className="legend-confidence" data-confidence="low">
            <ConfidenceMarker level="low" /> {lowLine}
          </span>
        )}
      </div>
    </div>
  );
}

/** The colour a forecast cell shows over land (greyed fill at its opacity). */
function forecastOverLand(hexColor: string, alpha: number): string {
  const a = forecastRgb(hexColor);
  const n = Number.parseInt(color.ash.slice(1), 16);
  const b = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgb(${a.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha))).join(' ')})`;
}
