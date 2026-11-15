/**
 * Next 12 months: the place's forecast month by month, from the prediction model's res 4 areas
 * (stats/forecast.ts). A tap shows that month everywhere (strip, calendar, map). For the four demo
 * places in Italy it also names the preparation months the demo uses (insight/demo.ts).
 */
import { monthLabel, monthName, parseMonth, addMonths } from '../../data/months';
import { demoRegionAt, peakMonth } from '../../insight/demo';
import { useApp, useData } from '../../state/store';
import { outlookSentence } from '../../stats/forecast';
import { StatusMarker } from '../../ui/StatusMarker';
import type { SectionProps } from '../registry';

export default function OutlookSection({ data }: SectionProps) {
  const { forecast: model } = useData();
  const outlookMonth = useApp((s) => s.outlookMonth);
  const setOutlookMonth = useApp((s) => s.setOutlookMonth);
  const fc = model ? (data.forecast ?? null) : null;
  if (!fc) {
    return <p className="caption">No forecast for this place in this build.</p>;
  }
  let top = 0;
  for (let j = 1; j < fc.n; j++) if ((fc.p50[j] ?? 0) > (fc.p50[top] ?? 0)) top = j;
  const topMonth = addMonths(fc.start, top);
  const any = (fc.p50[top] ?? 0) > 0;
  const region = demoRegionAt(data.centre[0], data.centre[1]);
  const peak = region ? peakMonth(region) : null;
  const prep = peak ? [((peak + 9) % 12) + 1, ((peak + 10) % 12) + 1] : null;

  return (
    <div className="outlook">
      <p className="summary-sentence">
        {any ? (
          <>
            Most activity expected in <strong>{monthLabel(topMonth)}</strong>.
          </>
        ) : (
          'No fire activity expected in the forecast months.'
        )}{' '}
        <StatusMarker kind="forecast" />
      </p>
      <ul className="unusual-list outlook-list">
        {Array.from({ length: fc.n }, (_, j) => {
          const m = addMonths(fc.start, j);
          return (
            <li key={m}>
              <button
                type="button"
                className="link-button"
                aria-current={m === outlookMonth ? 'true' : undefined}
                onClick={() => setOutlookMonth(m)}
              >
                {monthName(parseMonth(m).month)}
              </button>{' '}
              <span className="caption">{outlookSentence(fc, j)}</span>
            </li>
          );
        })}
      </ul>
      {region && prep && (
        <p className="caption">
          <StatusMarker kind="demo" /> Around {region.name}, the demo treats {monthName(peak!)} as
          the riskiest month and {monthName(prep[0]!)} to {monthName(prep[1]!)} as the time to
          prepare. See What to do.
        </p>
      )}
      <p className="caption">
        The model forecasts areas of about 1,800 km²; a smaller place gets its usual share of that
        area. A forecast, not an observation.
      </p>
    </div>
  );
}
