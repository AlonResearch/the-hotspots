/** Confidence level of a value (D27): a small marker, the plain line, and the "How to read" note. */
import { useState } from 'react';
import '../styles/confidence.css';
import { useData } from '../state/store';
import {
  CONFIDENCE_GUIDE,
  confidenceNote,
  type Confidence,
  type ConfidenceLevel,
} from '../stats/confidence';
import { formatValue } from '../stats/wording';

const LABEL: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export function ConfidenceMarker({ level }: { level: ConfidenceLevel }) {
  return <span className={`confidence confidence-${level}`}>{LABEL[level]}</span>;
}

const SCALE_WORDS: Record<string, string> = {
  res6: 'Res 6 cell, about 36 km²',
  res5: 'Res 5 cell (7 res 6), about 250 km²',
  res4: 'Res 4 cell (49 res 6), about 1,800 km²',
  region: 'Res 1 region, about 609,000 km²',
};

/** One line per level; scientific mode adds the leave-one-year-out numbers behind them. */
export function ConfidenceGuide({ mode }: { mode: 'simple' | 'sci' }) {
  const { method } = useData();
  const rows = (method?.loyo ?? []).filter(
    (r) => r.scale in SCALE_WORDS && r.zero_pred_share !== undefined,
  );
  return (
    <div className="confidence-guide">
      <ul>
        {CONFIDENCE_GUIDE.map((g) => (
          <li key={g.level}>
            <ConfidenceMarker level={g.level} /> {g.text}
          </li>
        ))}
      </ul>
      {mode === 'sci' && rows.length > 0 && (
        <table className="data-table">
          <caption className="caption">
            Leave one year out against S-NPP, 2012 to 2019 (Whitepaper Table 2). Missed: MODIS saw
            nothing, VIIRS saw fire. 75th percentiles over months with activity.
          </caption>
          <thead>
            <tr>
              <th scope="col">Unit</th>
              <th scope="col">Missed</th>
              <th scope="col">p75 estimated / seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.scale}>
                <th scope="row">{SCALE_WORDS[r.scale]}</th>
                <td>{Math.round((r.zero_pred_share ?? 0) * 100)}%</td>
                <td>
                  {formatValue(r.p75_pred ?? 0)} / {formatValue(r.p75_obs ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Marker and plain line under a value, with the guide behind a "How to read" button. */
export function ConfidenceNote({
  confidence,
  mode,
}: {
  confidence: Confidence;
  mode: 'simple' | 'sci';
}) {
  const [open, setOpen] = useState(false);
  const note = confidenceNote(confidence.reason);
  if (!note) return null;
  return (
    <div className="confidence-note" data-confidence={confidence.level}>
      <p className="caption">
        <ConfidenceMarker level={confidence.level} /> {note}
      </p>
      <button
        type="button"
        className="link-button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        How to read
      </button>
      {open && <ConfidenceGuide mode={mode} />}
    </div>
  );
}
