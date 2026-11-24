import { describe, expect, it } from 'vitest';
import { fromOklch, inGamut, toOklch } from './oklch';

describe('OKLCH', () => {
  it('går fram og tilbake uten å endre fargen', () => {
    for (const c of ['#000000', '#FFFFFF', '#0E6C7E', '#92D050', '#E6194B', '#000075', '#808080']) expect(fromOklch(toOklch(c))).toBe(c);
  });

  it('gir kjente verdier', () => {
    expect(toOklch('#FFFFFF').l).toBeCloseTo(1, 3);
    expect(toOklch('#808080').c).toBeLessThan(1e-4);
  });

  it('senker metningen når fargen ikke finnes på skjerm, men beholder lysheten', () => {
    const x = { l: 0.97, c: 0.2, h: 260 };
    expect(inGamut(x)).toBe(false);
    const ut = toOklch(fromOklch(x));
    expect(ut.l).toBeCloseTo(0.97, 2);
    expect(ut.c).toBeLessThan(0.2);
    expect(ut.c).toBeGreaterThan(0.005);
  });
});
