import type { Map as MapLibre } from 'maplibre-gl';
import { DrawControl } from '../map/DrawControl';
import { useApp } from '../state/store';
import { color } from '../styles/tokens';
import { MoreMenu } from './MoreMenu';
import { Search } from './Search';

/**
 * Floating controls over the map (web/DESIGN.md, layout): the "where" card on the left
 * (name, search, draw) and the More menu on the right. No bar across the map.
 */
export function TopBar({ map }: { map: MapLibre | null }) {
  const busy = useApp((s) => s.mapBusy);
  return (
    <header className="topbar">
      <div className="where">
        <h1 className="brand">
          <svg className="brand-mark" viewBox="0 0 20 22" width="18" height="20" aria-hidden="true">
            <path
              d="M10 1.6l8.14 4.7v9.4L10 20.4l-8.14-4.7V6.3z"
              fill="none"
              stroke={color.ink}
              strokeWidth="1.6"
            />
            <path d="M10 6.4l3.98 2.3v4.6L10 15.6l-3.98-2.3V8.7z" fill={color.ember[3]} />
          </svg>
          The Hotspots
        </h1>
        <Search />
        <DrawControl map={map} />
      </div>
      <MoreMenu />
      <div className={`progress ${busy ? 'is-busy' : ''}`} aria-hidden="true" />
    </header>
  );
}
