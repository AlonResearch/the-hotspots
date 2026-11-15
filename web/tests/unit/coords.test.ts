import { describe, expect, it } from 'vitest';
import { parseCoordinates } from '../../src/ui/coords';

describe('parseCoordinates', () => {
  it.each([
    ['37.6, 14.2', 37.6, 14.2],
    ['37.6 14.2', 37.6, 14.2],
    ['37.6N 14.2E', 37.6, 14.2],
    ['11.5 S, 54.5 W', -11.5, -54.5],
    ['-11.5,-54.5', -11.5, -54.5],
    ['45.14°N, 7.05°E', 45.14, 7.05],
    ['  44.64 ; 7.93 ', 44.64, 7.93],
  ])('%s', (text, lat, lon) => {
    expect(parseCoordinates(text)).toEqual({ lat, lon });
  });

  it.each(['Langhe', '91, 0', '0, 181', '37.6', '37.6, 14.2, 3', ''])('rejects %s', (text) => {
    expect(parseCoordinates(text)).toBeNull();
  });
});
