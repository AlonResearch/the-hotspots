/** Per-cell contributions list (plan 6.6 and 8.7.6). Rows fly the map to their cell. */
import { cellToLatLng } from 'h3-js';
import { monthLabel } from '../../../data/months';
import { useApp } from '../../../state/store';
import { contributionSentence, type Contributions } from '../../../stats/contributions';
import { cellDays } from '../../../stats/wording';

interface Props {
  c: Contributions | null;
  month: string;
  cellCount: number;
}

export function ContributionsList({ c, month, cellCount }: Props) {
  const show = useApp((s) => s.showContributions);
  const setShow = useApp((s) => s.setShowContributions);
  const flyTo = useApp((s) => s.flyTo);
  const zoom = useApp((s) => s.view.zoom);

  if (cellCount < 2) return null;
  if (!c) {
    return <p className="muted">No activity in {monthLabel(month)}, so no cell contributes.</p>;
  }
  return (
    <div className="contributions">
      <p>{contributionSentence(c, monthLabel(month))}</p>
      <ol className="contrib-list">
        {c.top.map((r) => (
          <li key={r.cell}>
            <button
              type="button"
              className="contrib-row"
              data-share={r.share}
              onClick={() => {
                const [lat, lon] = cellToLatLng(r.cell);
                flyTo({ center: [lon, lat], zoom: Math.max(zoom, 10) });
              }}
            >
              <span className="contrib-share num">{Math.round(r.share * 100)}%</span>
              <span>
                {cellDays(r.value)}. {r.where}.
                {r.partlyOutside && <span className="caption"> Partly outside your shape.</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {c.rows.length > c.top.length && (
        <p className="contrib-rest" data-share={1 - c.topShare}>
          <span className="contrib-share num">{Math.round((1 - c.topShare) * 100)}%</span>
          <span>
            Other {c.rows.length - c.top.length} active{' '}
            {c.rows.length - c.top.length === 1 ? 'cell' : 'cells'}
          </span>
        </p>
      )}
      <button type="button" className="link-button" onClick={() => setShow(!show)}>
        {show ? 'Show activity' : 'Show shares on the map'}
      </button>
    </div>
  );
}
