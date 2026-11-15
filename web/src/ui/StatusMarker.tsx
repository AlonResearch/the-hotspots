import type { MonthStatusValue } from '../data/contract';

export type MarkerKind =
  Exclude<MonthStatusValue, 'observed'> | 'partial' | 'fixture' | 'demo' | 'forecast';

const WORDS: Record<MarkerKind, string> = {
  estimated: 'Estimated',
  provisional: 'Provisional',
  partial: 'Partial',
  fixture: 'Fixture data',
  demo: 'Demo',
  forecast: 'Forecast',
};

const TITLES: Record<MarkerKind, string> = {
  estimated: 'Before VIIRS: converted from MODIS to VIIRS-equivalent values, with a band',
  provisional: 'Recent months from near real-time data. Values can still change',
  partial: 'The month is not complete yet',
  fixture: 'Simulated data for development, not real observations',
  demo: 'Demonstration content',
  forecast: 'From the prediction model, made from past fire seasons. Not an observation',
};

/** The one small status word next to a number (plan 7.3). Never colour alone. */
export function StatusMarker({ kind }: { kind: MarkerKind | 'observed' | null | undefined }) {
  if (!kind || kind === 'observed') return null;
  return (
    <span className={`status status-${kind}`} title={TITLES[kind]}>
      {WORDS[kind]}
    </span>
  );
}
