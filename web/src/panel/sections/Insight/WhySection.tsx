/** Why (demo): the main drivers of fire risk for the place and month, in plain words. */
import { monthName } from '../../../data/months';
import { LEVEL_WORDS } from '../../../insight/demo';
import { useInsight } from '../../../insight/useInsight';
import type { SectionProps } from '../../registry';
import { DemoPlaces } from './DemoPlaces';

export default function WhySection({ data, mode }: SectionProps) {
  const insight = useInsight(data);
  if (!insight) return <DemoPlaces />;
  const { region, month, level, drivers } = insight;
  return (
    <div className="insight" data-region={region.id} data-level={level}>
      <p className="summary-sentence">
        <strong>{monthName(month)}.</strong> {LEVEL_WORDS[level]} fire risk around {region.name}.
      </p>
      <p className="caption">{region.character}</p>
      <ul className="insight-list">
        {drivers.map((d) => (
          <li key={d.key} className={d.raises ? 'raises' : 'lowers'}>
            <span className="insight-mark" aria-hidden="true">
              {d.raises ? '▲' : '▽'}
            </span>
            <span>
              <strong>{d.title}.</strong> {d.text}
              {mode === 'sci' && <span className="caption"> ({d.value}, demo value)</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="caption">
        ▲ raises the risk, ▽ lowers it. Pick a forecast month on the calendar or the time strip to
        see another month.
      </p>
    </div>
  );
}
