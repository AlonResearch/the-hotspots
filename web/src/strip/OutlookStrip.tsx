/**
 * The outlook as the whole strip: one wide bar per forecast month. Bars are greyed and
 * see-through because they are a forecast, not an observation. Scientific mode adds the
 * 10% to 90% range and the place's usual value.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { addMonths, MONTH_NAMES, parseMonth } from '../data/months';
import { FORECAST_OPACITY, forecastTint, outlookText, type PlaceForecast } from '../stats/forecast';
import { color } from '../styles/tokens';

const PLOT_TOP = 20;
const AXIS_H = 15;
const FLAG_W = 58;
const FLAG_H = 15;

interface Props {
  start: string;
  values: ArrayLike<number>;
  /** The place's forecast (range and usual value), or null for the world. */
  place: PlaceForecast | null;
  mode: 'simple' | 'sci';
  /** Selected forecast month index, or -1. */
  selected: number;
  onSelect: (k: number) => void;
  label: string;
}

export function OutlookStrip({ start, values, place, mode, selected, onSelect, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(80);
  const n = values.length;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      setHeight(el.clientHeight);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const sci = mode === 'sci' && place !== null;
  const slot = Math.max(8, (width - 8) / Math.max(1, n));
  const plotH = Math.max(16, height - PLOT_TOP - AXIS_H);
  let max = 0;
  for (let k = 0; k < n; k++) {
    max = Math.max(max, values[k] ?? 0);
    if (sci) max = Math.max(max, place.p90[k] ?? 0, place.usual[k] ?? 0);
  }
  const y = (v: number) => (max > 0 ? Math.sqrt(Math.max(0, v) / max) * plotH : 0);
  const x = (k: number) => 4 + k * slot;
  const bw = Math.max(3, slot * 0.62);
  const months = Array.from({ length: n }, (_, k) => addMonths(start, k));
  const valueText =
    selected >= 0
      ? outlookText(months[selected]!, values[selected] ?? 0, place, selected, mode)
      : '';

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n };
    if (!(e.key in step)) return;
    e.preventDefault();
    onSelect(Math.max(0, Math.min(n - 1, Math.max(0, selected) + step[e.key]!)));
  };

  const flagX =
    selected >= 0
      ? Math.max(1, Math.min(width - FLAG_W - 1, x(selected) + slot / 2 - FLAG_W / 2))
      : 0;
  const sel = selected >= 0 ? parseMonth(months[selected]!) : null;

  return (
    <div
      className="strip-scroll strip-outlook"
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={`Forecast month, ${label}`}
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={Math.max(0, selected)}
      aria-valuetext={valueText || 'No forecast month selected'}
      onKeyDown={onKeyDown}
    >
      <svg width={width} height={height} className="strip-svg outlook-svg">
        {selected >= 0 && (
          <rect
            x={x(selected)}
            y={PLOT_TOP}
            width={slot}
            height={plotH}
            fill={color.teal}
            fillOpacity="0.12"
          />
        )}
        {months.map((m, k) => {
          const v = values[k] ?? 0;
          const h = y(v);
          const cx = x(k) + slot / 2;
          const { year, month: cm } = parseMonth(m);
          const name = MONTH_NAMES[cm - 1]!;
          return (
            <g key={m} data-forecast-month={m} data-value={v}>
              <title>{outlookText(m, v, place, k, mode)}</title>
              <rect
                className="bar forecast-bar"
                x={cx - bw / 2}
                width={bw}
                style={{ y: PLOT_TOP + plotH - h, height: h }}
                fill={forecastTint(color.ember[2])}
                fillOpacity={FORECAST_OPACITY}
                stroke={color.ink}
                strokeOpacity="0.35"
                strokeDasharray="2 2"
              />
              {sci && (
                <>
                  <line
                    className="forecast-range"
                    x1={cx}
                    x2={cx}
                    y1={PLOT_TOP + plotH - y(place.p10[k] ?? 0)}
                    y2={PLOT_TOP + plotH - y(place.p90[k] ?? 0)}
                    stroke={color.ink}
                    strokeOpacity="0.55"
                  />
                  <line
                    className="forecast-usual"
                    x1={cx - bw / 2 - 2}
                    x2={cx + bw / 2 + 2}
                    y1={PLOT_TOP + plotH - y(place.usual[k] ?? 0)}
                    y2={PLOT_TOP + plotH - y(place.usual[k] ?? 0)}
                    stroke={color.ink}
                    strokeWidth="1.5"
                  />
                </>
              )}
              <text
                x={cx}
                y={PLOT_TOP + plotH + 12}
                fontSize="10"
                fill={color.inkMuted}
                textAnchor="middle"
              >
                {slot >= 56 && (k === 0 || cm === 1)
                  ? `${name.slice(0, 3)} ${year}`
                  : slot >= 24
                    ? name.slice(0, 3)
                    : name.slice(0, 1)}
              </text>
              {/* The whole column takes the tap. Click fires on a tap, never on a swipe. */}
              <rect
                className="outlook-hit"
                x={x(k)}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
                onClick={() => onSelect(k)}
              />
            </g>
          );
        })}
        <line
          x1={4}
          x2={x(n)}
          y1={PLOT_TOP + plotH + 0.5}
          y2={PLOT_TOP + plotH + 0.5}
          stroke={color.ink}
          strokeOpacity="0.3"
        />
        {sel && (
          <g className="cursor" pointerEvents="none">
            <line
              x1={x(selected) + slot / 2}
              x2={x(selected) + slot / 2}
              y1={FLAG_H + 1}
              y2={PLOT_TOP + plotH + 3}
              stroke={color.teal}
              strokeWidth="1.5"
            />
            <rect x={flagX} y={1} width={FLAG_W} height={FLAG_H} rx="3" fill={color.teal} />
            <text
              x={flagX + FLAG_W / 2}
              y={12}
              fontSize="10.5"
              fontWeight="600"
              fill={color.surface}
              textAnchor="middle"
            >
              {`${MONTH_NAMES[sel.month - 1]!.slice(0, 3)} ${sel.year}`}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
