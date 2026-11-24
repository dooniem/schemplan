import { describe, expect, it } from 'vitest';
import type { PlanImage } from '../format/types';
import { testplan } from '../test/testplaner';
import { frameCenter, placeImage } from './image';
import { laneAtY, laneSpanOf, moveToLane, pinLane, storeLane, vInLane, yInLane } from './imagelane';
import { computeLayout } from './layout';
import { approxMeasure } from './text';

const lanes = [
  { id: 'a', y0: 20, y1: 60 },
  { id: 'b', y0: 60, y1: 80 },
];
const img = (o: Partial<PlanImage> = {}): PlanImage => ({ id: 'i', data: 'data:image/png;base64,AA==', px: [100, 100], x: 0.5, y: 0.5, w: 0.05, h: 0.05, rotation: 0, ...o });

describe('bilder festet til en lane', () => {
  it('finner lanen som rommer y, ellers den nærmeste', () => {
    expect(laneAtY(lanes, 30)?.id).toBe('a');
    expect(laneAtY(lanes, 70)?.id).toBe('b');
    expect(laneAtY(lanes, 5)?.id).toBe('a');
    expect(laneAtY(lanes, 120)?.id).toBe('b');
    expect(laneAtY([], 10)).toBeNull();
  });

  it('regner fram og tilbake mellom y og plassen i lanen', () => {
    expect(vInLane(lanes[0], 30)).toBeCloseTo(0.25);
    expect(yInLane(lanes[0], 0.25)).toBeCloseTo(30);
  });

  it('følger lanen den er slått sammen med, og gir null når lanen er skjult', () => {
    const all = [{ id: 'a' }, { id: 'b' }, { id: 'c', mergedInto: 'b' }, { id: 'd' }];
    expect(laneSpanOf('c', lanes, all)?.id).toBe('b');
    expect(laneSpanOf('d', lanes, all)).toBeNull();
  });

  it('står like langt ned i lanen når lanen flyttes og blir høyere', () => {
    const im = img({ lane: { id: 'b', v: 0.5 } });
    const p = placeImage(im, 420, 297, { laneSpan: (id) => (id === 'b' ? { id, y0: 100, y1: 200 } : null) })!;
    expect(frameCenter(p).y).toBeCloseTo(150);
    // Skjult lane: bildet står der det sist sto
    const q = placeImage(im, 420, 297, { laneSpan: () => null })!;
    expect(q.cy).toBeCloseTo(0.5 * 297);
  });

  it('festes og løsnes uten å flytte seg, og festes til lanen det dras til', () => {
    const im = img();
    pinLane(im, 50, lanes, true);
    expect(im.lane).toEqual({ id: 'a', v: 0.75 });
    storeLane(im, 75, lanes);
    expect(im.lane).toEqual({ id: 'b', v: 0.75 });
    moveToLane(im, 'a');
    expect(im.lane).toEqual({ id: 'a', v: 0.75 });
    pinLane(im, 50, lanes, false);
    expect(im.lane).toBeUndefined();
  });

  it('følger lanen når arket byttes fra liggende til stående', () => {
    const file = testplan();
    const lane = file.lanes.filter((l) => l.shown && !l.hidden)[1];
    file.plan.layout.images = [img({ lane: { id: lane.id, v: 0.4 }})];
    for (const orientation of ['landscape', 'portrait'] as const) {
      const L = computeLayout(file, { orientation, heightMode: 'fill', textSizePt: 9, fitToSheet: true }, approxMeasure);
      const ln = L.lanes.find((l) => l.id === lane.id)!;
      const p = L.images[0];
      expect(frameCenter(p).y).toBeCloseTo(ln.y0 + 0.4 * (ln.y1 - ln.y0));
    }
  });
});
