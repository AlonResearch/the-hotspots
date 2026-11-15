/** What to do (demo): steps for the months before the risky month, by simple rules. */
import { monthName } from '../../../data/months';
import { useInsight } from '../../../insight/useInsight';
import type { SectionProps } from '../../registry';
import { DemoPlaces } from './DemoPlaces';

export default function ActionsSection({ data, mode }: SectionProps) {
  const insight = useInsight(data);
  if (!insight) return <DemoPlaces />;
  const { region, month, level, actions } = insight;
  return (
    <div className="insight" data-region={region.id} data-level={level}>
      <p className="summary-sentence">
        <strong>Before {monthName(month)}.</strong>{' '}
        {actions.length === 0
          ? `Nothing special to do around ${region.name}: the risk is low.`
          : `What lowers the risk around ${region.name}:`}
      </p>
      <ol className="insight-list insight-actions">
        {actions.map((a) => (
          <li key={a.rule + a.when}>
            <span className="insight-when">{monthName(a.when)}</span>
            <span>
              <strong>{a.who}.</strong> {a.text}
              {mode === 'sci' && <span className="caption"> (rule: {a.rule})</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="caption">Suggestions to support a decision. They do not replace local rules.</p>
    </div>
  );
}
