import { describe, expect, it } from 'vitest';
import { migrate } from './migrate';

describe('løfte gamle planfiler', () => {
  const steps = {
    1: (d: Record<string, unknown>) => {
      d.a = 'fra v1';
    },
    2: (d: Record<string, unknown>) => {
      d.b = `${d.a} og v2`;
    },
  };
  it('kjører stegene etter hverandre fram til gjeldende versjon, uten å endre originalen', () => {
    const old = { format: 'schemplan', version: 1 };
    expect(migrate(old, steps, 3)).toEqual({ format: 'schemplan', version: 3, a: 'fra v1', b: 'fra v1 og v2' });
    expect(old.version).toBe(1);
  });
  it('lar ny nok fil og fil med manglende steg være', () => {
    const now = { version: 3 };
    expect(migrate(now, steps, 3)).toBe(now);
    const gap = { version: 0 };
    expect(migrate(gap, steps, 3)).toBe(gap);
  });
});
