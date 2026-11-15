/**
 * Demo of the Insight Engine (Vision Docs/Insight Engine.md): why fire is likely in a place and
 * what land managers and policy makers can do in the months before the peak.
 *
 * DEMO DATA. The driver values below are hand-written to fit each region's character. They are
 * not measurements and not model output. The rules are plain if/else statements whose thresholds
 * are design choices drawn from the document's candidate classes (section 4.1).
 */
import { monthName } from '../data/months';

export type Land = 'farmland' | 'forest' | 'urban-edge';

export interface DemoRegion {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Places whose centre is within this distance use the region's demo values. */
  radiusKm: number;
  land: Land;
  character: string;
  /** Calendar months (1 to 12) when fire activity is most likely. */
  peak: number[];
  /** Soil moisture against the monthly normal, in percent, January to December. */
  soil: number[];
  /** Fire weather class 1 (low) to 5 (extreme), January to December. */
  fwi: number[];
  /** Understory (ladder) fuel load, 0 to 1. */
  ladder: number;
  /** Typical distance to roads, farms or houses, km. */
  humanKm: number;
  /** Months when crop residue or pasture is usually burned. */
  burnMonths: number[];
}

export const DEMO_REGIONS: readonly DemoRegion[] = [
  {
    id: 'turin',
    name: 'Turin',
    lat: 45.07,
    lon: 7.69,
    radiusKm: 22,
    land: 'urban-edge',
    character: 'City edge against wooded hills, with dry winters and foehn wind.',
    peak: [2, 3],
    soil: [-20, -32, -28, -8, 5, 0, -12, -18, -5, 8, 10, -6],
    fwi: [3, 4, 4, 2, 1, 2, 3, 3, 2, 1, 1, 2],
    ladder: 0.45,
    humanKm: 0.4,
    burnMonths: [2, 3],
  },
  {
    id: 'milan',
    name: 'Milan',
    lat: 45.46,
    lon: 9.19,
    radiusKm: 25,
    land: 'farmland',
    character: 'Flat irrigated farmland around a large city: rice, maize and field margins.',
    peak: [3, 10],
    soil: [-6, -15, -27, -10, 4, 2, -8, -14, -12, -26, 5, 0],
    fwi: [2, 2, 3, 2, 1, 2, 3, 3, 2, 3, 1, 1],
    ladder: 0.1,
    humanKm: 0.3,
    burnMonths: [3, 10],
  },
  {
    id: 'monte-barone',
    name: 'Monte Barone',
    lat: 45.72,
    lon: 8.2,
    radiusKm: 15,
    land: 'forest',
    character: 'Steep beech and chestnut slopes with dry leaf litter in late winter.',
    peak: [3, 4],
    soil: [-18, -26, -34, -29, -6, 4, -5, -12, -4, 6, 8, -8],
    fwi: [3, 3, 4, 4, 2, 1, 2, 3, 2, 1, 1, 2],
    ladder: 0.75,
    humanKm: 3.5,
    burnMonths: [3],
  },
  {
    id: 'foggia',
    name: 'Foggia',
    lat: 41.46,
    lon: 15.54,
    radiusKm: 45,
    land: 'farmland',
    character: 'The Tavoliere wheat plain: stubble after the June harvest, hot dry summers.',
    peak: [7, 8],
    soil: [6, 4, 0, -6, -14, -30, -42, -45, -28, -10, 2, 6],
    fwi: [1, 1, 2, 2, 3, 4, 5, 5, 4, 2, 1, 1],
    ladder: 0.05,
    humanKm: 0.6,
    burnMonths: [7, 8],
  },
];

function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const x = (lon2 - lon1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const y = (lat2 - lat1) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** The demo region a place centre falls in, or null. */
export function demoRegionAt(lat: number, lon: number): DemoRegion | null {
  let best: DemoRegion | null = null;
  let bestKm = Infinity;
  for (const r of DEMO_REGIONS) {
    const d = km(lat, lon, r.lat, r.lon);
    if (d <= r.radiusKm && d < bestKm) {
      best = r;
      bestKm = d;
    }
  }
  return best;
}

export type Level = 'low' | 'elevated' | 'high';

/** Thresholds of the demo rules. Design choices, not literature values. */
export const RULES = {
  drySoil: -25,
  ratherDrySoil: -12,
  highFireWeather: 4,
  calmFireWeather: 2,
  heavyLadderFuel: 0.6,
  someLadderFuel: 0.4,
  nearPeople: 1,
} as const;

export interface Driver {
  key: 'soil' | 'weather' | 'fuel' | 'people';
  title: string;
  text: string;
  /** The number behind the sentence, for scientific mode. */
  value: string;
  raises: boolean;
}

export interface Action {
  /** Calendar month to act in. */
  when: number;
  who: 'Land managers' | 'Policy makers';
  text: string;
  /** Candidate class of the Insight Engine document (section 4.1). */
  rule: string;
}

export interface Insight {
  region: DemoRegion;
  month: number;
  level: Level;
  drivers: Driver[];
  actions: Action[];
}

const before = (m: number, n: number) => ((m - 1 - n + 12) % 12) + 1;

/** The first peak month of a region: the month the advice leads up to. */
export function peakMonth(r: DemoRegion): number {
  return r.peak[0]!;
}

export function insightFor(r: DemoRegion, month: number): Insight {
  const soil = r.soil[month - 1]!;
  const fwi = r.fwi[month - 1]!;
  const M = monthName(month);
  const burning = r.burnMonths.includes(month);

  const drivers: Driver[] = [];
  if (soil <= RULES.drySoil) {
    drivers.push({
      key: 'soil',
      title: 'Very dry soil',
      text: `The ground is usually much drier than normal in ${M}, so a small fire spreads easily.`,
      value: `soil moisture ${soil}% against the monthly normal`,
      raises: true,
    });
  } else if (soil <= RULES.ratherDrySoil) {
    drivers.push({
      key: 'soil',
      title: 'Dry soil',
      text: `The ground is drier than normal in ${M}.`,
      value: `soil moisture ${soil}% against the monthly normal`,
      raises: true,
    });
  } else {
    drivers.push({
      key: 'soil',
      title: 'Moist soil',
      text: `The ground holds its usual moisture in ${M}, which slows a fire down.`,
      value: `soil moisture ${soil >= 0 ? '+' : ''}${soil}% against the monthly normal`,
      raises: false,
    });
  }
  if (fwi >= RULES.highFireWeather) {
    drivers.push({
      key: 'weather',
      title: 'Fire weather',
      text:
        r.land === 'farmland' && month >= 6 && month <= 9
          ? 'Heat, low humidity and afternoon wind are the rule.'
          : 'Dry wind and low humidity are common.',
      value: `fire weather class ${fwi} of 5`,
      raises: true,
    });
  } else {
    drivers.push({
      key: 'weather',
      title: fwi <= RULES.calmFireWeather ? 'Calm, humid weather' : 'Moderate fire weather',
      text:
        fwi <= RULES.calmFireWeather
          ? 'The weather rarely helps a fire to spread.'
          : 'Some dry and windy days, not the rule.',
      value: `fire weather class ${fwi} of 5`,
      raises: false,
    });
  }
  if (r.land === 'farmland') {
    drivers.push({
      key: 'fuel',
      title: burning ? 'Crop residue on the fields' : 'Little fuel on the fields',
      text: burning
        ? 'Stubble and field margins are dry, and this is when they are usually burned.'
        : 'Crops are green or the fields are bare.',
      value: burning ? 'residue burning season' : 'outside the residue burning season',
      raises: burning,
    });
  } else {
    const heavy = r.ladder >= RULES.heavyLadderFuel;
    const some = r.ladder >= RULES.someLadderFuel;
    drivers.push({
      key: 'fuel',
      title: heavy ? 'Dense undergrowth' : some ? 'Some undergrowth' : 'Open understory',
      text: heavy
        ? 'Brush and young trees under the canopy can carry a ground fire up into the crowns.'
        : some
          ? 'Patches of brush and dry litter under the trees.'
          : 'Little brush under the trees.',
      value: `understory fuel index ${r.ladder.toFixed(2)} of 1`,
      raises: some,
    });
  }
  const near = r.humanKm <= RULES.nearPeople;
  drivers.push({
    key: 'people',
    title: near ? 'Close to people' : 'Far from roads and houses',
    text: near
      ? 'Roads, farms and houses are close. Most fires here start from human activity.'
      : 'Few ignition sources nearby, but help also takes longer to arrive.',
    value: `about ${r.humanKm} km to the nearest road, farm or house`,
    raises: near,
  });

  const raised = drivers.filter((d) => d.raises).length;
  const level: Level =
    soil <= RULES.drySoil && fwi >= RULES.highFireWeather
      ? 'high'
      : raised >= 2
        ? 'elevated'
        : 'low';

  const actions: Action[] = [];
  if (level === 'low') {
    if (soil > RULES.ratherDrySoil && fwi <= RULES.calmFireWeather) {
      actions.push({
        when: month,
        who: 'Land managers',
        text: `${M} is a safe window: do planned low-intensity burns and clear field margins now, on calm days.`,
        rule: 'Safe burn window',
      });
    }
    return { region: r, month, level, drivers, actions };
  }

  if (r.land !== 'farmland' && r.ladder >= RULES.someLadderFuel) {
    actions.push({
      when: before(month, 3),
      who: 'Land managers',
      text: `Thin the undergrowth and remove dead wood along paths and forest roads before ${M}. Start with the slopes above houses.`,
      rule: 'Reduce ladder fuels',
    });
  }
  if (near) {
    actions.push({
      when: before(month, 2),
      who: 'Land managers',
      text:
        r.land === 'farmland'
          ? 'Plough a firebreak strip around stubble fields next to roads, farm buildings and woods.'
          : 'Clear a strip of at least a few metres between vegetation and houses, and keep access roads open.',
      rule: 'Buffers near the interface',
    });
  }
  if (soil <= RULES.drySoil && (burning || r.land === 'farmland')) {
    actions.push({
      when: before(month, 1),
      who: 'Policy makers',
      text: `Announce a pause on stubble and pile burning for ${M} now, so farmers can plan ploughing or baling instead.`,
      rule: 'Pause ignition-prone burns in dry spells',
    });
  } else if (soil <= RULES.ratherDrySoil && burning) {
    actions.push({
      when: before(month, 1),
      who: 'Policy makers',
      text: `Limit burning in ${M} to calm mornings with a permit, and say so before the season starts.`,
      rule: 'Pause ignition-prone burns in dry spells',
    });
  }
  if (fwi >= RULES.highFireWeather) {
    actions.push({
      when: before(month, 1),
      who: 'Policy makers',
      text:
        level === 'high'
          ? `Place crews and water points near the ${r.land === 'farmland' ? 'field and wood edges' : 'forest edge'} before ${M}, and plan patrols on windy days.`
          : `Agree the alert steps for windy days in ${M} with the local fire service.`,
      rule: 'Fire weather alert',
    });
  }
  actions.sort((a, b) => ((a.when - month + 12) % 12) - ((b.when - month + 12) % 12));
  return { region: r, month, level, drivers, actions };
}

export const LEVEL_WORDS: Record<Level, string> = {
  low: 'Low',
  elevated: 'Elevated',
  high: 'High',
};
