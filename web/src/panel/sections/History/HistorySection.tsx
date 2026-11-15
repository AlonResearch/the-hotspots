/**
 * History section (plan 8.7): summary sentence, calendar, year in context, typical
 * months and record summary, unusual months, contributions, and the scientific extras.
 */
import { useEffect, useMemo, useState } from 'react';
import { forecastIndex } from '../../../data/forecast';
import { addMonths, latestCompleteMonth, monthLabel, monthToIndex } from '../../../data/months';
import { usePlaceContributions } from '../../../state/contributions';
import { useApp, useData } from '../../../state/store';
import { encodePlace } from '../../../state/url';
import { outlookSentence, outlookText } from '../../../stats/forecast';
import { recordSummary, typicalMonths, unusualMonths } from '../../../stats/history';
import { statsConfig } from '../../../stats/config';
import { monthResults } from '../../../stats/useResults';
import { formatArea } from '../../../stats/wording';
import { ConfidenceNote } from '../../../ui/Confidence';
import { StatusMarker } from '../../../ui/StatusMarker';
import { placeTitle } from '../../placeText';
import type { SectionProps } from '../../registry';
import { Calendar } from './Calendar';
import { DailyCurve } from './DailyCurve';
import { OutlookBlock, OutlookSummary } from './Outlook';
import { ContributionsList } from './ContributionsList';
import { ScientificExtras } from './ScientificExtras';
import { YearInContext } from './YearInContext';

export default function HistorySection({ place, data, month, mode }: SectionProps) {
  const { manifest, forecast: model } = useData();
  const setMonth = useApp((s) => s.setMonth);
  const outlookMonth = useApp((s) => s.outlookMonth);
  const setOutlookMonth = useApp((s) => s.setOutlookMonth);
  const announce = useApp((s) => s.announce);
  const [unitInfo, setUnitInfo] = useState(false);
  const series = data.series!;
  const results = useMemo(() => monthResults(series, manifest), [series, manifest]);
  const typical = useMemo(() => typicalMonths(series, manifest), [series, manifest]);
  const record = useMemo(() => recordSummary(series, manifest), [series, manifest]);
  const unusual = useMemo(() => unusualMonths(results), [results]);
  const contrib = usePlaceContributions();
  const t = Math.max(0, Math.min(results.length - 1, monthToIndex(manifest.record.start, month)));
  const r = results[t]!;
  const area = `${data.cells.length.toLocaleString('en-GB')} cells, about ${formatArea(data.areaKm2)}`;
  const select = (i: number) => {
    const m = results[i]?.month;
    if (m) setMonth(m);
  };

  // The last complete month, shown under a partial month (responder workflow, plan 1.3).
  const lastComplete = r.partial
    ? results[monthToIndex(manifest.record.start, latestCompleteMonth(manifest))]
    : null;

  // The outlook of the place, and the forecast month shown instead of the record month (if any).
  const fc = model ? (data.forecast ?? null) : null;
  const k = fc ? forecastIndex({ start: fc.start, n_months: fc.n }, outlookMonth) : -1;
  const selectForecast = (j: number) => {
    if (fc) setOutlookMonth(addMonths(fc.start, j));
  };
  const said =
    fc && k >= 0 ? `${monthLabel(outlookMonth!)}. Forecast. ${outlookSentence(fc, k)}` : null;

  useEffect(() => {
    announce(`${placeTitle(place)}, ${said ?? `${monthLabel(r.month)}. ${r.sentence}`}`);
  }, [announce, place, r.month, r.sentence, said]);

  return (
    <div className="history">
      {fc && k >= 0 && (
        <OutlookSummary
          forecast={fc}
          k={k}
          mode={mode}
          backTo={r.month}
          onBack={() => setOutlookMonth(null)}
        />
      )}
      {k < 0 && (
        <div
          className="summary"
          data-class={r.classification.cls}
          data-unusual={r.classification.unusual}
          data-confidence={r.confidence.level}
        >
          <p className="summary-sentence">
            <strong>{monthLabel(r.month)}.</strong> {r.sentence}{' '}
            <StatusMarker kind={r.partial ? 'partial' : r.status} />
            {r.classification.unusual && <span className="unusual-marker">Unusual</span>}
          </p>
          <ConfidenceNote confidence={r.confidence} mode={mode} />
          {lastComplete && (
            <p className="caption">
              Last complete month, {monthLabel(lastComplete.month)}: {lastComplete.sentence}
            </p>
          )}
          <p className="caption">Analysis area: {area}.</p>
          {mode === 'simple' && (
            <>
              <button
                type="button"
                className="link-button"
                aria-expanded={unitInfo}
                onClick={() => setUnitInfo((v) => !v)}
              >
                What are active cell-days?
              </button>
              {unitInfo && (
                <p className="caption">
                  The area is split into cells of about 36 km². For each cell, every day with at
                  least one satellite fire detection counts once. Active cell-days are those days
                  added up over the cells of the area. Before 2012 the values are estimated from
                  MODIS and converted to what VIIRS would have seen. For areas under about 1,800 km²
                  that estimate is not reliable, so those months are shown faded.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {k < 0 && <DailyCurve data={data} result={r} />}

      <h4 className="sub">Calendar</h4>
      <Calendar
        results={results}
        values={series.h}
        selected={t}
        onSelect={select}
        forecast={fc}
        selectedForecast={k}
        onSelectForecast={selectForecast}
        forecastLabel={(j) => outlookText(addMonths(fc!.start, j), fc!.p50[j] ?? 0, fc, j, mode)}
      />

      {fc && model && (
        <OutlookBlock
          forecast={fc}
          model={model}
          mode={mode}
          selected={k}
          onSelect={selectForecast}
          band={{ low: manifest.classes.p_low, high: manifest.classes.p_high }}
          csvName={`hotspots-forecast-${fc.start}.csv`}
          csvHeader={[
            `The Hotspots, forecast of monthly active cell-days for ${placeTitle(place)}`,
            `Place definition: ${encodePlace(place)}`,
            `Analysis area: ${data.cells.length} res 6 cells, ${Math.round(data.areaKm2)} km2`,
            `Model: ${model.model.name}. Data through ${model.model.trained_through}. Source: ${model.source}`,
          ]}
        />
      )}

      <h4 className="sub">{r.year} in context</h4>
      <YearInContext
        year={r.year}
        results={results}
        values={series.h}
        perMonth={typical.perMonth}
        selectedMonth={r.calendarMonth}
        onSelect={select}
        band={{ low: manifest.classes.p_low, high: manifest.classes.p_high }}
      />

      <h4 className="sub">Typical months</h4>
      <p className="typical">{typical.sentence}</p>
      <p className="record">{record.sentence}</p>

      <h4 className="sub">Unusual months</h4>
      {unusual.length === 0 ? (
        <p className="muted">No unusual months in the record.</p>
      ) : (
        <>
          <ul className="unusual-list">
            {unusual.slice(0, statsConfig.maxUnusualShown).map((u) => (
              <li key={u.month}>
                <button
                  type="button"
                  className="link-button"
                  aria-current={u.month === r.month ? 'true' : undefined}
                  onClick={() => setMonth(u.month)}
                >
                  {monthLabel(u.month)}
                </button>{' '}
                <span className="caption">{u.sentence}</span>
              </li>
            ))}
          </ul>
          {unusual.length > statsConfig.maxUnusualShown && (
            <p className="caption">
              Showing the {statsConfig.maxUnusualShown} most recent of {unusual.length}.
            </p>
          )}
        </>
      )}
      {data.cells.length > 1 && k < 0 && (
        <>
          <h4 className="sub">Which cells drive {monthLabel(r.month)}</h4>
          <ContributionsList c={contrib} month={r.month} cellCount={data.cells.length} />
        </>
      )}
      {mode === 'sci' && (
        <ScientificExtras place={place} data={data} result={r} results={results} />
      )}
    </div>
  );
}
