import { describe, expect, it } from 'vitest';
import { rgb } from '../../src/styles/tokens';

describe('tokens', () => {
  it('parses the ember ramp to six RGB triples', () => {
    expect(rgb.ember).toHaveLength(6);
    expect(rgb.ember[0]).toEqual([246, 217, 120]);
  });
});
