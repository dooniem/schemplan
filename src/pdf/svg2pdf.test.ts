import { describe, expect, it } from 'vitest';
import { parsePath, safeText } from './svg2pdf';

describe('parsePath', () => {
  it('gjør relative linjer om til absolutte (pil på avkuttet boks)', () => {
    expect(parsePath('M10 5 l-1.6 2 l1.6 2 z')).toEqual([
      ['M', 10, 5],
      ['L', 8.4, 7],
      ['L', 10, 9],
      ['Z'],
    ]);
  });

  it('leser absolutte kommandoer, H/V og kurver', () => {
    expect(parsePath('M0 0 L2 0 H5 V3 C1 1 2 2 3 3 Z')).toEqual([
      ['M', 0, 0],
      ['L', 2, 0],
      ['L', 5, 0],
      ['L', 5, 3],
      ['C', 1, 1, 2, 2, 3, 3],
      ['Z'],
    ]);
  });

  it('tolker ekstra tallpar etter M som linjer', () => {
    expect(parsePath('m1 1 2 0 0 2')).toEqual([
      ['M', 1, 1],
      ['L', 3, 1],
      ['L', 3, 3],
    ]);
  });
});

describe('tegn skriften ikke har', () => {
  it('blir «?», legges i listen, og usynlige styretegn droppes', () => {
    const has = (cp: number) => cp < 0x2000;
    const missing = new Set<string>();
    expect(safeText('Ferdig ✅ uke 3️', has, missing)).toBe('Ferdig ? uke 3');
    expect([...missing]).toEqual(['✅']);
  });
});
