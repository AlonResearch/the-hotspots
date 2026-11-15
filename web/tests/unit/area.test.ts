import { describe, expect, it } from 'vitest';
import { formatArea, formatHa, formatKm2 } from '../../src/stats/wording';
import { overLand } from '../../src/styles/tokens';

describe('areas in the units people use (D24)', () => {
  it('under 1 km²: hectares first, the size of a field', () => {
    expect(formatArea(0.5)).toBe('50 ha (0.5 km²)');
    expect(formatArea(0.034)).toBe('3.4 ha (0.034 km²)');
  });

  it('1 to 100 km²: km² with hectares, the size of a cell or a small valley', () => {
    expect(formatArea(36.13)).toBe('36 km² (3,600 ha)');
    expect(formatArea(2.5)).toBe('2.5 km² (250 ha)');
    expect(formatKm2(36.13)).toBe('36 km²');
  });

  it('100 km² and more: km² only, hectares would be unreadable', () => {
    expect(formatArea(253)).toBe('250 km²');
    expect(formatArea(12393)).toBe('12,400 km²');
  });

  it('formats hectares on their own', () => {
    expect(formatHa(0.004)).toBe('0.4 ha');
    expect(formatHa(1.234)).toBe('120 ha');
  });

  it('legend swatches show the fill as it looks over land', () => {
    expect(overLand('#000000', 1)).toBe('rgb(0 0 0)');
    expect(overLand('#000000', 0)).toBe('rgb(236 238 233)');
  });
});
