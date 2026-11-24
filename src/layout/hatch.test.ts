import { describe, expect, it } from 'vitest';
import type { Box } from '../format/types';
import { approxMeasure } from './text';
import type { TextBlock } from './layout';
import { hatchOf, hatchPath, setHatch, textGaps, type Gap, type Pt } from './hatch';

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** Linjestykkene i stien som [x0, y0, x1, y1]. */
const segs = (d: string) => [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].map((m) => m.slice(1).map(Number));

describe('hatchPath', () => {
  it('holder strekene innenfor omrisset', () => {
    const d = hatchPath('diagCross', 'tight', rect(10, 20, 40, 35));
    const s = segs(d);
    expect(s.length).toBeGreaterThan(20);
    for (const [x0, y0, x1, y1] of s)
      for (const [x, y] of [[x0, y0], [x1, y1]]) {
        expect(x).toBeGreaterThanOrEqual(10 - 1e-3);
        expect(x).toBeLessThanOrEqual(40 + 1e-3);
        expect(y).toBeGreaterThanOrEqual(20 - 1e-3);
        expect(y).toBeLessThanOrEqual(35 + 1e-3);
      }
  });

  it('vannrette streker går fra kant til kant med fast avstand', () => {
    const s = segs(hatchPath('horizontal', 'normal', rect(0, 0, 10, 10)));
    expect(s.every(([x0, y0, x1, y1]) => y0 === y1 && Math.min(x0, x1) === 0 && Math.max(x0, x1) === 10)).toBe(true);
    const ys = s.map((v) => v[1]).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeCloseTo(2);
  });

  it('skrå streker heller riktig vei', () => {
    const [up] = segs(hatchPath('diagUp', 'normal', rect(0, 0, 10, 10)));
    // Fra nede til venstre mot oppe til høyre: y minker når x øker (y nedover på arket)
    expect(Math.sign((up[3] - up[1]) * (up[2] - up[0]))).toBe(-1);
    const [down] = segs(hatchPath('diagDown', 'normal', rect(0, 0, 10, 10)));
    expect(Math.sign((down[3] - down[1]) * (down[2] - down[0]))).toBe(1);
  });

  it('lar feltene stå tomme', () => {
    const gap: Gap = [3, 3, 7, 7];
    const s = segs(hatchPath('vertical', 'tight', rect(0, 0, 10, 10), [gap]));
    for (const [x0, y0, , y1] of s) {
      if (x0 <= 3 || x0 >= 7) continue;
      // Ingen del av streken ligger inni feltet
      expect(Math.max(y0, y1) <= 3 + 1e-3 || Math.min(y0, y1) >= 7 - 1e-3).toBe(true);
    }
  });

  it('følger samme rutenett i nabobokser', () => {
    const ys = (x0: number) => segs(hatchPath('horizontal', 'loose', rect(x0, 0, x0 + 5, 10))).map((v) => v[1]);
    expect(ys(0)).toEqual(ys(5));
  });

  it('holder seg innenfor pilspisser', () => {
    // Boks som fortsetter mot høyre: spissen ender i (12, 5)
    const poly: Pt[] = [[0, 0], [10, 0], [12, 5], [10, 10], [0, 10]];
    for (const [x0, y0, x1, y1] of segs(hatchPath('horizontal', 'tight', poly))) {
      const x = Math.max(x0, x1);
      const y = y0 === y1 ? y0 : y1;
      expect(x).toBeLessThanOrEqual(10 + (2 * (5 - Math.abs(y - 5))) / 5 + 1e-3);
    }
  });
});

describe('textGaps', () => {
  const t: TextBlock = { x: 50, y: 10, lines: ['STOPP', '', 'ISDANNELSE'], size: 4, color: '#000000', anchor: 'middle' };
  it('gir ett felt per linje med tekst, sentrert om x', () => {
    const g = textGaps(t, approxMeasure);
    expect(g).toHaveLength(2);
    for (const [x0, , x1] of g) expect((x0 + x1) / 2).toBeCloseTo(50);
    expect(g[0][1]).toBeLessThan(10);
    expect(g[1][1]).toBeGreaterThan(g[0][3]);
  });
  it('står på høykant når teksten er rotert', () => {
    const [g] = textGaps({ ...t, lines: ['STOPP'], rotate: -90 }, approxMeasure);
    expect(g[3] - g[1]).toBeGreaterThan(g[2] - g[0]);
  });
});

describe('setHatch og hatchOf', () => {
  const box = (): Box => ({ id: 'b', text: '', shown: true, rotation: 0 }) as Box;
  it('lagrer ikke standardverdiene', () => {
    const b = box();
    setHatch(b, { pattern: 'diagUp', color: '#ff0000', density: 'normal' });
    expect(b.hatch).toEqual({ pattern: 'diagUp' });
    expect(hatchOf(b)).toEqual({ pattern: 'diagUp', color: '#FF0000', density: 'normal' });
  });
  it('tar bort skraveringen', () => {
    const b = box();
    setHatch(b, { pattern: 'grid', color: '#0070C0', density: 'tight' });
    expect(b.hatch).toEqual({ pattern: 'grid', color: '#0070C0', density: 'tight' });
    setHatch(b, null);
    expect(b.hatch).toBeUndefined();
    expect(hatchOf(b)).toBeNull();
  });
});
