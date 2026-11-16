import { describe, expect, it } from 'vitest';
import type { PlanImage } from '../format/types';
import { arrowStart, arrowTip, arrowWidth, defaultTip, placeArrow, placeArrows, storeTip, targetAt } from './arrow';
import { placeImage } from './image';

const W = 420;
const H = 297;
// Tekst 40 × 10 mm med midten i (100, 100)
const note = (o: Partial<PlanImage> = {}): PlanImage => ({
  id: 'n',
  data: 'data:image/png;base64,AA==',
  px: [640, 160],
  x: 100 / W,
  y: 100 / H,
  w: 40 / W,
  h: 10 / W,
  rotation: 0,
  note: { text: 'Tekst', sizePt: 12 },
  ...o,
});
const place = (o: Partial<PlanImage> = {}) => placeImage(note(o), W, H)!;

describe('pil fra fritekst', () => {
  it('starter på kanten av teksten, på linjen fra midten mot spissen', () => {
    const p = place();
    expect(arrowStart(p, { x: 200, y: 100 })).toEqual({ x: 120, y: 100 });
    const s = arrowStart(p, { x: 100, y: 160 })!;
    expect(s.x).toBeCloseTo(100);
    expect(s.y).toBeCloseTo(105);
    // Mot hjørnet: treffer den nærmeste kanten
    const d = arrowStart(p, { x: 160, y: 130 })!;
    expect(d.y).toBeCloseTo(105);
    expect(d.x).toBeCloseTo(110);
  });

  it('følger rotasjonen av teksten', () => {
    const p = { ...place(), rotation: 90 };
    // Rotert 90°: teksten er 10 bred og 40 høy
    expect(arrowStart(p, { x: 200, y: 100 })!.x).toBeCloseTo(105);
    expect(arrowStart(p, { x: 100, y: 200 })!.y).toBeCloseTo(120);
  });

  it('tegnes ikke når spissen står inne i teksten eller for nær', () => {
    const p = place();
    expect(arrowStart(p, { x: 105, y: 101 })).toBeNull();
    expect(placeArrow(p, { x: 121, y: 100 }, 12, '#000000')).toBeNull();
    expect(placeArrow(p, { x: 140, y: 100 }, 12, '#000000')).not.toBeNull();
  });

  it('har pilspissen på spissen, og streken slutter inne i den', () => {
    const a = placeArrow(place(), { x: 200, y: 100 }, 12, '#C00000')!;
    expect(a.head[0]).toEqual({ x: 200, y: 100 });
    expect(a.x2).toBe(200);
    expect(a.lx).toBeLessThan(200);
    expect(a.lx).toBeGreaterThan(a.head[1].x);
    // Bakkant av spissen står loddrett på streken
    expect(a.head[1].x).toBeCloseTo(a.head[2].x);
    expect(a.color).toBe('#C00000');
  });

  it('blir tykkere med større tekst, innenfor grensene', () => {
    expect(arrowWidth(12)).toBeCloseTo(0.254, 2);
    expect(arrowWidth(36)).toBeGreaterThan(arrowWidth(12));
    expect(arrowWidth(4)).toBe(0.2);
    expect(arrowWidth(200)).toBe(1.4);
  });

  it('festet til en boks følger boksen, ellers står den der den ble sluppet', () => {
    const rect = { x: 200, y: 50, w: 40, h: 10 };
    const a = storeTip({ x: 230, y: 52.5 }, W, H, { id: 'b1', rect });
    expect(a.to).toEqual({ id: 'b1', u: 0.75, v: 0.25 });
    // Boksen er flyttet
    const moved = arrowTip(a, W, H, () => ({ x: 300, y: 80, w: 20, h: 10 }));
    expect(moved).toEqual({ x: 315, y: 82.5 });
    // Boksen vises ikke: der den ble sluppet
    const gone = arrowTip(a, W, H, () => null);
    expect(gone.x).toBeCloseTo(230, 1);
    expect(gone.y).toBeCloseTo(52.5, 1);
  });

  it('finner den minste boksen under spissen', () => {
    const big = { id: 'h', rect: { x: 0, y: 0, w: 100, h: 100 } };
    const small = { id: 'b', rect: { x: 10, y: 10, w: 20, h: 5 } };
    expect(targetAt({ x: 15, y: 12 }, [big, small])?.id).toBe('b');
    expect(targetAt({ x: 50, y: 50 }, [big, small])?.id).toBe('h');
    expect(targetAt({ x: 150, y: 50 }, [big, small])).toBeNull();
  });

  it('en ny pil peker ned og til høyre, eller motsatt vei ved kanten av arket', () => {
    const t = defaultTip(place(), W, H);
    expect(t.x).toBeGreaterThan(120);
    expect(t.y).toBeGreaterThan(105);
    const edge = defaultTip(place({ x: 410 / W, y: 290 / H }), W, H);
    expect(edge.x).toBeLessThan(390);
    expect(edge.y).toBeLessThan(285);
  });

  it('lager piler bare for fritekst med pil', () => {
    const withArrow = note({ note: { text: 'A', sizePt: 12, color: '#0070C0', arrow: { x: 200 / W, y: 100 / H } } });
    const plain = note({ id: 'm' });
    const placed = [withArrow, plain].map((im) => placeImage(im, W, H)!);
    const out = placeArrows([withArrow, plain], placed, W, H, () => null);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('n');
    expect(out[0].color).toBe('#0070C0');
  });
});
