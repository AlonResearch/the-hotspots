/**
 * The one door to the expert rooms (web/DESIGN.md, layout rule 4): the detail level and the
 * notes about the data. A "Scientific mode" sign stays next to the button while that mode is on.
 */
import { useEffect, useRef, useState } from 'react';
import { useApp, useData } from '../state/store';
import { formatDate } from './format';
import { ModeSwitch } from './ModeSwitch';
import { StatusMarker } from './StatusMarker';

export function MoreMenu() {
  const { manifest } = useData();
  const mode = useApp((s) => s.mode);
  const mapStyle = useApp((s) => s.mapStyle);
  const setMapStyle = useApp((s) => s.setMapStyle);
  const basemap = useApp((s) => s.basemap);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const openedIn = useRef(mode);

  // Changing the detail level closes the menu, so the change shows on the map and panel.
  useEffect(() => {
    if (open && mode !== openedIn.current) setOpen(false);
  }, [mode, open]);

  useEffect(() => {
    if (!open) return;
    // Capture phase, so Escape closes the menu before it would clear the place.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    // A tap or click outside closes it. Click fires only on a tap, never on a scroll.
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  return (
    <div className="more" ref={root}>
      {mode === 'sci' && <span className="mode-sign">Scientific mode</span>}
      <button
        ref={button}
        type="button"
        className="icon-button more-button"
        aria-label="More options"
        title="More options"
        aria-expanded={open}
        aria-controls="more-menu"
        onClick={() => {
          openedIn.current = mode;
          setOpen((v) => !v);
        }}
      >
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
          <circle cx="3" cy="8" r="1.5" fill="currentColor" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <circle cx="13" cy="8" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="more-menu" id="more-menu" role="region" aria-label="Options">
          <h2 className="more-title">Detail</h2>
          <ModeSwitch />
          <p className="caption">
            Scientific mode adds raw MODIS and VIIRS values, uncertainty bands, sensor seams, method
            tables and a CSV download.
          </p>
          <h2 className="more-title">Map</h2>
          <div className="segmented" role="group" aria-label="Map style">
            <button
              type="button"
              aria-pressed={mapStyle === 'detailed'}
              onClick={() => setMapStyle('detailed')}
            >
              Detailed
            </button>
            <button
              type="button"
              aria-pressed={mapStyle === 'quiet'}
              onClick={() => setMapStyle('quiet')}
            >
              Quiet
            </button>
          </div>
          <p className="caption">
            {basemap === 'local'
              ? 'The online map did not load, so only coastlines and country borders are shown.'
              : 'Detailed shows roads, towns, villages and borders as you zoom in. Quiet keeps only countries and cities.'}
          </p>
          <h2 className="more-title">About this data</h2>
          <p className="caption">
            Monthly satellite fire detections from MODIS and VIIRS, put on one scale so years can be
            compared. Data through{' '}
            <time dateTime={manifest.data_through}>{formatDate(manifest.data_through)}</time>.
          </p>
          {manifest.source === 'fixture' && (
            <p className="caption">
              <StatusMarker kind="fixture" /> Simulated values for development, not observations.
            </p>
          )}
          <p className="caption">Not for safety of life decisions.</p>
        </div>
      )}
    </div>
  );
}
