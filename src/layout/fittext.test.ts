import { describe, expect, it } from 'vitest';
import { computeLayout, LANE_TITLE_DEFAULT, type BoxItem, type LayoutOptions } from './layout';
import { fitTextIntoLaneSpace, fitTextToBoxes, resetTextSizes } from './fittext';
import { approxMeasure, PT_TO_MM } from './text';
import { validatePlan } from '../format/validate';
import { inHeaderBox } from '../editmodel';
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

describe('størst mulig tekst med ledig plass i lanene', () => {
  const fill: LayoutOptions = { ...opts, heightMode: 'fill' };

  it('gir boksene større tekst der den vanlige varianten ikke finner plass', () => {
    const p = testplan();
    expect(fitTextToBoxes(p, fill, approxMeasure, { laneTitles: false }).grown).toBe(0);
    const before = computeLayout(p, fill, approxMeasure);
    const r = fitTextIntoLaneSpace(p, fill, approxMeasure, { laneTitles: false });
    expect(r.grown).toBeGreaterThan(0);
    const after = computeLayout(r.plan, fill, approxMeasure);
    // Planens tekst krymper ikke, og planen blir ikke høyere
    expect(after.textSizePt).toBe(before.textSizePt);
    expect(after.plot.y1).toBeLessThanOrEqual(before.plot.y1 + 1e-6);
    expect(validatePlan(r.plan).errors).toEqual([]);
  });

  it('lar milepæler og callouts være, og gjør ingen boks til callout', () => {
    const p = testplan();
    const r = fitTextIntoLaneSpace(p, fill, approxMeasure, { laneTitles: false });
    const all = r.plan.lanes.flatMap((l) => l.boxes);
    expect(all.find((b) => b.id === '3_3')!.textScale).toBeUndefined();
    expect(all.find((b) => b.id === '1_3')!.textScale).toBeUndefined();
    const L = computeLayout(r.plan, fill, approxMeasure);
    for (const b of all) if (b.textScale) expect(box(L, b.id).callout).toBeNull();
  });

  it('overskriftsboksen blir høyere, så boksene inni den ikke faller ut', () => {
    const p = testplan();
    // 2_1 er overskriftsboks med 2_2 og 2_3 under hverandre inni, akkurat høy nok
    const [head, a, b] = p.lanes[1].boxes;
    Object.assign(head, { header: true, text: 'Bro', top: 0, height: 3.8 });
    a.top = 1.2;
    b.top = 2.4;
    const L1 = computeLayout(p, fill, approxMeasure);
    const inside = L1.items.filter((o) => inHeaderBox(box(L1, '2_1'), o)).map((o) => o.id);
    expect(inside).toEqual(expect.arrayContaining(['2_2', '2_3']));
    const r = fitTextIntoLaneSpace(p, fill, approxMeasure, { laneTitles: false });
    expect(r.plan.lanes[1].boxes[1].textScale).toBeGreaterThan(1);
    const L2 = computeLayout(r.plan, fill, approxMeasure);
    const h = box(L2, '2_1');
    for (const id of inside) {
      const k = box(L2, id);
      expect(k.y + k.h).toBeLessThanOrEqual(h.y + h.h + 1e-6);
    }
    expect(h.h).toBeGreaterThan(box(L1, '2_1').h);
  });

  it('gjelder bare valgte bokser, og gjør aldri planen høyere', () => {
    const p = testplan();
    const r = fitTextIntoLaneSpace(p, fill, approxMeasure, { boxIds: new Set(['2_1']), laneTitles: false });
    expect(r.plan.lanes.flatMap((l) => l.boxes).filter((b) => b.textScale).map((b) => b.id)).toEqual(['2_1']);
    // Kompakt: bare bokser som deler høyden med en høyere boks i lanen, kan vokse
    const c = fitTextIntoLaneSpace(p, opts, approxMeasure, { laneTitles: true });
    const a = computeLayout(c.plan, opts, approxMeasure);
    const b = computeLayout(p, opts, approxMeasure);
    expect(a.textSizePt).toBe(b.textSizePt);
    expect(a.plot.y1).toBeLessThanOrEqual(b.plot.y1 + 1e-6);
  });
});

describe('lane-navnenes standardstørrelse', () => {
  it('er litt større enn teksten i boksene, rundet til halve punkter, og kan settes lik', () => {
    const p = testplan();
    const L = computeLayout(p, opts, approxMeasure);
    const pt = L.textSizePt;
    const lanePt = (lay: typeof L) => lay.lanes[0].title.size / (lay.textSizePt * PT_TO_MM);
    expect(L.lanes[0].title.size / PT_TO_MM).toBeCloseTo(Math.round(pt * LANE_TITLE_DEFAULT * 2) / 2, 5);
    expect(lanePt(L)).toBeGreaterThan(1);
    p.plan.layout.laneTitleScale = 1;
    const same = computeLayout(p, opts, approxMeasure);
    expect(same.lanes[0].title.size).toBeCloseTo(same.textSizePt * PT_TO_MM, 6);
  });
});
