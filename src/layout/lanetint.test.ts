import { describe, expect, it } from 'vitest';
import { laneTint } from './lanetint';
import { luminance } from './color';
import { toOklch } from './oklch';
import { computeLayout } from './layout';
import { approxMeasure } from './text';
import { testplan } from '../test/testplaner';

const OPTS = { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true } as const;

describe('lanefarge som bakgrunn', () => {
  it('gir ingen nyanser for hvit eller manglende farge', () => {
    expect(laneTint(null, true)).toBeNull();
    expect(laneTint('#FFFFFF', false)).toBeNull();
  });

  it('er lys nok til ikke å ta fokus, og mørkt felt er mørkere enn lyst', () => {
    for (const c of ['#000075', '#E6194B', '#FFE119', '#3CB44B', '#000000', '#A9A9A9']) {
      for (const ny of [true, false]) {
        const t = laneTint(c, ny)!;
        expect(luminance(t.light)).toBeGreaterThan(0.88);
        expect(luminance(t.dark)).toBeGreaterThan(0.75);
        expect(luminance(t.dark)).toBeLessThan(luminance(t.light));
        expect(luminance(t.darkAlt)).toBeLessThan(luminance(t.light));
        expect(luminance(t.darkAlt)).toBeGreaterThan(luminance(t.dark) - 1e-6);
      }
    }
  });

  it('gir like tydelig tone for mørke og lyse lanefarger', () => {
    // Lys grønn, petrol, mørk grønn, marineblå, rød, lilla, gul
    for (const c of ['#92D050', '#0E6C7E', '#1B6E50', '#000075', '#C00000', '#7030A0', '#FFC000']) {
      for (const ny of [true, false]) {
        const t = laneTint(c, ny)!;
        expect(toOklch(t.dark).c).toBeGreaterThan(0.035);
        expect(toOklch(t.dark).c).toBeLessThan(0.045);
        expect(toOklch(t.light).c).toBeGreaterThan(0.013);
      }
    }
  });

  it('holder grå lanefarge grå og gir aldri mer metning enn lanefargen har', () => {
    const g = laneTint('#808080', true)!;
    expect(toOklch(g.dark).c).toBeLessThan(0.003);
    const bg = laneTint('#6E6E78', true)!; // svak blågrå, metning ca. 0,02
    expect(toOklch(bg.dark).c).toBeLessThanOrEqual(toOklch('#6E6E78').c + 0.003);
  });

  it('legger fargede felt over hele lanen når bryteren er på', () => {
    const p = testplan();
    const lane = p.lanes.find((l) => l.shown)!;
    lane.fill = '#4363D8';
    const before = computeLayout(p, OPTS, approxMeasure);
    lane.tintBackground = true;
    const L = computeLayout(p, OPTS, approxMeasure);
    const ln = L.lanes.find((x) => x.id === lane.id)!;
    const t = laneTint('#4363D8', L.style === 'ny')!;
    const own = L.bands.filter((b) => b.y0 === ln.y0 && b.y1 === ln.y1);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((b) => [t.light, t.dark, t.darkAlt].includes(b.fill))).toBe(true);
    // Feltene dekker hele bredden av planområdet
    const w = own.reduce((s, b) => s + b.x1 - b.x0, 0);
    expect(w).toBeCloseTo(L.plot.x1 - L.plot.x0, 3);
    // Andre lanes er som før
    expect(L.bands.filter((b) => b.y0 !== ln.y0).length).toBe(before.bands.filter((b) => b.y0 !== ln.y0).length);
  });
});
