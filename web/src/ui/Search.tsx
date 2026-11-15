/**
 * Search (plan 8.5): coordinates first, then preset places, then the geocoder on Enter.
 * "Use my location" sits in the same list. Choosing a result flies to zoom 9 and sets a
 * point place (the 7-cell neighbourhood) labelled with the result name.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DEMO_REGIONS } from '../insight/demo';
import { useData } from '../state/store';
import { formatCoordinates, parseCoordinates } from './coords';
import { geocode, type GeoResult } from './geocoder';
import { choosePoint, requestMyLocation } from './placeActions';

type Option =
  | { kind: 'coords'; lat: number; lon: number; label: string }
  | { kind: 'preset'; lat: number; lon: number; label: string }
  | { kind: 'geo'; lat: number; lon: number; label: string; detail: string }
  | { kind: 'location'; label: string };

const OFFLINE = 'Search is offline. Try coordinates or a listed place.';

export function Search() {
  const { places } = useData();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [geo, setGeo] = useState<{ query: string; results: GeoResult[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const firstFocus = useRef(true);
  const listId = useId();
  const autoFocus = typeof window !== 'undefined' && window.innerWidth >= 768;

  const options = useMemo<Option[]>(() => {
    const q = text.trim().toLowerCase();
    const out: Option[] = [];
    const c = parseCoordinates(text);
    if (c) out.push({ kind: 'coords', ...c, label: formatCoordinates(c.lat, c.lon) });
    for (const p of places) {
      if (!q || p.name.toLowerCase().includes(q) || p.id.includes(q)) {
        out.push({ kind: 'preset', lat: p.lat, lon: p.lon, label: p.name });
      }
    }
    // The four places of the insight demo (Why, What to do), unless the build lists them.
    for (const r of DEMO_REGIONS) {
      const name = `${r.name}, Italy`;
      if (places.some((p) => p.id === r.id || p.name === name)) continue;
      if (!q || name.toLowerCase().includes(q) || r.id.includes(q)) {
        out.push({ kind: 'preset', lat: r.lat, lon: r.lon, label: name });
      }
    }
    if (geo && geo.query === text.trim()) {
      for (const g of geo.results) out.push({ kind: 'geo', ...g, label: g.name });
    }
    if (!q) out.push({ kind: 'location', label: 'Use my location' });
    return out;
  }, [text, places, geo]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const choose = (o: Option) => {
    close();
    setMessage(null);
    if (o.kind === 'location') {
      requestMyLocation();
      return;
    }
    setText(o.label);
    choosePoint(o.lat, o.lon, o.label);
  };

  const runGeocoder = async () => {
    const query = text.trim();
    if (query.length < 2) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setMessage(null);
    try {
      const results = await geocode(query, controller.signal);
      setGeo({ query, results });
      setOpen(true);
      if (results.length === 0) setMessage('No place found. Try coordinates or a listed place.');
    } catch {
      if (controller.signal.aborted) return;
      setMessage(OFFLINE);
      setOpen(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = active >= 0 ? options[active] : undefined;
      if (o) choose(o);
      else if (parseCoordinates(text)) choose(options[0]!);
      else void runGeocoder();
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.nativeEvent.stopImmediatePropagation();
        close();
      }
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const showList = open && (options.length > 0 || message !== null || busy);

  return (
    <div className="search">
      <label className="visually-hidden" htmlFor="search-input">
        Search a place or coordinates
      </label>
      <input
        ref={inputRef}
        id="search-input"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        placeholder="Search a place or coordinates"
        autoComplete="off"
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
          setMessage(null);
        }}
        onFocus={() => {
          // The automatic focus on load does not open the list, so it never covers the map.
          if (firstFocus.current) firstFocus.current = false;
          else setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(close, 150)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="search-list" id={listId} role="listbox" aria-label="Search results">
          {options.map((o, i) => (
            <li key={`${o.kind}-${o.label}-${i}`} role="presentation">
              <button
                type="button"
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                className="search-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
              >
                <span>{o.label}</span>
                <span className="caption">
                  {o.kind === 'coords'
                    ? 'Coordinates'
                    : o.kind === 'preset'
                      ? 'Listed place'
                      : o.kind === 'geo'
                        ? o.detail
                        : 'Asks the browser'}
                </span>
              </button>
            </li>
          ))}
          {busy && (
            <li role="presentation" className="search-message">
              Searching...
            </li>
          )}
          {message && (
            <li role="presentation" className="search-message">
              {message}
            </li>
          )}
          {!busy && !message && text.trim().length >= 2 && !parseCoordinates(text) && (
            <li role="presentation" className="search-message">
              Press Enter to search other places online.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
