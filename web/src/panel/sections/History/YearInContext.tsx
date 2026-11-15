/**
 * Year in context (plan 8.7.3): 12 bars for the selected year over a band from p_low
 * to p_high and a line at the normal, for each calendar month (baseline years).
 */
import { MONTH_NAMES } from '../../../data/months';
import type { CalendarMonthStats, MonthResult } from '../../../stats/history';
import { formatValue } from '../../../stats/wording';
import { color } from '../../../styles/tokens';

interface Props {
  year: number;
  results: MonthResult[];
  values: ArrayLike<number>;
  perMonth: CalendarMonthStats[];
  selectedMonth: number;
  onSelect: (t: number) => void;
  /** Percentiles of the band, from the manifest. */
  band: { low: number; high: number };
}

const W = 340;
const H = 120;
const PAD_B = 16;
const PAD_T = 8;

export function YearInContext({
  year,
  results,
  values,
  perMonth,
  selectedMonth,
  onSelect,
  band,
}: Props) {
  const months = Array.from({ length: 12 }, (_, i) =>
    results.find((r) => r.year === year && r.calendarMonth === i + 1),
  );
  const vals = months.map((r) => (r ? (values[r.t] ?? 0) : 0));
  const max = Math.max(
    1e-9,
    ...vals,
    ...perMonth.map((p) => p.p_high),
    ...perMonth.map((p) => p.median),
  );
  const plotH = H - PAD_B - PAD_T;
  const y = (v: number) => PAD_T + plotH - Math.sqrt(Math.max(0, v) / max) * plotH;
  const bw = W / 12;
  const summary = months
    .map((r, i) =>
      r
        ? `${MONTH_NAMES[i]}: ${formatValue(vals[i]!, r.status === 'estimated')}, usual range ${formatValue(perMonth[i]!.p_low)} to ${formatValue(perMonth[i]!.p_high)}`
        : null,
    )
    .filter(Boolean)
    .join('. ');

  return (
    <figure className="year-context">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${year} against the usual range. ${summary}.`}
      >
        {perMonth.map((p, i) => (
          <g key={i}>
            <rect
              x={i * bw + 2}
              width={bw - 4}
              y={y(p.p_high)}
              height={Math.max(0, y(p.p_low) - y(p.p_high))}
              fill={color.ink}
              fillOpacity="0.1"
            />
            <line
              x1={i * bw + 2}
              x2={(i + 1) * bw - 2}
              y1={y(p.median)}
              y2={y(p.median)}
              stroke={color.ink}
              strokeWidth="1.5"
            />
          </g>
        ))}
        {months.map((r, i) =>
          r ? (
            <rect
              key={i}
              x={i * bw + bw * 0.3}
              width={bw * 0.4}
              y={y(vals[i]!)}
              height={PAD_T + plotH - y(vals[i]!)}
              fill={r.classification.unusual ? color.ember[4] : color.ember[2]}
              stroke={i + 1 === selectedMonth ? color.teal : 'none'}
              strokeWidth="2"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(r.t)}
            />
          ) : null,
        )}
        {MONTH_NAMES.map((m, i) => (
          <text
            key={m}
            x={i * bw + bw / 2}
            y={H - 3}
            textAnchor="middle"
            fontSize="10"
            fill={color.inkMuted}
          >
            {m.slice(0, 1)}
          </text>
        ))}
      </svg>
      <figcaption className="caption">
        Bars: {year}. Grey band: {band.low}th to {band.high}th percentile of the baseline years.
        Line: the usual value (median).
      </figcaption>
    </figure>
  );
}
