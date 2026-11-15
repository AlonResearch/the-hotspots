/**
 * Time strip (plan 8.6): monthly bars for the world or the place, month selection,
 * keyboard slider, play, hatches for estimated and provisional months, unusual dots.
 * Scientific mode adds the band, seam marks and a Raw / Harmonized switch.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { forecastIndex } from '../data/forecast';
import {
  addMonths,
  MONTH_NAMES,
  monthDiff,
  monthLabel,
  monthToIndex,
  parseMonth,
} from '../data/months';
import { placeTitle } from '../panel/placeText';
import { useApp, useData } from '../state/store';
import { CLASS_WORDS } from '../stats/classify';
import { CONFIDENCE_WORDS } from '../stats/confidence';
import { monthResults } from '../stats/useResults';
import { cellDays } from '../stats/wording';
import { color, opacity } from '../styles/tokens';
import { SeamCheckList } from '../panel/sections/History/SeamCheck';
import { DayBar } from './DayBar';
import { daysWithData } from '../stats/daily';
import { FORECAST_OPACITY, forecastTint, outlookText } from '../stats/forecast';
import { OutlookStrip } from './OutlookStrip';
import { layoutSeamLabels } from './seamLabels';
import { usePlay } from './usePlay';
import { stripValues, type StripValues } from './values';

/** Room above the bars for the month flag. */
const PLOT_TOP = 20;
const AXIS_H = 15;
const FLAG_W = 58;
const FLAG_H = 15;
const MIN_BAR = 3;
/** A touch that moves less than this is a tap. */
const TAP_SLOP = 10;
const SEAM_FONT = 10;
/** Row pitch of the seam labels: a 10 px text box is 13 px tall, so the rows do not touch. */
const SEAM_ROW_H = 14;

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Width of a seam label in the strip font, with a fallback where canvas is missing. */
function textWidth(text: string): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  if (measureCtx) {
    // The strip text inherits the page font.
    measureCtx.font = `${SEAM_FONT}px ${getComputedStyle(document.body).fontFamily}`;
    return Math.ceil(measureCtx.measureText(text).width) + 1;
  }
  return Math.ceil(text.length * SEAM_FONT * 0.6);
}

export function TimeStrip() {
  usePlay();
  const { manifest, world, worldError, forecast: fc } = useData();
  const month = useApp((s) => s.month);
  const setMonth = useApp((s) => s.setMonth);
  const outlookMonth = useApp((s) => s.outlookMonth);
  const setOutlookMonth = useApp((s) => s.setOutlookMonth);
  const playing = useApp((s) => s.playing);
  const setPlaying = useApp((s) => s.setPlaying);
  const mode = useApp((s) => s.mode);
  const seriesView = useApp((s) => s.seriesView);
  const place = useApp((s) => s.place);
  const dailyMap = useApp((s) => s.dailyMapAvailable);
  const day = useApp((s) => s.day);
  const setDay = useApp((s) => s.setDay);
  const placeData = useApp((s) => s.placeData);
  const [which, setWhich] = useState<StripValues>('view');
  const [seamOpen, setSeamOpen] = useState(false);
  /** The whole record, or the forecast months filling the strip. */
  const [range, setRange] = useState<'record' | 'outlook'>('record');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(80);

  const usePlace = Boolean(place && placeData?.status === 'ready' && placeData.series);
  const series = usePlace ? placeData!.series! : world;
  const label = usePlace && place ? placeTitle(place) : 'World';
  const start = manifest.record.start;
  const n = series?.n ?? 0;
  const t = month ? monthToIndex(start, month) : n - 1;
  const firstRef = monthToIndex(start, manifest.first_reference_month);
  // The outlook: the place's median forecast, or the world's expected total.
  const placeFc = usePlace ? (placeData!.forecast ?? null) : null;
  const fcValues: ArrayLike<number> | null = fc
    ? usePlace
      ? (placeFc?.p50 ?? null)
      : fc.world.mean
    : null;
  const fcN = fc && fcValues ? fc.n_months : 0;
  /** Months between the end of the record and the forecast, which have neither. */
  const gap = fc ? Math.max(0, monthDiff(manifest.record.end, fc.start) - 1) : 0;
  const future = fcN > 0 ? gap + fcN : 0;
  const k = fcN > 0 ? forecastIndex(fc, outlookMonth) : -1;
  const inOutlook = k >= 0;
  const showOutlook = range === 'outlook' && fcN > 0;

  const values = useMemo(
    () => (series ? stripValues(series, mode, seriesView, which, firstRef) : new Float64Array()),
    [series, mode, seriesView, which, firstRef],
  );
  const results = useMemo(() => (series ? monthResults(series, manifest) : []), [series, manifest]);
  // Confidence (D27) is about the harmonized scale; raw sensor counts are what was seen.
  const harmonized = mode === 'simple' || (which === 'view' && seriesView === 'harmonized');

  // Size from the container.
  useLayoutEffect(() => {
    const el = scrollRef.current;
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

  const slots = n + future + 1; // one slot for the "now" marker
  const barW = Math.max(MIN_BAR, (width - 8) / Math.max(1, slots));
  const svgW = Math.max(width, slots * barW + 8);
  const plotH = Math.max(16, height - PLOT_TOP - AXIS_H);
  const max = useMemo(() => {
    let m = 0;
    for (let i = 0; i < values.length; i++) {
      m = Math.max(m, values[i]!);
      if (mode === 'sci' && series) m = Math.max(m, series.hi[i]!);
    }
    for (let j = 0; j < fcN; j++) {
      m = Math.max(m, fcValues![j]!);
      if (mode === 'sci' && placeFc) m = Math.max(m, placeFc.p90[j]!);
    }
    return m;
  }, [values, mode, series, fcN, fcValues, placeFc]);
  const y = (v: number) => (max > 0 ? Math.sqrt(Math.max(0, v) / max) * plotH : 0);
  const x = (i: number) => 4 + i * barW;
  /** Slot of forecast month j: after the "now" mark and the months without data. */
  const fx = (j: number) => x(n + 1 + gap + j);
  /** Slot of the cursor: the forecast month when one is shown, else the record month. */
  const cursorX = inOutlook ? fx(k) : x(t);

  // Keep the selected month in view when the strip scrolls.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || svgW <= width) return;
    const cx = cursorX;
    if (cx < el.scrollLeft + 24 || cx > el.scrollLeft + el.clientWidth - 24) {
      el.scrollLeft = cx - el.clientWidth / 2;
    }
  }, [cursorX, svgW, width, barW, showOutlook]);

  const result = results[t];
  const valueText = inOutlook
    ? outlookText(outlookMonth!, fcValues![k] ?? 0, placeFc, k, mode)
    : result
      ? [
          monthLabel(result.month),
          cellDays(values[t] ?? 0, result.status === 'estimated'),
          CLASS_WORDS[result.classification.cls],
          result.status !== 'observed' ? result.status : null,
          harmonized && result.confidence.level !== 'high'
            ? CONFIDENCE_WORDS[result.confidence.level]
            : null,
        ]
          .filter(Boolean)
          .join(', ')
      : '';

  const select = (i: number) => {
    const c = Math.max(0, Math.min(n - 1, i));
    if (results[c]) setMonth(results[c]!.month);
  };
  const selectForecast = (j: number) => {
    if (fc && fcN > 0) setOutlookMonth(addMonths(fc.start, Math.max(0, Math.min(fcN - 1, j))));
  };
  const toggleRange = () => {
    if (showOutlook) {
      setRange('record');
      return;
    }
    setRange('outlook');
    setPlaying(false);
    if (!inOutlook) selectForecast(0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      PageUp: -12,
      PageDown: 12,
    };
    if (e.key in step) {
      e.preventDefault();
      setPlaying(false);
      const d = step[e.key]!;
      // The forecast months follow the record: Right from the last month enters them.
      if (inOutlook) {
        if (k + d < 0) select(n - 1);
        else selectForecast(k + d);
      } else if (t >= n - 1 && d === 1 && fcN > 0) selectForecast(0);
      else select(t + d);
    } else if (e.key === 'Home') {
      e.preventDefault();
      select(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      if (inOutlook) selectForecast(fcN - 1);
      else select(n - 1);
    } else if (e.key === ' ') {
      e.preventDefault();
      setPlaying(!playing);
    }
  };

  const dragging = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - 4) / barW);
    if (fcN > 0 && i >= n + 1 + gap) selectForecast(i - (n + 1 + gap));
    else select(i);
  };

  /** Index of every January: faint year rules behind the bars. */
  const januaries = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) if (parseMonth(results[i]?.month ?? start).month === 1) out.push(i);
    return out;
  }, [n, results, start]);

  const years = useMemo(() => {
    const out: { i: number; year: number }[] = [];
    const every = barW * 12 >= 34 ? 1 : barW * 12 >= 14 ? 5 : 10;
    for (let i = 0; i < n; i++) {
      const { year, month: m } = parseMonth(results[i]?.month ?? start);
      if (m === 1 && year % every === 0) out.push({ i, year });
    }
    return out;
  }, [n, results, barW, start]);

  /** Seam labels placed on one or two rows so that none overlap; the rest keep a tooltip. */
  const seamLabels = useMemo(() => {
    if (mode !== 'sci') return new Map<string, ReturnType<typeof layoutSeamLabels>[number]>();
    const items = manifest.seams
      .map((s) => ({ s, i: monthToIndex(start, s.month) }))
      .filter(({ i }) => i >= 0 && i < n)
      .map(({ s, i }) => ({ key: s.month, x: x(i), label: s.label }));
    const out = layoutSeamLabels(items, {
      rows: plotH >= 2 * SEAM_ROW_H ? 2 : 1,
      minX: 0,
      maxX: x(n) + barW / 2 - 2,
      measure: textWidth,
    });
    return new Map(out.map((o) => [o.key, o]));
    // x() depends on barW only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, manifest.seams, start, n, barW, plotH]);

  const flagX = Math.max(1, Math.min(svgW - FLAG_W - 1, cursorX + barW / 2 - FLAG_W / 2));
  const flagMonth = inOutlook
    ? parseMonth(outlookMonth!)
    : result
      ? parseMonth(result.month)
      : null;
  const fcYear = fc ? parseMonth(fc.start).year : 0;
  const flagText = flagMonth
    ? `${MONTH_NAMES[flagMonth.month - 1]!.slice(0, 3)} ${flagMonth.year}`
    : '';

  if (!series) {
    return (
      <div className="strip strip-empty" role="status">
        {worldError ?? 'Loading the record...'}
      </div>
    );
  }

  return (
    <div className="strip">
      <DayBar />
      {mode === 'sci' && seamOpen && !showOutlook && (
        <div
          className="strip-popover"
          id="strip-seams"
          role="region"
          aria-label={`Seam check, ${label}`}
        >
          <div className="strip-values-phone">
            <p className="legend-title">Strip values</p>
            <div className="segmented" role="group" aria-label="Strip values">
              <button
                type="button"
                aria-pressed={which === 'view'}
                onClick={() => setWhich('view')}
              >
                Harmonized
              </button>
              <button type="button" aria-pressed={which === 'raw'} onClick={() => setWhich('raw')}>
                Raw
              </button>
            </div>
          </div>
          <p className="legend-title">Seam check, {label}</p>
          <SeamCheckList series={series} />
        </div>
      )}
      <div className="strip-side">
        <div className="strip-head">
          <div className="strip-label" title={label}>
            {label}
          </div>
          {fcN > 0 && (
            <button
              type="button"
              className="day-toggle outlook-toggle"
              aria-label={`${fcYear} forecast on the whole strip`}
              title={
                showOutlook
                  ? 'Back to the whole record'
                  : `Show only the ${fcYear} forecast, one bar per month`
              }
              aria-pressed={showOutlook}
              onClick={toggleRange}
            >
              <span aria-hidden="true">
                {fcYear}
                <span className="day-toggle-label"> forecast</span>
              </span>
            </button>
          )}
        </div>
        <div className="strip-value caption" aria-hidden="true">
          {valueText}
        </div>
        <div className="strip-controls">
          <button
            type="button"
            className="icon-button play"
            aria-label={playing ? 'Pause' : 'Play months'}
            aria-pressed={playing}
            onClick={() => {
              if (!playing && t >= n - 1) select(0);
              if (!playing) setRange('record');
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
          {dailyMap && !inOutlook && (
            <button
              type="button"
              className="day-toggle"
              aria-label="Day by day"
              title="Show this month day by day"
              aria-pressed={day !== null}
              onClick={() => (day !== null ? setDay(null) : setDay(daysWithData(manifest, month)))}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <rect
                  x="2"
                  y="3"
                  width="12"
                  height="11"
                  rx="1.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.4" />
                <rect x="9" y="9" width="2.5" height="2.5" fill="currentColor" />
              </svg>
              <span className="day-toggle-label" aria-hidden="true">
                Days
              </span>
            </button>
          )}
          {mode === 'sci' && !showOutlook && (
            <div className="segmented small" role="group" aria-label="Strip values">
              <button
                type="button"
                aria-pressed={which === 'view'}
                onClick={() => setWhich('view')}
              >
                Harmonized
              </button>
              <button type="button" aria-pressed={which === 'raw'} onClick={() => setWhich('raw')}>
                Raw
              </button>
            </div>
          )}
          {mode === 'sci' && !showOutlook && (
            <button
              type="button"
              className="link-button"
              aria-expanded={seamOpen}
              aria-controls="strip-seams"
              onClick={() => setSeamOpen((v) => !v)}
            >
              Seams
            </button>
          )}
          {mode === 'sci' && !showOutlook && (
            <button
              type="button"
              className="icon-button strip-options-toggle"
              aria-label="Strip options: raw or harmonized, seam check"
              aria-expanded={seamOpen}
              aria-controls="strip-seams"
              onClick={() => setSeamOpen((v) => !v)}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {showOutlook && (
        <OutlookStrip
          start={fc!.start}
          values={fcValues!}
          place={placeFc}
          mode={mode}
          selected={k}
          onSelect={selectForecast}
          label={label}
        />
      )}
      <div
        className="strip-scroll"
        hidden={showOutlook}
        ref={scrollRef}
        role="slider"
        tabIndex={0}
        aria-label={`Month, ${label} series`}
        aria-valuemin={0}
        aria-valuemax={n - 1 + fcN}
        aria-valuenow={inOutlook ? n + k : t}
        aria-valuetext={valueText}
        onKeyDown={onKeyDown}
      >
        <svg
          width={svgW}
          height={height}
          className="strip-svg"
          data-which={which}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse') {
              // Mouse: press and drag scrubs through the months.
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              setPlaying(false);
              pick(e);
            } else {
              // Touch and pen: a swipe scrolls the strip, only a tap selects (see onPointerUp).
              touchStart.current = { x: e.clientX, y: e.clientY };
            }
          }}
          onPointerMove={(e) => dragging.current && pick(e)}
          onPointerUp={(e) => {
            dragging.current = false;
            const t0 = touchStart.current;
            touchStart.current = null;
            if (t0 && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) < TAP_SLOP) {
              setPlaying(false);
              pick(e);
            }
          }}
          onPointerCancel={() => {
            // The browser took the gesture over for scrolling.
            dragging.current = false;
            touchStart.current = null;
          }}
        >
          <defs>
            <pattern
              id="hatch-est"
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="4"
                stroke={color.ink}
                strokeOpacity="0.4"
                strokeWidth="1"
              />
            </pattern>
            <pattern id="hatch-prov" width="4" height="4" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="0.6" fill={color.ink} fillOpacity="0.4" />
            </pattern>
          </defs>
          {januaries.map((i) => (
            <line
              key={i}
              className="year-rule"
              x1={x(i) - 0.5}
              x2={x(i) - 0.5}
              y1={PLOT_TOP - 4}
              y2={PLOT_TOP + plotH + 4}
              stroke={color.ink}
              strokeOpacity="0.09"
            />
          ))}
          {/* Selected month: a soft column behind the bar; the cursor and flag are drawn last. */}
          <rect
            x={cursorX - 1}
            y={PLOT_TOP}
            width={barW + 2}
            height={plotH}
            fill={color.teal}
            fillOpacity="0.12"
          />
          {results.map((r, i) => {
            const v = values[i] ?? 0;
            const h = y(v);
            const bw = Math.max(1, barW - (barW >= 4 ? 1 : 0.5));
            const top = PLOT_TOP + plotH - h;
            const unusual = r.classification.unusual;
            const partial = r.partial !== null;
            // Low confidence (D27): faded fill under the hatch, so the height does not read as comparable.
            const low = harmonized && r.confidence.level === 'low';
            return (
              <g
                key={r.month}
                data-month={r.month}
                data-value={v}
                data-confidence={r.confidence.level}
              >
                <rect
                  className="bar"
                  x={x(i)}
                  width={bw}
                  style={{ y: top, height: h }}
                  fill={partial ? 'none' : unusual ? color.ember[4] : color.ember[2]}
                  fillOpacity={low ? opacity.lowConfidence : 1}
                  stroke={partial ? color.ember[3] : 'none'}
                  strokeWidth={partial ? 1 : 0}
                />
                {!partial && r.status !== 'observed' && h > 0 && (
                  <rect
                    className="bar"
                    x={x(i)}
                    width={bw}
                    style={{ y: top, height: h }}
                    fill={`url(#hatch-${r.status === 'estimated' ? 'est' : 'prov'})`}
                  />
                )}
                {unusual && (
                  <circle
                    cx={x(i) + bw / 2}
                    cy={Math.max(3, top - 4)}
                    r={2}
                    fill={color.ember[4]}
                  />
                )}
                {mode === 'sci' && series.hi[i]! > series.lo[i]! && (
                  <line
                    x1={x(i) + bw / 2}
                    x2={x(i) + bw / 2}
                    y1={PLOT_TOP + plotH - y(series.lo[i]!)}
                    y2={PLOT_TOP + plotH - y(series.hi[i]!)}
                    stroke={color.ink}
                    strokeOpacity="0.55"
                    strokeWidth="1"
                  />
                )}
              </g>
            );
          })}
          {mode === 'sci' &&
            manifest.seams.map((s) => {
              const i = monthToIndex(start, s.month);
              if (i < 0 || i >= n) return null;
              const lab = seamLabels.get(s.month);
              return (
                <g key={s.month} className="seam" data-seam={s.month}>
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={2}
                    y2={PLOT_TOP + plotH}
                    stroke={color.ink}
                    strokeDasharray="2 2"
                    strokeOpacity="0.6"
                  />
                  <title>{s.label}</title>
                  {lab?.text && (
                    <text
                      x={lab.tx}
                      y={PLOT_TOP + 9 + lab.row * SEAM_ROW_H}
                      fontSize={SEAM_FONT}
                      fill={color.inkMuted}
                      textAnchor={lab.anchor}
                    >
                      {lab.text}
                    </text>
                  )}
                </g>
              );
            })}
          {/* The forecast months after "now": greyed and see-through, inside a dashed frame. */}
          {fcN > 0 && (
            <g className="future" data-forecast-start={fc!.start}>
              <rect
                className="future-frame"
                x={fx(0) - 1.5}
                y={PLOT_TOP - 2}
                width={fcN * barW + 2}
                height={plotH + 2}
                fill={color.ink}
                fillOpacity="0.04"
                stroke={color.ink}
                strokeOpacity="0.4"
                strokeDasharray="3 3"
                rx="2"
              />
              {Array.from({ length: fcN }, (_, j) => {
                const v = fcValues![j] ?? 0;
                const h = y(v);
                const bw = Math.max(1, barW - (barW >= 4 ? 1 : 0.5));
                const m = addMonths(fc!.start, j);
                return (
                  <g key={m} data-forecast-month={m} data-value={v}>
                    <rect
                      className="bar forecast-bar"
                      x={fx(j)}
                      width={bw}
                      style={{ y: PLOT_TOP + plotH - h, height: h }}
                      fill={forecastTint(color.ember[2])}
                      fillOpacity={FORECAST_OPACITY}
                    />
                    {mode === 'sci' && placeFc && placeFc.p90[j]! > placeFc.p10[j]! && (
                      <line
                        x1={fx(j) + bw / 2}
                        x2={fx(j) + bw / 2}
                        y1={PLOT_TOP + plotH - y(placeFc.p10[j]!)}
                        y2={PLOT_TOP + plotH - y(placeFc.p90[j]!)}
                        stroke={color.ink}
                        strokeOpacity="0.45"
                        strokeWidth="1"
                      />
                    )}
                  </g>
                );
              })}
              <text x={fx(0)} y={PLOT_TOP + plotH + 12} fontSize="10" fill={color.inkMuted}>
                {fcN * barW >= 24 ? fcYear : ''}
              </text>
            </g>
          )}
          {/* "Now" marker after the last month. */}
          <line
            x1={x(n) + barW / 2}
            x2={x(n) + barW / 2}
            y1={PLOT_TOP - 4}
            y2={PLOT_TOP + plotH}
            stroke={color.ink}
            strokeOpacity="0.7"
            strokeWidth="1"
          />
          <text
            x={x(n) + barW / 2}
            y={PLOT_TOP - 7}
            dx="-3"
            fontSize="10"
            fill={color.inkMuted}
            textAnchor="end"
          >
            now
          </text>
          {years.map(({ i, year }) => (
            <text
              key={year}
              x={x(i) + 2}
              y={PLOT_TOP + plotH + 12}
              fontSize="10"
              fill={color.inkMuted}
            >
              {year}
            </text>
          ))}
          <line
            x1={4}
            x2={x(n)}
            y1={PLOT_TOP + plotH + 0.5}
            y2={PLOT_TOP + plotH + 0.5}
            stroke={color.ink}
            strokeOpacity="0.3"
          />
          {/* Cursor and flag for the selected month, drawn last so nothing covers them. */}
          {(result || inOutlook) && (
            <g className="cursor" pointerEvents="none">
              <line
                x1={cursorX + barW / 2}
                x2={cursorX + barW / 2}
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
                {flagText}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
