import { describe, expect, it } from 'vitest';
import { latLngToCell } from 'h3-js';
import {
  decodePlace,
  encodePlace,
  parseHash,
  serializeHash,
  type UrlDefaults,
  type UrlState,
} from '../../src/state/url';

const d: UrlDefaults = {
  view: { zoom: 2, lat: 25, lon: 10 },
  month: '2026-10',
  record: { start: '2000-11', end: '2026-11' },
};

const states: UrlState[] = [
  {
    view: { zoom: 6.5, lat: 41.2, lon: 14.8 },
    month: '2024-08',
    place: { kind: 'point', lat: 44.64, lon: 7.93, label: 'Langhe, Italy' },
    mode: 'sci',
    seriesView: 'raw-modis',
  },
  {
    view: { zoom: 4.6, lat: 39.9, lon: -8.1 },
    month: '2017-10',
    place: { kind: 'cell', cell: latLngToCell(39.9, -8.1, 4) },
    mode: 'simple',
    seriesView: 'harmonized',
  },
  {
    view: { zoom: 9, lat: 45.1, lon: 7.05 },
    month: '2026-10',
    place: {
      kind: 'shape',
      ring: [
        [7.01, 45.1],
        [7.1, 45.1],
        [7.1, 45.17],
        [7.01, 45.17],
      ],
      label: 'Susa & Val (test)',
    },
    mode: 'sci',
    seriesView: 'raw-viirs',
  },
  { view: d.view, month: d.month, place: null, mode: 'simple', seriesView: 'harmonized' },
];

describe('URL state', () => {
  it.each(states.map((s) => [s.place?.kind ?? 'none', s] as const))(
    'encode then decode returns the same state (%s)',
    (_, s) => {
      const hash = serializeHash(s, d);
      const back = parseHash(hash, d);
      expect(back.hadInvalid).toBe(false);
      expect(back.state).toEqual(s);
    },
  );

  it('uses the plan format', () => {
    expect(serializeHash(states[0]!, d)).toBe(
      '#map=6.50/41.2000/14.8000&month=2024-08&place=p:44.6400,7.9300&label=Langhe%2C%20Italy&mode=sci&view=raw-modis',
    );
  });

  it('returns defaults for garbage input', () => {
    for (const hash of [
      '#map=abc&month=2099-01&place=x:1&mode=pro&view=foo',
      '#map=99/999/999&month=2024-13&place=c:nothex',
      '#place=p:91,0',
      '#place=s:%%%',
      '#place=c:8f2830828052d25', // res 15 cell is not a res 3 to 5 place
    ]) {
      const p = parseHash(hash, d);
      expect(p.hadInvalid).toBe(true);
      expect(p.state.view).toEqual(d.view);
      expect(p.state.place).toBeNull();
    }
    expect(parseHash('', d)).toEqual({
      state: {
        view: d.view,
        month: d.month,
        place: null,
        mode: 'simple',
        seriesView: 'harmonized',
      },
      hadInvalid: false,
    });
    expect(parseHash('#%%%&&==', d).state.month).toBe(d.month);
  });

  it('simple mode forces the harmonized view', () => {
    expect(parseHash('#view=raw-modis', d).state.seriesView).toBe('harmonized');
  });

  it('place codes round trip', () => {
    const p = { kind: 'cell' as const, cell: latLngToCell(10, 10, 5) };
    expect(decodePlace(encodePlace(p))).toEqual(p);
  });
});
