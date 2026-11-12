import { describe, expect, it } from 'vitest';
import type { PlanImage } from '../format/types';
import { cropTo, frameCenter, frameCorners, movePoint, naturalSize, newImage, placeImage, resetSize, resizeBy, rotateBy, rotateTo, storeImage, toSheet, toUv, type PlacedImage } from './image';

const W = 420;
const H = 297;
const img = (o: Partial<PlanImage> = {}): PlanImage => ({ id: 'a', data: 'data:image/png;base64,AA==', px: [400, 200], x: 0.5, y: 0.5, w: 0.1, h: 0.05, rotation: 0, ...o });
const place = (o: Partial<PlanImage> = {}) => placeImage(img(o), W, H)!;

describe('bilder', () => {
  it('plasseres som andel av arket', () => {
    const p = place();
    expect(p.cx).toBeCloseTo(210);
    expect(p.cy).toBeCloseTo(148.5);
    expect(p.w).toBeCloseTo(42);
    expect(p.h).toBeCloseTo(21);
  });

  it('regner fram og tilbake mellom bildet og arket, også rotert', () => {
    const p = { ...place(), rotation: 33 };
    const q = toSheet(p, 0.2, 0.9);
    const [u, v] = toUv(p, q.x, q.y);
    expect(u).toBeCloseTo(0.2);
    expect(v).toBeCloseTo(0.9);
  });

  it('opprinnelig størrelse er 96 punkter per tomme, men aldri over en tredjedel av arket', () => {
    expect(naturalSize([96, 48], W, H).w).toBeCloseTo(25.4);
    const big = naturalSize([6000, 3000], W, H);
    expect(big.w).toBeCloseTo(W / 3);
    expect(big.h).toBeCloseTo(W / 6);
  });

  it('nytt bilde holdes innenfor arket', () => {
    const n = newImage('b', 'x', [960, 480], { x: 0, y: 0 }, W, H);
    const p = placeImage(n, W, H)!;
    expect(p.cx - p.w / 2).toBeCloseTo(0);
    expect(p.cy - p.h / 2).toBeCloseTo(0);
  });

  it('hjørnet dras: motsatt hjørne står stille og formen beholdes', () => {
    const p = { ...place(), rotation: 20 };
    const nw = frameCorners(p)[0];
    const se = frameCorners(p)[2];
    const q = resizeBy(p, 'se', { x: se.x + 10, y: se.y + 2 });
    expect(frameCorners(q)[0].x).toBeCloseTo(nw.x);
    expect(frameCorners(q)[0].y).toBeCloseTo(nw.y);
    expect(q.w / q.h).toBeCloseTo(p.w / p.h);
    expect(q.w).toBeGreaterThan(p.w);
  });

  it('kanten dras: bare én retning endres', () => {
    const p = place();
    const q = resizeBy(p, 'e', { x: p.cx + p.w, y: p.cy });
    expect(q.w).toBeCloseTo(p.w * 1.5);
    expect(q.h).toBeCloseTo(p.h);
  });

  it('roterer om midten av det synlige og fanger rette vinkler', () => {
    const p = { ...place(), crop: [0, 0, 0.5, 1] as [number, number, number, number] };
    const c = frameCenter(p);
    const q = rotateBy(p, 90);
    expect(frameCenter(q).x).toBeCloseTo(c.x);
    expect(frameCenter(q).y).toBeCloseTo(c.y);
    // Pekeren litt ved siden av rett til høyre: 90° fanges
    const r = rotateTo(p, { x: c.x + 50, y: c.y + 2 });
    expect(r.rotation).toBe(90);
    expect(rotateTo(p, { x: c.x + 50, y: c.y + 20 }, true).rotation % 15).toBe(0);
  });

  it('vanlig beskjæring holdes innenfor bildet', () => {
    const p = place();
    expect(cropTo(p, 'w', { x: p.cx, y: p.cy })[0]).toBeCloseTo(0.5);
    expect(cropTo(p, 'w', { x: 0, y: p.cy })[0]).toBe(0);
    const c = cropTo(p, 'e', { x: p.cx - p.w, y: p.cy });
    expect(c[2]).toBeGreaterThan(c[0]);
  });

  it('punkter fanges av kantene', () => {
    const p = place();
    const q = toSheet(p, 0.01, 0.5);
    expect(movePoint(p, q, 1)[0]).toBe(0);
    expect(movePoint(p, q, 0)[0]).toBeCloseTo(0.01);
  });

  it('opprinnelig størrelse beholder rotasjonen og midten', () => {
    const p = { ...place(), rotation: 45, w: 100, h: 10 };
    const q = resetSize(p, [400, 200], W, H);
    expect(q.rotation).toBe(45);
    expect(q.w / q.h).toBeCloseTo(2);
    expect(frameCenter(q).x).toBeCloseTo(frameCenter(p).x);
  });

  it('festet til dato følger datoen og beholder avstanden', () => {
    const xOfDate = (d: string) => (d === '2026-03-01' ? 100 : d === '2026-04-01' ? 150 : null);
    const a = placeImage(img({ date: { day: '2026-03-01', dx: 0 } }), W, H, { xOfDate })!;
    expect(frameCenter(a).x).toBeCloseTo(100);
    const im = img({ date: { day: '2026-03-01', dx: 0 } });
    storeImage(im, { ...a, cx: a.cx + 4.2 }, W, H, { x: 100, y: 0 });
    const b = placeImage({ ...im, date: { ...im.date!, day: '2026-04-01' } }, W, H, { xOfDate })!;
    expect(frameCenter(b).x).toBeCloseTo(154.2, 1);
    // Utenfor kalenderen vises bildet ikke
    expect(placeImage(img({ date: { day: '2030-01-01', dx: 0 } }), W, H, { xOfDate })).toBeNull();
  });

  it('symbol for en milepæl følger milepælen', () => {
    const milestoneAt = (id: string) => (id === 'm' ? { x: 50, y: 60 } : null);
    const p = placeImage(img({ milestone: { id: 'm', dx: 0, dy: 0.01 } }), W, H, { milestoneAt }) as PlacedImage;
    expect(frameCenter(p).x).toBeCloseTo(50);
    expect(frameCenter(p).y).toBeCloseTo(60 + 4.2);
    expect(placeImage(img({ milestone: { id: 'x', dx: 0, dy: 0 } }), W, H, { milestoneAt })).toBeNull();
  });
});
