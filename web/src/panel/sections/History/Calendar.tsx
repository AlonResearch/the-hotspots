/**
 * Calendar (plan 8.7.2): an HTML table, one row per year (newest first), 12 month
 * columns. Each cell is a button coloured on the ember ramp scaled to the place's own
 * range (decision D17), with hatch for estimated and provisional, a faded fill for low
 * confidence (D27), a dot for unusual and an outline for partial. Arrow keys move the selected month (roving focus).
 */
import { useEffect, useMemo, useRef } from 'react';
import { addMonths, MONTH_NAMES, monthDiff, parseMonth } from '../../../data/months';
import { CLASS_WORDS } from '../../../stats/classify';
import { FORECAST_OPACITY, forecastTint, type PlaceForecast } from '../../../stats/forecast';
import { CONFIDENCE_WORDS } from '../../../stats/confidence';
import type { MonthResult } from '../../../stats/history';
import { calendarScaleMax, calendarStep } from '../../../stats/history';
import { cellDays, formatValue } from '../../../stats/wording';
import { color, opacity, overLand } from '../../../styles/tokens';

interface Props {
  results: MonthResult[];
  values: ArrayLike<number>;
  selected: number;
  onSelect: (t: number) => void;
  /** The outlook: its months get their own greyed cells, in a new row for a new year. */
  forecast?: PlaceForecast | null;
  /** Selected forecast month index, or -1 when a record month is selected. */
  selectedForecast?: number;
  onSelectForecast?: (k: number) => void;
  /** Words for a forecast cell. */
  forecastLabel?: (k: number) => string;
}

type Cell = { kind: 'record'; r: MonthResult } | { kind: 'forecast'; k: number };

export function Calendar({
  results,
  values,
  selected,
  onSelect,
  forecast = null,
  selectedForecast = -1,
  onSelectForecast,
  forecastLabel,
}: Props) {
  const max = useMemo(() => calendarScaleMax(values), [values]);
  const tableRef = useRef<HTMLTableElement>(null);
  const focusRequested = useRef(false);

  const rows = useMemo(() => {
    const byYear = new Map<number, (Cell | null)[]>();
    const rowOf = (year: number) => {
      let row = byYear.get(year);
      if (!row) {
        row = new Array<Cell | null>(12).fill(null);
        byYear.set(year, row);
      }
      return row;
    };
    for (const r of results) rowOf(r.year)[r.calendarMonth - 1] = { kind: 'record', r };
    for (let k = 0; k < (forecast?.n ?? 0); k++) {
      const { year, month } = parseMonth(addMonths(forecast!.start, k));
      rowOf(year)[month - 1] = { kind: 'forecast', k };
    }
    return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  }, [results, forecast]);
  const inForecast = forecast !== null && selectedForecast >= 0;

  useEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    tableRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, [selected, selectedForecast]);

  /** Moves by months along the record and on into the forecast, skipping months with neither. */
  const move = (delta: number) => {
    const first = results[0]!.month;
    const last = results[results.length - 1]!.month;
    const cur = inForecast ? addMonths(forecast.start, selectedForecast) : results[selected]!.month;
    let target = addMonths(cur, delta);
    focusRequested.current = true;
    if (forecast && onSelectForecast) {
      const end = addMonths(forecast.start, forecast.n - 1);
      if (Math.abs(delta) === 1 && target > last && target < forecast.start) {
        target = delta > 0 ? forecast.start : last;
      }
      if (target >= forecast.start) {
        onSelectForecast(Math.min(forecast.n - 1, monthDiff(forecast.start, target)));
        return;
      }
      if (target > last && target <= end) return;
    }
    onSelect(Math.max(0, Math.min(results.length - 1, monthDiff(first, target))));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: 12,
      ArrowDown: -12,
    };
    if (e.key in step) {
      e.preventDefault();
      move(step[e.key]!);
    }
  };

  return (
    <div className="calendar-wrap">
      <table className="calendar" ref={tableRef} onKeyDown={onKeyDown}>
        <caption className="visually-hidden">
          Fire activity by month and year. Use the arrow keys to move between months.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Year</span>
            </th>
            {MONTH_NAMES.map((m) => (
              <th key={m} scope="col" abbr={m}>
                {m.slice(0, 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([year, months]) => (
            <tr key={year}>
              <th
                scope="row"
                className={
                  months.some((c) => c?.kind === 'forecast') ? 'is-forecast-year' : undefined
                }
              >
                {year}
              </th>
              {months.map((cell, i) => {
                if (!cell) return <td key={i} className="cal-empty" />;
                if (cell.kind === 'forecast') {
                  const fk = cell.k;
                  const step = calendarStep(forecast!.p50[fk] ?? 0, max);
                  const on = inForecast && fk === selectedForecast;
                  const text = forecastLabel?.(fk) ?? `${MONTH_NAMES[i]} ${year}: forecast`;
                  return (
                    <td key={i}>
                      <button
                        type="button"
                        className={`cal-cell is-forecast${on ? ' is-selected' : ''}`}
                        style={{
                          background:
                            step < 0
                              ? undefined
                              : forecastTint(color.ember[step]!, FORECAST_OPACITY),
                        }}
                        data-forecast-month={addMonths(forecast!.start, fk)}
                        aria-label={text}
                        aria-pressed={on}
                        title={text}
                        tabIndex={on ? 0 : -1}
                        onClick={() => onSelectForecast?.(fk)}
                      />
                    </td>
                  );
                }
                const r = cell.r;
                const on = !inForecast && r.t === selected;
                const v = values[r.t] ?? 0;
                const k = calendarStep(v, max);
                const partial = r.partial !== null;
                const low = r.confidence.level === 'low';
                const label = `${MONTH_NAMES[i]} ${year}: ${cellDays(v, r.status === 'estimated')}, ${CLASS_WORDS[r.classification.cls]}${
                  r.status !== 'observed' ? `, ${r.status}` : ''
                }${r.confidence.level !== 'high' ? `, ${CONFIDENCE_WORDS[r.confidence.level]}` : ''}`;
                const fill =
                  partial || k < 0
                    ? undefined
                    : low
                      ? overLand(color.ember[k]!, opacity.lowConfidence)
                      : color.ember[k];
                const cls = [
                  'cal-cell',
                  `is-${r.status}`,
                  partial ? 'is-partial' : '',
                  low ? 'is-low' : '',
                  r.classification.unusual ? 'is-unusual' : '',
                  on ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <td key={i}>
                    <button
                      type="button"
                      className={cls}
                      style={{ background: fill }}
                      aria-label={label}
                      aria-pressed={on}
                      title={label}
                      tabIndex={on ? 0 : -1}
                      onClick={() => onSelect(r.t)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caption">
        {max > 0
          ? `Colour scale for this place: 0 to ${formatValue(max)} active cell-days in a month (top 2% of its active months shown darkest).`
          : 'No activity in the record, so the calendar is empty.'}{' '}
        Hatched: estimated before VIIRS. Faded: low confidence, not comparable with later years.
        Dotted: provisional. Dot: unusual.
        {forecast ? ' Greyed with a dashed edge: forecast, not yet observed.' : ''}
      </p>
    </div>
  );
}
