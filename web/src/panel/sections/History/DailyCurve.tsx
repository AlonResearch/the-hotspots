/**
 * Day by day inside the selected month (plan 4.6). Shown only when every cell of the place lies
 * in a daily area; otherwise the panel shows nothing here, never a partial sum.
 *
 * Default view: the running total through the month (0 up to the month's value). Second view: a
 * 5-day running sum. A raw day-by-day line is not offered: it jumps with clouds and satellite
 * passes more than with fire. Classes stay monthly; the "usual pace" line is the month's normal
 * spread evenly over its days, and is labelled so.
 */
import { cellToParent } from 'h3-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { daysInMonth, isPartial, monthName, parseMonth } from '../../../data/months';
import { isAbort, loader } from '../../../data/loader';
import type { TileData } from '../../../data/tile';
import type { PlaceData } from '../../../state/store';
import { useData } from '../../../state/store';
import {
  daysWithData,
  placeDays,
  ROLLING_DAYS,
  rollingSum,
  runningTotal,
  UTC_DAYS,
} from '../../../stats/daily';
import type { MonthResult } from '../../../stats/history';
import { formatValue } from '../../../stats/wording';
import { color } from '../../../styles/tokens';
import { StatusMarker } from '../../../ui/StatusMarker';

const W = 340;
const H = 132;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 10;
const PAD_B = 18;
/** A touch that moves less than this is a tap. */
const TAP_SLOP = 10;

type View = 'total' | 'rolling';

/** The place's tiles, from the loader cache (the place loader fetched them already). */
function usePlaceTiles(data: PlaceData): Map<string, TileData> | null {
  const [tiles, setTiles] = useState<Map<string, TileData> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(data.tiles.map((t) => loader.tile(t, controller.signal))).then(
      (loaded) => setTiles(new Map(loaded.map((t) => [t.parent, t]))),
      (e: unknown) => {
        if (!isAbort(e)) setTiles(null);
      },
    );
    return () => controller.abort();
  }, [data.tiles]);
  return tiles;
}

export function DailyCurve({ data, result: r }: { data: PlaceData; result: MonthResult }) {
  const { manifest, method } = useData();
  const tiles = usePlaceTiles(data);
  const [view, setView] = useState<View>('total');
  // The picked day belongs to one month and view; another month or view clears it.
  const [pickedAt, setPickedAt] = useState<{ key: string; day: number } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const days = useMemo(() => {
    if (!tiles) return null;
    const tileRes = manifest.detail.tile_res;
    return placeDays(
      data.cells,
      (c) => tiles.get(cellToParent(c, tileRes)),
      r.month,
      manifest,
      method?.daily,
    );
  }, [tiles, data.cells, r.month, manifest, method]);

  if (!days) return null;
  const key = `${r.month}|${view}`;
  const picked = pickedAt?.key === key ? pickedAt.day : null;
  const setPicked = (day: number | null) => setPickedAt(day === null ? null : { key, day });

  const n = daysInMonth(r.month);
  const last = daysWithData(manifest, r.month);
  const { year, month: cm } = parseMonth(r.month);
  const name = monthName(cm);
  const total = runningTotal(days, last);
  const rolling = rollingSum(days, ROLLING_DAYS, last);
  const series = view === 'total' ? total : rolling;
  const monthValue = total[last - 1] ?? 0;
  // The usual pace: the month's normal spread evenly over its days, only where months are compared.
  const compared = !['insufficient', 'estimated_only'].includes(r.classification.cls);
  const normal = compared && r.baseline.normal > 0 ? r.baseline.normal : null;
  const status = isPartial(manifest, r.month) ? 'partial' : r.status;

  const top = Math.max(1e-9, ...series, view === 'total' && normal ? normal : 0);
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const x = (d: number) => PAD_L + ((d - 0.5) / n) * plotW; // centre of day d
  const y = (v: number) => PAD_T + plotH - (Math.max(0, v) / top) * plotH;
  const step = plotW / n;

  const totalPath = (() => {
    let p = `M${PAD_L},${y(0)}`;
    for (let d = 1; d <= last; d++) {
      p += ` L${PAD_L + (d - 1) * step},${y(total[d - 2] ?? 0)} L${PAD_L + d * step},${y(total[d - 1]!)}`;
    }
    return p;
  })();

  const readout = (() => {
    const d = picked;
    if (d !== null && d >= 1 && d <= last) {
      if (view === 'total') {
        return `${d} ${name}: ${formatValue(days[d - 1]!)} that day, ${formatValue(total[d - 1]!)} so far`;
      }
      const from = Math.max(1, d - ROLLING_DAYS + 1);
      return `${from === d ? d : `${from} to ${d}`} ${name}: ${formatValue(rolling[d - 1]!)} in ${d - from + 1} days`;
    }
    if (view === 'rolling') {
      let best = 0;
      for (let i = 1; i < last; i++) if (rolling[i]! > rolling[best]!) best = i;
      return monthValue > 0
        ? `Highest ${ROLLING_DAYS}-day sum: ${formatValue(rolling[best]!)}, ending ${best + 1} ${name}.`
        : `No fire detected on any day of ${name} ${year}.`;
    }
    const through = last < n ? `through ${last} ${name}` : `in ${name} ${year}`;
    const pace =
      normal !== null && last < n
        ? ` A usual ${name}, spread evenly over its days, would be at ${formatValue((normal * last) / n)} by then.`
        : '';
    return monthValue > 0
      ? `${formatValue(monthValue)} active cell-days ${through}.${pace}`
      : `No fire detected on any day ${through}.`;
  })();

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - box.left) / box.width) * W;
    setPicked(Math.max(1, Math.min(last, Math.floor((fx - PAD_L) / step) + 1)));
  };

  return (
    <section className="daily" aria-labelledby="daily-title">
      <div className="daily-head">
        <h4 className="sub" id="daily-title">
          Day by day
        </h4>
        <span className="caption">{UTC_DAYS}</span>
        <StatusMarker kind={status} />
      </div>
      <div className="segmented" role="group" aria-label="Daily view">
        <button type="button" aria-pressed={view === 'total'} onClick={() => setView('total')}>
          Running total
        </button>
        <button type="button" aria-pressed={view === 'rolling'} onClick={() => setView('rolling')}>
          {ROLLING_DAYS}-day sum
        </button>
      </div>
      <figure className="daily-chart">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`${view === 'total' ? 'Running total' : `${ROLLING_DAYS}-day sum`} for ${name} ${year}, ${UTC_DAYS}. ${readout}`}
          data-view={view}
          data-days={last}
          data-total={monthValue}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse') pick(e);
            else touch.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            // Hover is a desktop extra: a mouse shows the day under it.
            if (e.pointerType === 'mouse') pick(e);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setPicked(null);
          }}
          onPointerUp={(e) => {
            const t0 = touch.current;
            touch.current = null;
            // Touch and pen act on a tap only, never while the panel scrolls.
            if (t0 && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) < TAP_SLOP) pick(e);
          }}
          onPointerCancel={() => {
            touch.current = null;
          }}
        >
          {/* Days after the data date of a partial month. */}
          {last < n && (
            <rect
              x={PAD_L + last * step}
              y={PAD_T}
              width={(n - last) * step}
              height={plotH}
              fill={color.ink}
              fillOpacity="0.04"
            />
          )}
          {view === 'total' ? (
            <>
              <path
                d={`${totalPath} L${PAD_L + last * step},${y(0)} Z`}
                fill={color.ember[1]}
                fillOpacity="0.35"
              />
              <path d={totalPath} fill="none" stroke={color.ember[3]} strokeWidth="2" />
              {normal !== null && (
                <>
                  <line
                    x1={PAD_L}
                    y1={y(0)}
                    x2={PAD_L + n * step}
                    y2={y(normal)}
                    stroke={color.ink}
                    strokeOpacity="0.55"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={PAD_L + n * step}
                    y={Math.max(PAD_T + 8, y(normal) - 4)}
                    fontSize="10"
                    textAnchor="end"
                    fill={color.inkMuted}
                  >
                    usual month, spread evenly
                  </text>
                </>
              )}
            </>
          ) : (
            Array.from({ length: last }, (_, i) => (
              <rect
                key={i}
                className="daily-bar"
                x={PAD_L + i * step + 0.5}
                y={y(rolling[i]!)}
                width={Math.max(1, step - 1)}
                height={y(0) - y(rolling[i]!)}
                fill={color.ember[2]}
              />
            ))
          )}
          {picked !== null && (
            <line
              x1={x(picked)}
              x2={x(picked)}
              y1={PAD_T}
              y2={PAD_T + plotH}
              stroke={color.teal}
              strokeWidth="1.5"
            />
          )}
          <line
            x1={PAD_L}
            x2={PAD_L + n * step}
            y1={y(0) + 0.5}
            y2={y(0) + 0.5}
            stroke={color.ink}
            strokeOpacity="0.3"
          />
          {[1, 10, 20, n].map((d) => (
            <text
              key={d}
              x={x(d)}
              y={H - 4}
              fontSize="10"
              textAnchor={d === 1 ? 'start' : d === n ? 'end' : 'middle'}
              fill={color.inkMuted}
            >
              {d}
            </text>
          ))}
        </svg>
      </figure>
      <p className="caption daily-readout" aria-live="polite">
        {readout}
      </p>
      <p className="caption">
        Single days jump with clouds and satellite passes, so this shows a running total or a{' '}
        {ROLLING_DAYS}-day sum. The month is still compared with other months as a whole.
      </p>
    </section>
  );
}
