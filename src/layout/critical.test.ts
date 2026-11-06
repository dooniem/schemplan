import { describe, expect, it } from 'vitest';
import { criticalLine } from './critical';
import type { BoxItem, Item, MilestoneItem } from './layout';
import { computeLayout } from './layout';
import { approxMeasure } from './text';
import { testplan } from '../test/testplaner';
import { validatePlan } from '../format/validate';
import { mergePlans } from '../merge';

const box = (id: string, x0: number, x1: number, y: number, h: number, textLines = 1): BoxItem => ({
  kind: 'box', id, x0, x1, y, h, fill: '#FFFFFF', border: null,
  text: textLines ? { x: (x0 + x1) / 2, y: y + h / 2 + 0.7, lines: Array(textLines).fill('T'), size: 2, color: '#000000', anchor: 'middle' } : null,
  callout: null, arrowLeft: false, arrowRight: false,
});
const style = { width: 0.6, color: '#E00000' };
const pairs = (p: number[]) => p.reduce<[number, number][]>((a, v, i) => (i % 2 ? (a[a.length - 1].push(v), a) : [...a, [v] as unknown as [number, number]]), []);

describe('kritisk linje', () => {
  it('går i datorekkefølge uansett rekkefølgen boksene ble merket i', () => {
    const items: Item[] = [box('b', 30, 50, 20, 4), box('a', 10, 25, 10, 4), box('c', 55, 70, 30, 4)];
    const l = criticalLine(items, new Set(['c', 'a', 'b']), style)!;
    const xs = pairs(l.points).map(([x]) => x);
    expect(xs[0]).toBe(10);
    expect(xs[xs.length - 1]).toBe(70);
    // x går aldri bakover
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    // Bare vannrette og loddrette biter
    const p = pairs(l.points);
    for (let i = 1; i < p.length; i++) expect(p[i][0] === p[i - 1][0] || p[i][1] === p[i - 1][1]).toBe(true);
  });

  it('går utenom teksten: langs kanten når boksen er full, midt i luften når det er plass', () => {
    const tight = box('a', 10, 30, 10, 3);
    const roomy = box('b', 40, 60, 10, 12);
    const l = criticalLine([tight, roomy], new Set(['a', 'b']), style)!;
    const ys = pairs(l.points).map(([, y]) => y);
    expect([10, 13]).toContain(ys[0]);
    const t = roomy.text!;
    const tTop = t.y - t.size * 0.8;
    const tBottom = t.y + t.size * 0.25;
    const yb = ys[ys.length - 1];
    expect(yb < tTop || yb > tBottom).toBe(true);
    expect(yb).toBeGreaterThan(10);
    expect(yb).toBeLessThan(22);
  });

  it('velger kanten som gir minst hopp', () => {
    const a = box('a', 10, 30, 10, 3);
    const b = box('b', 35, 50, 13, 3);
    const l = criticalLine([a, b], new Set(['a', 'b']), style)!;
    // Nederste kant av a og øverste av b er samme høyde: ingen trapp
    expect(pairs(l.points)).toEqual([[10, 13], [50, 13]]);
  });

  it('går gjennom milepæler i senter', () => {
    const m: MilestoneItem = { kind: 'milestone', id: 'm', x: 40, y: 25, size: 3, symbol: 'diamond', color: '#000', label: { x: 42, y: 25, lines: ['M'], size: 2, color: '#000', anchor: 'start' }, labelBox: { x: 42, y: 23, w: 5, h: 3 }, verticalLine: false };
    const l = criticalLine([box('a', 10, 30, 10, 3), m], new Set(['a', 'm']), style)!;
    const p = pairs(l.points);
    expect(p[p.length - 1]).toEqual([40, 25]);
  });

  it('er tom uten merkede bokser, tegnes i planen og overlever oppdatering fra Project', () => {
    const p = testplan();
    const opts = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 9, fitToSheet: true };
    expect(computeLayout(p, opts, approxMeasure).critical).toBeNull();
    p.lanes[0].boxes[0].critical = true;
    p.lanes[1].boxes[0].critical = true;
    p.plan.layout.criticalLine = { width: 1.2, color: '#0050D0' };
    const L = computeLayout(p, opts, approxMeasure);
    expect(L.critical?.width).toBe(1.2);
    expect(L.critical!.points.length).toBeGreaterThanOrEqual(4);
    expect(validatePlan(JSON.parse(JSON.stringify(p))).errors).toEqual([]);
    const fresh = testplan();
    const { plan: merged } = mergePlans(p, fresh);
    expect(merged.lanes[0].boxes[0].critical).toBe(true);
    expect(merged.plan.layout.criticalLine).toEqual({ width: 1.2, color: '#0050D0' });
  });

  const withCallout = (id: string, x0: number, x1: number, y: number, h: number, cw = 20): BoxItem => ({
    ...box(id, x0, x1, y, h, 0),
    callout: { box: { x: x1 + 0.5, y, w: cw, h }, text: { x: x1 + 1, y: y + h / 2 + 0.7, lines: ['T'], size: 2, color: '#000000', anchor: 'start' }, leader: [] },
  });

  it('går langs kanten som er fri, ikke i fugen mot teksten over', () => {
    // «Gulv på grunn» med tekst til høyre som ligger rett over «Vegger»; «Maskinsalvegg» under
    const gulv = withCallout('g', 10, 14, 10, 3, 18);
    const vegger = box('v', 14, 30, 13, 3);
    const maskin = box('m', 22, 40, 17, 3);
    const l = criticalLine([gulv, vegger, maskin], new Set(['g', 'v', 'm']), style)!;
    const p = pairs(l.points);
    // Gjennom «Vegger» langs bunnen (16), ikke toppen (13) der teksten over ligger
    expect(p.some(([x, y]) => y === 16 && x >= 14 && x <= 30)).toBe(true);
    expect(p.some(([x, y]) => y === 13 && x > 14 && x < 30)).toBe(false);
  });

  it('stryker ikke over sin egen callout-tekst på vei ned til neste boks', () => {
    // Boks med tekst til høyre, en stabel tekstbokser rett under, og neste boks langt nede til høyre
    const a = withCallout('a', 10, 14, 10, 3, 12);
    const stack = [0, 1, 2, 3, 4].map((k) => box(`s${k}`, 12, 30, 14 + k * 4, 3.5));
    const b = box('b', 50, 60, 36, 3);
    const l = criticalLine([a, ...stack, b], new Set(['a', 'b']), style)!;
    const p = pairs(l.points);
    const c = a.callout!.box;
    // Ingen vannrett bit inne i callout-teksten
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1];
      const [x1, y1] = p[i];
      if (y0 !== y1) continue;
      const inside = y0 > c.y + 1e-6 && y0 < c.y + c.h - 1e-6 && Math.min(x1, c.x + c.w) > Math.max(x0, c.x) + 1e-6;
      expect(inside).toBe(false);
    }
    // Og den loddrette streken går ikke gjennom stabelen
    for (let i = 1; i < p.length; i++) if (p[i][0] === p[i - 1][0] && p[i][1] !== p[i - 1][1]) expect(p[i][0] < 12 || p[i][0] > 30).toBe(true);
  });

  it('kan stiples', () => {
    const l = criticalLine([box('a', 10, 30, 10, 3)], new Set(['a']), { ...style, dash: 'dashed' })!;
    expect(l.dash).toBe('dashed');
  });
});
