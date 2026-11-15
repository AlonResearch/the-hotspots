/**
 * Day mode of the map (plan 4.6): the selected month shown day by day as a running total, so the
 * map builds up to the monthly map. Offered only where every active cell in view has daily values
 * (the Day by day button on the strip). Classes stay monthly: the colours are the monthly scale.
 */
import { useEffect } from 'react';
import { isPartial, monthName, monthStatus, parseMonth } from '../data/months';
import { useApp, useData } from '../state/store';
import { daysWithData, UTC_DAYS } from '../stats/daily';
import { StatusMarker } from '../ui/StatusMarker';

const DAY_MS = 600;

export function DayBar() {
  const { manifest } = useData();
  const month = useApp((s) => s.month);
  const day = useApp((s) => s.day);
  const playing = useApp((s) => s.dayPlaying);
  const setDay = useApp((s) => s.setDay);
  const setPlaying = useApp((s) => s.setDayPlaying);
  const last = month ? daysWithData(manifest, month) : 0;

  // Day playback: one day every 600 ms, stops on the last day with data.
  useEffect(() => {
    if (!playing || day === null) return;
    if (day >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setDay(day + 1), DAY_MS);
    return () => clearTimeout(t);
  }, [playing, day, last, setDay, setPlaying]);

  if (day === null || !month) return null;
  const { year, month: cm } = parseMonth(month);
  const range = `${day === 1 ? '1' : `1 to ${day}`} ${monthName(cm)} ${year}`;
  const status = isPartial(manifest, month) ? 'partial' : monthStatus(manifest, month);

  return (
    <div className="day-bar" role="group" aria-label={`Days of ${monthName(cm)} ${year}`}>
      <button
        type="button"
        className="icon-button play"
        aria-label={playing ? 'Pause days' : 'Play days'}
        aria-pressed={playing}
        onClick={() => {
          if (!playing && day >= last) setDay(1);
          setPlaying(!playing);
        }}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div className="day-text">
        <span className="day-range">{range}</span>
        <span className="caption">
          Running total, {UTC_DAYS} <StatusMarker kind={status} />
        </span>
      </div>
      <input
        className="day-slider"
        type="range"
        min={1}
        max={last}
        step={1}
        value={Math.min(day, last)}
        aria-label="Day of the month"
        aria-valuetext={`${range}, ${UTC_DAYS}`}
        onChange={(e) => {
          setPlaying(false);
          setDay(Number(e.target.value));
        }}
      />
      <button
        type="button"
        className="icon-button"
        aria-label="Back to the whole month"
        title="Back to the whole month"
        onClick={() => setDay(null)}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </div>
  );
}
