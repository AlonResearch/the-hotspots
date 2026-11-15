/** Seam check lines (plan 6.7): a description of the step across each seam, not a test. */
import { useMemo } from 'react';
import { monthToIndex } from '../../../data/months';
import { useData } from '../../../state/store';
import { statsConfig } from '../../../stats/config';
import { seamChecks } from '../../../stats/seam';
import { rawSeries, type Series } from '../../../stats/series';

const x = (v: number | null) =>
  v === null ? 'not enough months on both sides' : `×${v.toFixed(2)}`;

export function SeamCheckList({ series }: { series: Series }) {
  const { manifest } = useData();
  const checks = useMemo(() => {
    const start = manifest.record.start;
    const raw = rawSeries(series, monthToIndex(start, manifest.first_reference_month));
    return seamChecks(
      manifest.seams,
      (m) => monthToIndex(start, m),
      raw,
      series.h,
      statsConfig.seamWindow,
    );
  }, [series, manifest]);

  return (
    <div className="seam-check">
      <ul>
        {checks.map((c) => (
          <li key={c.month} data-seam={c.month} data-raw={c.raw ?? ''} data-h={c.harmonized ?? ''}>
            <strong>{c.label}</strong> ({c.month}). Raw: {x(c.raw)}. Harmonized: {x(c.harmonized)}.
          </li>
        ))}
      </ul>
      <p className="caption">
        Mean of the {statsConfig.seamWindow} months after each seam over the mean of the{' '}
        {statsConfig.seamWindow} months before. A description, not a test: real fire activity also
        changes between the two windows. Raw is MODIS before {manifest.first_reference_month} and
        VIIRS from then on.
      </p>
    </div>
  );
}
