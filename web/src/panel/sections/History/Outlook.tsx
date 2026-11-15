/**
 * The outlook inside the History section: the sentence for a selected forecast month, the
 * forecast months as greyed bars over the place's usual range, and, in scientific mode, the
 * quantiles, the model and its held-out test results.
 */
import { addMonths, MONTH_NAMES, monthLabel, monthName, parseMonth } from '../../../data/months';
import type { ForecastManifest } from '../../../data/forecast';
import {
  FORECAST_OPACITY,
  forecastCsv,
  forecastTint,
  outlookSentence,
  type PlaceForecast,
} from '../../../stats/forecast';
import { formatValue } from '../../../stats/wording';
import { color } from '../../../styles/tokens';
import { StatusMarker } from '../../../ui/StatusMarker';

export const NOT_WEATHER =
  'A forecast from past fire seasons, not a weather forecast. It cannot see a dry or a wet year coming.';

interface SummaryProps {
  forecast: PlaceForecast;
  k: number;
  mode: 'simple' | 'sci';
  /** The record month to go back to. */
  backTo: string;
  onBack: () => void;
}

/** Replaces the month sentence while a forecast month is selected. */
export function OutlookSummary({ forecast: f, k, mode, backTo, onBack }: SummaryProps) {
  const month = addMonths(f.start, k);
  const M = monthName(parseMonth(month).month);
  return (
    <div className="summary is-forecast" data-outlook={month}>
      <p className="summary-sentence">
        <strong>{monthLabel(month)}.</strong> {outlookSentence(f, k)}{' '}
        <StatusMarker kind="forecast" />
      </p>
      {mode === 'sci' ? (
        <p className="caption">
          Median forecast {formatValue(f.p50[k]!)} active cell-days, 10% to 90% range{' '}
          {formatValue(f.p10[k]!)} to {formatValue(f.p90[k]!)}. Usual for {M} (median of the
          baseline years): {formatValue(f.usual[k]!)}, range {formatValue(f.usualLow[k]!)} to{' '}
          {formatValue(f.usualHigh[k]!)}.
        </p>
      ) : (
        f.p90[k]! >= 0.05 && (
          <p className="caption">
            Likely between {formatValue(f.p10[k]!)} and {formatValue(f.p90[k]!)}. The usual for {M}{' '}
            here is {formatValue(f.usual[k]!)}.
          </p>
        )
      )}
      <p className="caption">{NOT_WEATHER}</p>
      <button type="button" className="link-button" onClick={onBack}>
        Back to {monthLabel(backTo)}
      </button>
    </div>
  );
}

const W = 340;
const H = 120;
const PAD_B = 16;
const PAD_T = 8;

interface BlockProps {
  forecast: PlaceForecast;
  model: ForecastManifest;
  mode: 'simple' | 'sci';
  selected: number;
  onSelect: (k: number) => void;
  /** Lines for the top of the CSV (place, area, method). */
  csvHeader: string[];
  csvName: string;
  band: { low: number; high: number };
}

export function OutlookBlock({
  forecast: f,
  model,
  mode,
  selected,
  onSelect,
  csvHeader,
  csvName,
  band,
}: BlockProps) {
  const months = Array.from({ length: f.n }, (_, k) => addMonths(f.start, k));
  const first = parseMonth(months[0]!);
  const last = parseMonth(months[f.n - 1]!);
  const span = first.year === last.year ? `${first.year}` : `${first.year} to ${last.year}`;
  const sci = mode === 'sci';
  let max = 1e-9;
  for (let k = 0; k < f.n; k++) {
    max = Math.max(max, f.p50[k]!, f.usualHigh[k]!, f.usual[k]!, sci ? f.p90[k]! : 0);
  }
  const plotH = H - PAD_B - PAD_T;
  const y = (v: number) => PAD_T + plotH - Math.sqrt(Math.max(0, v) / max) * plotH;
  const bw = W / f.n;
  const total = Array.from(f.p50).reduce((a, b) => a + b, 0);
  const summary = months
    .map(
      (m, k) =>
        `${monthLabel(m)}: about ${formatValue(f.p50[k]!)}, usual ${formatValue(f.usual[k]!)}`,
    )
    .join('. ');

  const download = () => {
    const blob = new Blob([forecastCsv(f, csvHeader)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="outlook">
      <h4 className="sub">
        Forecast for {span} <StatusMarker kind="forecast" />
      </h4>
      <figure className="year-context outlook-chart">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`Forecast for ${span} against the usual range. ${summary}.`}
        >
          {months.map((m, k) => (
            <g key={m}>
              <rect
                x={k * bw + 2}
                width={bw - 4}
                y={y(f.usualHigh[k]!)}
                height={Math.max(0, y(f.usualLow[k]!) - y(f.usualHigh[k]!))}
                fill={color.ink}
                fillOpacity="0.1"
              />
              <line
                x1={k * bw + 2}
                x2={(k + 1) * bw - 2}
                y1={y(f.usual[k]!)}
                y2={y(f.usual[k]!)}
                stroke={color.ink}
                strokeWidth="1.5"
              />
              <rect
                className="forecast-bar"
                data-forecast-month={m}
                x={k * bw + bw * 0.3}
                width={bw * 0.4}
                y={y(f.p50[k]!)}
                height={PAD_T + plotH - y(f.p50[k]!)}
                fill={forecastTint(color.ember[2])}
                fillOpacity={FORECAST_OPACITY}
                stroke={k === selected ? color.teal : color.ink}
                strokeOpacity={k === selected ? 1 : 0.4}
                strokeWidth={k === selected ? 2 : 1}
                strokeDasharray={k === selected ? undefined : '2 2'}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(k)}
              />
              {sci && (
                <line
                  x1={k * bw + bw / 2}
                  x2={k * bw + bw / 2}
                  y1={y(f.p10[k]!)}
                  y2={y(f.p90[k]!)}
                  stroke={color.ink}
                  strokeOpacity="0.6"
                />
              )}
              <text
                x={k * bw + bw / 2}
                y={H - 3}
                textAnchor="middle"
                fontSize="10"
                fill={color.inkMuted}
              >
                {MONTH_NAMES[parseMonth(m).month - 1]!.slice(0, 1)}
              </text>
            </g>
          ))}
        </svg>
        <figcaption className="caption">
          Grey bars: forecast, about {formatValue(total)} active cell-days over the {f.n} months.
          Grey band: {band.low}th to {band.high}th percentile of the baseline years. Line: the usual
          value (median).{sci ? ' Thin line: 10% to 90% range of the forecast.' : ''} {NOT_WEATHER}
        </figcaption>
      </figure>
      {sci && (
        <div className="outlook-sci">
          <table className="data-table">
            <caption>Forecast by month (active cell-days)</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">10%</th>
                <th scope="col">Median</th>
                <th scope="col">90%</th>
                <th scope="col">Usual</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, k) => (
                <tr key={m} aria-current={k === selected ? 'true' : undefined}>
                  <th scope="row">{monthLabel(m)}</th>
                  <td className="num">{formatValue(f.p10[k]!)}</td>
                  <td className="num">{formatValue(f.p50[k]!)}</td>
                  <td className="num">{formatValue(f.p90[k]!)}</td>
                  <td className="num">{formatValue(f.usual[k]!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4 className="sub">How the forecast is made</h4>
          <ul className="outlook-notes caption">
            <li>
              Model: {model.model.name}. Input: {model.model.sensor}. Data through{' '}
              {model.model.trained_through}.
            </li>
            <li>
              This place: {f.areas.toLocaleString('en-GB')} forecast{' '}
              {f.areas === 1 ? 'area' : 'areas'} of about 1,800 km²
              {f.partAreas > 0
                ? `, ${f.partAreas.toLocaleString('en-GB')} covered only in part. A part takes the share of the area's activity it had in the same calendar month of the baseline years.`
                : ', each covered completely.'}
            </li>
            <li>
              The range is the sum of the area ranges. For a place over several areas it is wider
              than the true range, and the sum of medians runs low.
            </li>
            {model.model.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {model.skill.length > 0 && (
            <table className="data-table">
              <caption>Test on years the model did not see (per res 4 area and month)</caption>
              <tbody>
                {model.skill.map((s) => (
                  <tr key={s.label}>
                    <th scope="row">{s.label}</th>
                    <td>{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" className="button" onClick={download}>
            Download forecast CSV
          </button>
        </div>
      )}
    </div>
  );
}
