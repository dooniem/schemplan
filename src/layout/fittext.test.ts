import { describe, expect, it } from 'vitest';
import { computeLayout, type BoxItem, type LayoutOptions } from './layout';
import { fitTextToBoxes, resetTextSizes } from './fittext';
import { approxMeasure } from './text';
import { validatePlan } from '../format/validate';
import { testplan } from '../test/testplaner';

const opts: LayoutOptions = { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: true };
const box = (L: ReturnType<typeof computeLayout>, id: string) => L.items.find((i) => i.id === id) as BoxItem;

describe('størst mulig tekst', () => {
  it('gir høye bokser større tekst, men ikke mer enn det dobbelte', () => {
    const p = testplan();
    p.lanes[1].boxes[0].height = 6; // bred og høy boks
    const before = computeLayout(p, opts, approxMeasure);
    const r = fitTextToBoxes(p, opts, approxMeasure, { laneTitles: false });
    const b = r.plan.lanes[1].boxes[0];
    expect(b.textScale).toBeGreaterThan(1);
    expect(b.textScale).toBeLessThanOrEqual(2);
    const after = computeLayout(r.plan, opts, approxMeasure);
    // Planen ellers er som før: samme tekst og ikke høyere
    expect(after.textSizePt).toBe(before.textSizePt);
    expect(after.plot.y1).toBeLessThanOrEqual(before.plot.y1 + 1e-6);
    expect(box(after, b.id).h).toBeCloseTo(box(before, b.id).h, 1);
    expect(validatePlan(r.plan).errors).toEqual([]);
  });

  it('gir samme svar når den kjøres igjen', () => {
    const p = testplan();
    for (const l of p.lanes) for (const b of l.boxes) b.height = 4;
    const r1 = fitTextToBoxes(p, opts, approxMeasure, { laneTitles: true });
    const r2 = fitTextToBoxes(r1.plan, opts, approxMeasure, { laneTitles: true });
    expect(JSON.stringify(r2.plan)).toBe(JSON.stringify(r1.plan));
  });

  it('lar milepæler og callouts være', () => {
    const p = testplan();
    for (const l of p.lanes) for (const b of l.boxes) b.height = 4;
    const r = fitTextToBoxes(p, opts, approxMeasure, { laneTitles: false });
    const all = r.plan.lanes.flatMap((l) => l.boxes);
    expect(all.find((b) => b.id === '3_3')!.textScale).toBeUndefined(); // milepæl
    expect(all.find((b) => b.id === '1_3')!.textScale).toBeUndefined(); // tvunget callout
  });

  it('gir lane-titlene én felles størrelse, høyst halvannen gang planens', () => {
    const p = testplan();
    const r = fitTextToBoxes(p, { ...opts, heightMode: 'fill' }, approxMeasure, { laneTitles: true });
    const s = r.plan.plan.layout.laneTitleScale;
    expect(s).toBeGreaterThan(1);
    expect(s).toBeLessThanOrEqual(1.5);
    const L = computeLayout(r.plan, { ...opts, heightMode: 'fill' }, approxMeasure);
    expect(new Set(L.lanes.map((l) => l.title.size)).size).toBe(1);
  });

  it('tilbake til planens størrelse beholder høydene', () => {
    const p = testplan();
    p.lanes[1].boxes[0].height = 6;
    const r = fitTextToBoxes(p, opts, approxMeasure, { laneTitles: true });
    const back = resetTextSizes(r.plan, { laneTitles: true });
    expect(back.lanes.flatMap((l) => l.boxes).some((b) => b.textScale)).toBe(false);
    expect(back.plan.layout.laneTitleScale).toBeUndefined();
    expect(back.lanes[1].boxes[0].height).toBe(6);
  });

  it('egen tekststørrelse i en boks gjør boksen høyere når den trenger det', () => {
    const p = testplan();
    const h0 = box(computeLayout(p, { ...opts, fitToSheet: false }, approxMeasure), '2_2').h;
    p.lanes[1].boxes[1].textScale = 1.5;
    const L = computeLayout(p, { ...opts, fitToSheet: false }, approxMeasure);
    const it = box(L, '2_2');
    expect(it.text!.size).toBeCloseTo(L.textSizePt * 1.5 * (25.4 / 72), 5);
    expect(it.h).toBeGreaterThan(h0);
  });
});
