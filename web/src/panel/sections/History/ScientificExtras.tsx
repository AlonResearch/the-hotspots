/**
 * Scientific mode extras of the History section (plan 8.7.7 to 8.7.12): sensor table,
 * seam check, baseline detail, provenance, method tables and CSV download.
 */
import { cellToParent } from 'h3-js';
import { useMemo } from 'react';
import { SAT_KEYS, type SatKey } from '../../../data/contract';
import { CONTRACT_VERSION } from '../../../data/contract';
import { monthLabel } from '../../../data/months';
import type { Place } from '../../../grid/place';
import { encodePlace } from '../../../state/url';
import { useData, type PlaceData } from '../../../state/store';
import { placeCsv } from '../../../stats/csv';
import type { MonthResult } from '../../../stats/history';
import { formatValue } from '../../../stats/wording';
import { formatDate } from '../../../ui/format';
import { StatusMarker } from '../../../ui/StatusMarker';
import { placeTitle } from '../../placeText';
import { SeamCheckList } from './SeamCheck';

const SAT_NAMES: Record<SatKey, string> = {
  terra: 'Terra (MODIS)',
  aqua: 'Aqua (MODIS)',
  snpp: 'S-NPP (VIIRS)',
  noaa20: 'NOAA-20 (VIIRS)',
  noaa21: 'NOAA-21 (VIIRS)',
};

interface Props {
  place: Place;
  data: PlaceData;
  result: MonthResult;
  results: MonthResult[];
}

export function ScientificExtras({ place, data, result: r, results }: Props) {
  const { manifest, method } = useData();
  const s = data.series!;
  const t = r.t;
  const issues = manifest.known_issues.filter((k) => k.from <= r.month && r.month <= k.to);

  const regions = useMemo(() => {
    const set = new Set<string>(['global']);
    for (const c of data.cells) {
      set.add(cellToParent(c, 1));
      set.add(cellToParent(c, 0));
    }
    return set;
  }, [data.cells]);
  const ratioRows = (method?.ratios ?? []).filter((row) => regions.has(row.region));

  const download = () => {
    const csv = placeCsv(s, results, {
      place: placeTitle(place),
      definition: encodePlace(place),
      areaKm2: data.areaKm2,
      cells: data.cells.length,
      methodVersion: manifest.method.version,
      dataThrough: manifest.data_through,
      source: manifest.source,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = placeTitle(place)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    a.href = url;
    a.download = `hotspots-${slug || 'place'}-${manifest.data_through}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const b = r.baseline;
  return (
    <div className="sci-extras">
      <h4 className="sub">Sensors, {monthLabel(r.month)}</h4>
      <table className="data-table">
        <tbody>
          <tr>
            <th scope="row">Harmonized ({manifest.method.reference})</th>
            <td className="num">
              {formatValue(s.h[t]!)}
              {s.hi[t]! > s.lo[t]! && (
                <span className="caption">
                  {' '}
                  (band {formatValue(s.lo[t]!)} to {formatValue(s.hi[t]!)})
                </span>
              )}
            </td>
          </tr>
          <tr>
            <th scope="row">Raw MODIS group</th>
            <td className="num">{formatValue(s.modis[t]!)}</td>
          </tr>
          <tr>
            <th scope="row">Raw VIIRS group</th>
            <td className="num">{formatValue(s.viirs[t]!)}</td>
          </tr>
          {SAT_KEYS.filter((k) => s.sat[k]).map((k) => (
            <tr key={k}>
              <th scope="row">{SAT_NAMES[k]}</th>
              <td className="num">{formatValue(s.sat[k]![t]!)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Status</th>
            <td>
              {r.partial ? (
                <StatusMarker kind="partial" />
              ) : r.status === 'observed' ? (
                'Observed'
              ) : (
                <StatusMarker kind={r.status} />
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="caption">Active cell-days in the month, summed over the analysis area.</p>

      <h4 className="sub">Seam check</h4>
      <SeamCheckList series={s} />

      <h4 className="sub">Baseline</h4>
      <p className="baseline-line">
        Baseline {manifest.baseline.start_year} to {manifest.baseline.end_year},{' '}
        {manifest.method.reference}, {b.n} years
        {manifest.baseline.exclude_target_year ? ` (${r.year} left out)` : ''}.
      </p>
      <table className="data-table">
        <tbody>
          <tr>
            <th scope="row">Normal (median)</th>
            <td className="num">{formatValue(b.normal)}</td>
          </tr>
          <tr>
            <th scope="row">{manifest.classes.p_low}th percentile</th>
            <td className="num">{formatValue(b.p_low)}</td>
          </tr>
          <tr>
            <th scope="row">{manifest.classes.p_high}th percentile</th>
            <td className="num">{formatValue(b.p_high)}</td>
          </tr>
          <tr>
            <th scope="row">{manifest.classes.p_very_high}th percentile</th>
            <td className="num">{formatValue(b.p_very_high)}</td>
          </tr>
          <tr>
            <th scope="row">Years with activity</th>
            <td className="num">
              {b.years_active} of {b.n}
            </td>
          </tr>
          <tr>
            <th scope="row">Class</th>
            <td>
              <code>{r.classification.cls}</code>
              {r.classification.ratio !== null &&
                ` (×${r.classification.ratio.toFixed(2)} the normal)`}
            </td>
          </tr>
        </tbody>
      </table>

      <h4 className="sub">Provenance</h4>
      <ul className="provenance">
        <li>Method version: {manifest.method.version}</li>
        <li>Reference: {manifest.method.reference}</li>
        <li>Transfer: {manifest.method.transfer}</li>
        <li>VIIRS group: {manifest.method.viirs_group}</li>
        <li>Filters: {manifest.method.filters}</li>
        {(manifest.method.notes ?? []).map((n) => (
          <li key={n}>{n}</li>
        ))}
        <li>
          Data through {formatDate(manifest.data_through)}. Source: {manifest.source}. Built{' '}
          {manifest.built_at}. Contract version {CONTRACT_VERSION}.
        </li>
      </ul>
      {issues.length > 0 && (
        <div className="notice-inline" role="note">
          <p>Known issues in {monthLabel(r.month)}:</p>
          <ul>
            {issues.map((k) => (
              <li key={`${k.from}-${k.note}`}>
                {k.note}
                {k.satellite ? ` (${SAT_NAMES[k.satellite]})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {method && (
        <>
          <h4 className="sub">Method tables</h4>
          {ratioRows.length > 0 ? (
            <table className="data-table">
              <caption className="caption">Transfer ratios for this place&apos;s regions</caption>
              <thead>
                <tr>
                  <th scope="col">Season</th>
                  <th scope="col">Ratio</th>
                  <th scope="col">Band</th>
                  <th scope="col">Years</th>
                </tr>
              </thead>
              <tbody>
                {ratioRows.map((row) => (
                  <tr key={`${row.region}-${row.season}`}>
                    <td>{row.season}</td>
                    <td className="num">{row.ratio.toFixed(2)}</td>
                    <td className="num">
                      {row.lo.toFixed(2)} to {row.hi.toFixed(2)}
                    </td>
                    <td className="num">{row.n_years}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No ratio rows for this place&apos;s regions.</p>
          )}
          {method.loyo.length > 0 && (
            <table className="data-table">
              <caption className="caption">
                Leave-one-year-out error by size of area (bias = predicted over observed sum)
              </caption>
              <thead>
                <tr>
                  <th scope="col">Scale</th>
                  <th scope="col">Bias</th>
                  <th scope="col">Mean abs. error</th>
                  <th scope="col">n</th>
                </tr>
              </thead>
              <tbody>
                {method.loyo.map((row) => (
                  <tr key={row.scale}>
                    <td>{row.scale}</td>
                    <td className="num">{row.bias.toFixed(3)}</td>
                    <td className="num">{row.mae.toFixed(2)}</td>
                    <td className="num">{row.n.toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <h4 className="sub">Download</h4>
      <button type="button" className="button" onClick={download}>
        Download CSV
      </button>
    </div>
  );
}
