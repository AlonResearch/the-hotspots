import { describe, expect, it } from 'vitest';
import { DEMO_REGIONS, demoRegionAt, insightFor, peakMonth } from '../../src/insight/demo';

const region = (id: string) => DEMO_REGIONS.find((r) => r.id === id)!;

describe('insight demo', () => {
  it('matches a place to its demo region, and nothing elsewhere', () => {
    expect(demoRegionAt(45.07, 7.69)?.id).toBe('turin');
    expect(demoRegionAt(41.5, 15.6)?.id).toBe('foggia');
    expect(demoRegionAt(45.72, 8.2)?.id).toBe('monte-barone');
    expect(demoRegionAt(45.46, 9.19)?.id).toBe('milan');
    expect(demoRegionAt(37.6, 14.2)).toBeNull();
  });

  it('every region has twelve values and a high or elevated peak with actions before it', () => {
    for (const r of DEMO_REGIONS) {
      expect(r.soil).toHaveLength(12);
      expect(r.fwi).toHaveLength(12);
      const i = insightFor(r, peakMonth(r));
      expect(i.level).not.toBe('low');
      expect(i.actions.length).toBeGreaterThan(0);
      expect(i.drivers.map((d) => d.key)).toEqual(['soil', 'weather', 'fuel', 'people']);
    }
  });

  it('Foggia in August: dry soil and fire weather pause stubble burning', () => {
    const i = insightFor(region('foggia'), 8);
    expect(i.level).toBe('high');
    expect(i.actions.map((a) => a.rule)).toContain('Pause ignition-prone burns in dry spells');
    expect(i.actions.every((a) => a.when !== 8)).toBe(true);
  });

  it('Monte Barone before its peak: thin the undergrowth three months ahead', () => {
    const i = insightFor(region('monte-barone'), 3);
    const thin = i.actions.find((a) => a.rule === 'Reduce ladder fuels')!;
    expect(thin.when).toBe(12);
    expect(i.actions[0]).toBe(thin);
  });

  it('a moist, calm month is low risk and offers the safe burn window', () => {
    const i = insightFor(region('foggia'), 1);
    expect(i.level).toBe('low');
    expect(i.actions.map((a) => a.rule)).toEqual(['Safe burn window']);
  });
});
