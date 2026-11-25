import { describe, expect, it } from 'vitest';
import { testplan } from '../test/testplaner';
import type { BoxItem } from './layout';
import { computeLayout, PROGRESS_KEY } from './layout';
import { approxMeasure } from './text';
import { boxProgressFill, clipLeft } from './progressfill';
import type { Pt } from './hatch';

const box = (extra: Partial<BoxItem> = {}): BoxItem => ({ kind: 'box', id: 'a', x0: 10, x1: 50, y: 20, h: 6, fill: '#FFC0CB', border: '#7F7F7F', ...extra }) as BoxItem;
const xs = (poly: Pt[]) => poly.map(([x]) => x);

describe('clipLeft', () => {
  it('kutter omrisset ved x', () => {
    const p = clipLeft([[0, 0], [10, 0], [10, 5], [0, 5]], 4);
    expect(Math.max(...xs(p))).toBe(4);
    expect(p.length).toBe(4);
  });
  it('kutter skrått gjennom en pilspiss', () => {
    const p = clipLeft([[0, 0], [8, 0], [10, 2], [8, 4], [0, 4]], 9);
    expect(Math.max(...xs(p))).toBe(9);
    expect(p.length).toBe(6);
  });
});

describe('boxProgressFill', () => {
  it('ingenting når ingenting er ferdig', () => {
    expect(boxProgressFill(box(), 0, null, true, approxMeasure)).toBeNull();
  });
  it('feltet slutter ved fremdriften, og fronten står der', () => {
    const pf = boxProgressFill(box(), 0.25, null, true, approxMeasure)!;
    expect(Math.max(...xs(pf.poly))).toBeCloseTo(20);
    expect(pf.front).toMatch(/^M20 /);
    expect(pf.bands.length).toBeGreaterThan(0);
    expect(pf.ink).toBe('#000000');
  });
  it('ferdig boks: hele boksen, ingen front', () => {
    const pf = boxProgressFill(box(), 1, null, true, approxMeasure)!;
    expect(Math.max(...xs(pf.poly))).toBeCloseTo(50 - 0.15);
    expect(pf.front).toBe('');
  });
  it('mørkt fyll får lyse bånd', () => {
    expect(boxProgressFill(box({ fill: '#000075' }), 0.5, null, true, approxMeasure)!.ink).toBe('#FFFFFF');
  });
  it('fronten brytes rundt teksten', () => {
    const text = { x: 30, y: 23.5, lines: ['Lorem ipsum dolor'], size: 3, color: '#000000', anchor: 'middle' as const };
    const pf = boxProgressFill(box({ h: 12, y: 20, text: { ...text, y: 27 } }), 0.5, null, true, approxMeasure)!;
    // To stykker: over og under teksten
    expect(pf.front.match(/M/g)!.length).toBe(2);
  });
});

describe('fremdrift som felt i planen', () => {
  const opts = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: true };
  it('kommer i tillegg til stripen og forklares i forklaringen', () => {
    const p = testplan();
    p.plan.layout.showProgress = true;
    for (const t of p.tasks) t.percentComplete = 40;
    const stripe = computeLayout(p, opts, approxMeasure);
    expect(stripe.progress.some((m) => m.asFill)).toBe(false);
    expect(stripe.items.some((i) => i.kind === 'box' && i.progressFill)).toBe(false);
    expect(stripe.legend.some((e) => e.key === PROGRESS_KEY)).toBe(false);

    p.plan.layout.progressStyle = 'fill';
    const L = computeLayout(p, { ...opts, showLegend: true }, approxMeasure);
    const withDone = L.progress.filter((m) => m.done);
    expect(withDone.length).toBeGreaterThan(0);
    expect(withDone.every((m) => m.asFill)).toBe(true);
    expect(L.items.filter((i) => i.kind === 'box' && i.progressFill).length).toBe(withDone.length);
    expect(L.legend.some((e) => e.key === PROGRESS_KEY && e.symbol === 'progress')).toBe(true);
  });
});

describe('fremdrift i arbeidstid', () => {
  it('20 % av 15 arbeidsdager står ved slutten av tredje arbeidsdag, som fremdriftsfronten', () => {
    const p = testplan();
    p.plan.layout.showProgress = true;
    p.plan.layout.progressStyle = 'fill';
    const b = p.lanes.flatMap((l) => l.boxes).find((x) => x.id === '4_2')!;
    b.rotation = 0;
    b.resolved = { ...b.resolved!, start: '2026-11-23', finish: '2026-12-11' };
    for (const t of p.tasks.filter((t) => b.taskIds.includes(t.uid))) Object.assign(t, { start: '2026-11-23', finish: '2026-12-11', percentComplete: 20 });
    const L = computeLayout(p, { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: true }, approxMeasure);
    const m = L.progress.find((x) => x.id === '4_2')!;
    // Mandag til onsdag er ferdig: grensen mellom onsdag 25. og torsdag 26.
    const edge = (L.xOfDate('2026-11-25')! + L.xOfDate('2026-11-26')!) / 2;
    expect(m.xDone).toBeCloseTo(edge, 2);
    // Andel av bredden i kalenderdager ville gitt et punkt lenger til høyre
    expect(m.x0 + (m.x1 - m.x0) * 0.2).toBeGreaterThan(edge);
    const it = L.items.find((i) => i.id === '4_2');
    expect(it?.kind === 'box' && Math.max(...it.progressFill!.poly.map(([x]) => x))).toBeCloseTo(edge, 2);
  });
});
