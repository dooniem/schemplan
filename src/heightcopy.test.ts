import { describe, expect, it } from 'vitest';
import { computeLayout, type BoxItem, type LayoutOptions } from './layout/layout';
import { approxMeasure } from './layout/text';
import { validatePlan } from './format/validate';
import { testplan } from './test/testplaner';
import { canTakeHeight, giveHeight, sameHeight } from './heightcopy';

const opts: LayoutOptions = { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: true };
const item = (L: ReturnType<typeof computeLayout>, id: string) => L.items.find((i) => i.id === id) as BoxItem;
const boxes = (p: ReturnType<typeof testplan>) => p.lanes.flatMap((l) => l.boxes).filter((b) => canTakeHeight(b) && !b.header);

describe('samme høyde som en annen boks', () => {
  it('gir de andre boksene samme høyde som boksen på arket', () => {
    const p = testplan();
    const [src, a, b] = boxes(p);
    src.height = 5;
    const L = computeLayout(p, opts, approxMeasure);
    sameHeight(p, L, src.id, [src.id, a.id, b.id]);
    const after = computeLayout(p, opts, approxMeasure);
    expect(item(after, a.id).h).toBeCloseTo(item(after, src.id).h, 1);
    expect(item(after, b.id).h).toBeCloseTo(item(after, src.id).h, 1);
    expect(validatePlan(p).errors).toEqual([]);
  });

  it('flytter teksten ut i callout når den ikke får plass i den lavere høyden', () => {
    const p = testplan();
    const [src, a] = boxes(p);
    a.text = 'En svært lang tekst som må brytes over mange linjer i boksen for å få plass';
    a.height = 8;
    delete src.height;
    src.text = 'Kort';
    const L = computeLayout(p, opts, approxMeasure);
    expect(item(L, a.id).minH!).toBeGreaterThan(item(L, src.id).h + 1e-6);
    const r = sameHeight(p, L, src.id, [a.id]);
    expect(r).toEqual({ callout: 1, taller: 0 });
    expect(a.callout).toBe('on');
    const after = computeLayout(p, opts, approxMeasure);
    expect(item(after, a.id).h).toBeCloseTo(item(after, src.id).h, 1);
    expect(item(after, a.id).callout).not.toBeNull();
  });

  it('lar boksen bli høyere når callout er slått av, eller den er en overskriftsboks', () => {
    const p = testplan();
    const [b] = boxes(p);
    b.callout = 'off';
    expect(giveHeight(b, 1, 3)).toBe('taller');
    expect(b.callout).toBe('off');
    b.callout = 'auto';
    b.header = true;
    expect(giveHeight(b, 1, 3)).toBe('taller');
    delete b.header;
    expect(giveHeight(b, 3, 3)).toBe('same');
    expect(b.height).toBe(3);
  });

  it('hopper over milepæler og Multi Lane-bokser', () => {
    const p = testplan();
    const [b] = boxes(p);
    b.spanTo = p.lanes[p.lanes.length - 1].id;
    expect(giveHeight(b, 4, 1)).toBe('skip');
    expect(b.height).toBeUndefined();
  });
});
