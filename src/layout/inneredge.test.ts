import { describe, expect, it } from 'vitest';
import type { BoxItem } from './layout';
import { autoInnerEdgeTrades, boxesTouch, innerEdgeTone, insetOutline, markInnerEdges } from './inneredge';

const box = (id: string, trade: string, fill: string, x0: number, x1: number, y: number, h = 5): BoxItem & { trade: string } => ({
  kind: 'box', id, trade, x0, x1, y, h, fill, border: '#000000', text: null, callout: null, arrowLeft: false, arrowRight: false,
});

describe('lys innerkant', () => {
  it('gjelder mellomtoner, ikke lyse eller mørke farger', () => {
    for (const f of ['#A9A9A9', '#F58231', '#3CB44B', '#42D4F4', '#469990', '#E6194B']) expect(innerEdgeTone(f)).toBe(true);
    for (const f of ['#FFFFFF', '#FFFAC8', '#FFE119', '#000075', '#000000', '#911EB4']) expect(innerEdgeTone(f)).toBe(false);
  });

  it('bokser rører hverandre side mot side og topp mot bunn, ikke hjørne mot hjørne', () => {
    expect(boxesTouch(box('a', 'K', '#A9A9A9', 0, 10, 0), box('b', 'K', '#A9A9A9', 10, 20, 0))).toBe(true);
    expect(boxesTouch(box('a', 'K', '#A9A9A9', 0, 10, 0), box('b', 'K', '#A9A9A9', 5, 20, 5))).toBe(true);
    expect(boxesTouch(box('a', 'K', '#A9A9A9', 0, 10, 0), box('b', 'K', '#A9A9A9', 10, 20, 5))).toBe(false);
    expect(boxesTouch(box('a', 'K', '#A9A9A9', 0, 10, 0), box('b', 'K', '#A9A9A9', 12, 20, 0))).toBe(false);
  });

  it('slår på hele faget når to like grå bokser ligger inntil hverandre', () => {
    const items = [box('a', 'K', '#A9A9A9', 0, 10, 0), box('b', 'K', '#A9A9A9', 10, 20, 0), box('c', 'K', '#A9A9A9', 50, 60, 20)];
    expect([...markInnerEdges(items)]).toEqual(['K']);
    expect(items.every((i) => i.innerEdge)).toBe(true);
  });

  it('ikke automatisk for lyse fag, spredte bokser eller ulike farger', () => {
    const items = [
      box('a', 'L', '#FFFAC8', 0, 10, 0), box('b', 'L', '#FFFAC8', 10, 20, 0),
      box('c', 'K', '#A9A9A9', 0, 10, 30), box('d', 'K', '#A9A9A9', 15, 20, 30),
      box('e', 'O', '#F58231', 0, 10, 50), box('f', 'O', '#3CB44B', 10, 20, 50),
    ];
    expect(autoInnerEdgeTrades(items).size).toBe(0);
  });

  it('valg per fag går foran: På gir alle, Av gir ingen', () => {
    const items = [box('a', 'K', '#A9A9A9', 0, 10, 0), box('b', 'K', '#A9A9A9', 10, 20, 0), box('c', 'L', '#FFFAC8', 0, 10, 30)];
    markInnerEdges(items, { K: 'off', L: 'on' });
    expect(items.map((i) => !!i.innerEdge)).toEqual([false, false, true]);
  });

  it('overskriftsbokser og gjennomsiktige bokser får ikke innerkant', () => {
    const a = { ...box('a', 'K', '#A9A9A9', 0, 10, 0), header: true };
    const b = { ...box('b', 'K', '#A9A9A9', 10, 20, 0), fillOpacity: 0.5 };
    markInnerEdges([a, b], { K: 'on' });
    expect(a.innerEdge ?? b.innerEdge).toBeUndefined();
  });

  it('omrisset trekkes like langt inn på alle sider, også med pilspiss', () => {
    expect(insetOutline(0, 10, 0, 4, 1, false, false, 0.5)).toEqual([[0.5, 0.5], [9.5, 0.5], [9.5, 3.5], [0.5, 3.5]]);
    const p = insetOutline(0, 10, 0, 4, 2, false, true, 0.5);
    // Spissen er flyttet inn, og hjørnet ved toppen ligger på skrålinjen parallelt med den ytre
    expect(p[2][1]).toBe(2);
    expect(p[2][0]).toBeLessThan(10);
    expect((p[2][0] - p[1][0]) / (p[2][1] - p[1][1])).toBeCloseTo(2 / 2);
  });
});
