import { DEMO_REGIONS } from '../../../insight/demo';
import { choosePoint } from '../../../ui/placeActions';

/** Shown where the demo has no values: the places that do. */
export function DemoPlaces() {
  return (
    <div className="insight">
      <p className="caption">
        This demo has insight for four places in Italy. Choose one to see how it works:
      </p>
      <ul className="insight-places">
        {DEMO_REGIONS.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="link-button"
              onClick={() => choosePoint(r.lat, r.lon, `${r.name}, Italy`)}
            >
              {r.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
