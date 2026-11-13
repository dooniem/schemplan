import { describe, expect, it } from 'vitest';
import { testplan } from '../test/testplaner';
import { computeLayout, type BoxItem, type LayoutOptions } from './layout';
import { edgeAt, edgeMm, edgeRange } from './area';
import { approxMeasure } from './text';
import type { PlanFile } from '../format/types';

const opts: LayoutOptions = { orientation: 'landscape', heightMode: 'custom', textSizePt: 9, fitToSheet: true, minTextPt: 6, paper: 'A3', style: 'ny' };
const withArea = (area: PlanFile['plan']['layout']['planArea']): PlanFile => {
  const f = testplan();
  f.plan.layout.planArea = area;
  return f;
};

describe('kanter', () => {
  it('rett linje uten punkter, og loddrett kant gir trinn', () => {
    const e = edgeMm([[0, 0.5], [0.5, 0.5], [0.5, 0.25], [1, 0.25]], 100, 100, 0, 100, 0, 0, 100);
    expect(edgeAt(e, 10)).toBeCloseTo(50);
    expect(edgeAt(e, 80)).toBeCloseTo(25);
    expect(edgeRange(e, 40, 60, 'min')).toBeCloseTo(25);
    expect(edgeRange(e, 40, 60, 'max')).toBeCloseTo(50);
    expect(edgeMm(undefined, 100, 100, 5, 95, 30, 0, 100)).toEqual([[5, 30], [95, 30]]);
  });
});

describe('egendefinert planområde', () => {
  const plain = computeLayout(testplan(), opts, approxMeasure);

  it('uten kanter er det som Fyll arket', () => {
    const fill = computeLayout(testplan(), { ...opts, heightMode: 'fill' }, approxMeasure);
    expect(plain.lanes.map((l) => l.y1)).toEqual(fill.lanes.map((l) => l.y1).map((v) => expect.closeTo(v, 5)));
    expect(plain.textSizePt).toBe(fill.textSizePt);
  });

  it('toppkanten dratt ned flytter kalenderen og lanene ned', () => {
    const y = (plain.plot.y0 + 40) / plain.height;
    const L = computeLayout(withArea({ top: [[0, y], [1, y]] }), opts, approxMeasure);
    expect(L.plot.y0).toBeCloseTo(plain.plot.y0 + 40, 3);
    expect(L.calendarTop[0].y).toBeCloseTo(plain.calendarTop[0].y + 40, 3);
    expect(L.plot.y1).toBeCloseTo(plain.plot.y1, 3);
  });

  it('kuttet hjørne nede til høyre: ingen boks havner i det kuttede, og planen fyller arket', () => {
    const { width: W, height: H } = plain;
    const cutY = plain.plot.y0 + (plain.plot.y1 - plain.plot.y0) * 0.55;
    const xa = plain.plot.x0 + (plain.plot.x1 - plain.plot.x0) * 0.6;
    const b = plain.plot.y1 / H;
    const L = computeLayout(withArea({ bottom: [[0, b], [xa / W, b], [xa / W, cutY / H], [1, cutY / H]] }), opts, approxMeasure);
    expect(L.overflow).toBe(false);
    for (const it of L.items) {
      if (it.kind !== 'box') continue;
      const box = it as BoxItem;
      const x1 = Math.max(box.x1, box.callout ? box.callout.box.x + box.callout.box.w : -Infinity);
      if (x1 > xa + 1e-6) expect(box.y + box.h).toBeLessThanOrEqual(cutY + 1e-3);
    }
    expect(L.lanes[L.lanes.length - 1].y1).toBeCloseTo(plain.plot.y1, 3);
    expect(L.area!.polygon.length).toBeGreaterThan(4);
  });

  it('Multi Lane-boks i det kuttede hjørnet stopper ved bunnkanten', () => {
    const { width: W, height: H } = plain;
    const cutY = plain.plot.y0 + (plain.plot.y1 - plain.plot.y0) * 0.7;
    const xa = plain.plot.x0 + (plain.plot.x1 - plain.plot.x0) * 0.6;
    const b = plain.plot.y1 / H;
    const f = withArea({ bottom: [[0, b], [xa / W, b], [xa / W, cutY / H], [1, cutY / H]] });
    const tpl = f.lanes[0].boxes[0];
    f.lanes[0].boxes.push({ ...tpl, id: 'span', text: 'Slakk', taskIds: [], spanTo: f.lanes[f.lanes.length - 1].id, resolved: { ...tpl.resolved!, start: '2026-10-01', finish: '2026-10-31' } });
    const L = computeLayout(f, opts, approxMeasure);
    const span = L.items.find((i) => i.id === 'span') as BoxItem;
    expect(span.span).toBe(true);
    expect(span.x0).toBeGreaterThan(xa);
    expect(span.y + span.h).toBeLessThanOrEqual(cutY + 1e-3);
    expect(span.y + span.h).toBeGreaterThan(cutY - 3);
  });

  it('et kutt som tar nesten alt, krymper teksten i stedet for å kutte planen', () => {
    const cutY = plain.plot.y0 + 25;
    const H = plain.height;
    const L = computeLayout(withArea({ bottom: [[0, plain.plot.y1 / H], [0.15, plain.plot.y1 / H], [0.15, cutY / H], [1, cutY / H]] }), opts, approxMeasure);
    expect(L.textSizePt).toBeLessThan(plain.textSizePt);
  });

  it('toppkanten med knekk: bokser under det kuttede havner under kanten', () => {
    const { width: W, height: H } = plain;
    const xa = plain.plot.x0 + (plain.plot.x1 - plain.plot.x0) * 0.5;
    const t = plain.plot.y0 / H;
    const low = (plain.plot.y0 + 30) / H;
    const L = computeLayout(withArea({ top: [[0, t], [xa / W, t], [xa / W, low], [1, low]] }), opts, approxMeasure);
    expect(L.overflow).toBe(false);
    for (const it of L.items) {
      if (it.kind !== 'box') continue;
      if (it.x1 > xa + 1e-6) expect(it.y).toBeGreaterThanOrEqual(plain.plot.y0 + 30 - 1e-3);
    }
  });
});
