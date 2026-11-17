import { describe, expect, it } from 'vitest';
import { testplan } from '../test/testplaner';
import { computeLayout, type BoxItem } from './layout';
import { approxMeasure } from './text';
import { MARK_OUT, markRects, markScaleOf, markShapes, marksLabel, marksMatch, markText } from './marks';
import { validatePlan } from '../format/validate';
import { setMarks } from '../marksui';
import { parsePath } from '../pdf/svg2pdf';

const opts = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 9, fitToSheet: true };
const boxOf = (L: ReturnType<typeof computeLayout>, id: string) => L.items.find((it): it is BoxItem => it.id === id && it.kind === 'box')!;

describe('høylytt arbeid og nattarbeid', () => {
  it('tekst, utvalg og navn', () => {
    expect(markText({ loud: true, night: true })).toBe('Høylytt arbeid, nattarbeid');
    expect(markText({})).toBe('');
    expect(marksMatch(['loud'], [], false)).toBe(true);
    expect(marksMatch(['loud'], ['loud', 'night'], false)).toBe(true);
    expect(marksMatch(['loud'], ['loud', 'night'], true)).toBe(false);
    expect(marksMatch(['loud', 'night'], ['loud', 'night'], true)).toBe(true);
    expect(marksMatch([], ['night'], false)).toBe(false);
    expect(marksLabel(['night', 'loud'], true)).toBe('høylytt arbeid og nattarbeid');
    expect(marksLabel(['night', 'loud'], false)).toBe('høylytt arbeid eller nattarbeid');
  });

  it('størrelsen holdes innenfor valgene', () => {
    expect(markScaleOf(undefined)).toBe(1);
    expect(markScaleOf(9)).toBe(1.5);
    expect(markScaleOf(0.1)).toBe(0.75);
  });

  it('ikonene stikker litt ut på høyre kant, under hverandre eller på rad', () => {
    const col = markRects({ kinds: ['loud', 'night'], size: 4, row: false }, 100, 10, 12, 5);
    expect(col.map((r) => r.kind)).toEqual(['loud', 'night']);
    expect(col[0].x + col[0].s).toBeCloseTo(100 + 4 * MARK_OUT);
    expect(col[1].y).toBeGreaterThan(col[0].y + 4 - 1e-9);
    const row = markRects({ kinds: ['loud', 'night'], size: 4, row: true }, 100, 10, 5, 5);
    expect(row[0].y).toBe(row[1].y);
    expect(row[1].x + 4).toBeCloseTo(100 + 4 * MARK_OUT);
    expect(row[0].x + 4).toBeLessThan(row[1].x);
  });

  it('ikonene er stier PDF-en kan lese', () => {
    for (const k of ['loud', 'night'] as const) {
      const shapes = markShapes(k, 10, 20, 4);
      expect(shapes.length).toBeGreaterThan(1);
      for (const sh of shapes) {
        const segs = parsePath(String(sh.attrs.d));
        expect(segs.length).toBeGreaterThan(3);
        // Alt holder seg innenfor kvadratet (med litt slingring for strekene)
        for (const sg of segs) if (sg[0] !== 'Z') for (let i = 1; i < sg.length; i += 2) {
          expect(sg[i] as number).toBeGreaterThanOrEqual(10 - 0.2);
          expect(sg[i] as number).toBeLessThanOrEqual(14 + 0.2);
        }
      }
    }
  });

  it('merket boks får ikoner, blir aldri lavere enn dem, og merkene kommer i forklaringen', () => {
    const plain = computeLayout(testplan(), opts, approxMeasure);
    const p = testplan();
    setMarks(p, ['1_1', '1_3', '3_3'], 'loud', true);
    setMarks(p, ['1_3'], 'night', true);
    expect(validatePlan(p).errors).toEqual([]);
    // Milepælen ble ikke merket
    expect(p.lanes[2].boxes[2].loud).toBeUndefined();
    const L = computeLayout(p, opts, approxMeasure);
    const a = boxOf(L, '1_1');
    expect(a.marks?.kinds).toEqual(['loud']);
    expect(a.h).toBeGreaterThanOrEqual(a.marks!.size);
    // Kort boks med callout og to ikoner: under hverandre, og boksen vokser
    const c = boxOf(L, '1_3');
    const c0 = boxOf(plain, '1_3');
    expect(c.marks?.kinds).toEqual(['loud', 'night']);
    if (!c.marks!.row) expect(c.h).toBeGreaterThan(c0.h);
    // Teksten flyttes litt mot venstre for å gi plass
    expect(a.text!.x).toBeLessThan((a.x0 + a.x1) / 2);
    expect(L.legend.map((e) => e.key)).toEqual(expect.arrayContaining(['(høylytt)', '(natt)']));
    expect(plain.legend.some((e) => e.key === '(høylytt)')).toBe(false);
  });

  it('større ikoner med egen størrelse', () => {
    const p = testplan();
    setMarks(p, ['1_1'], 'loud', true);
    const s1 = boxOf(computeLayout(p, opts, approxMeasure), '1_1').marks!.size;
    p.plan.layout.markScale = 1.5;
    expect(validatePlan(p).errors).toEqual([]);
    expect(boxOf(computeLayout(p, opts, approxMeasure), '1_1').marks!.size).toBeCloseTo(s1 * 1.5);
    p.plan.layout.markScale = 3;
    expect(validatePlan(p).errors.length).toBeGreaterThan(0);
  });
});
