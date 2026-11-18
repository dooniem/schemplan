import { describe, expect, it } from 'vitest';
import { testplan } from '../test/testplaner';
import { computeLayout, type BoxItem } from './layout';
import { approxMeasure } from './text';
import { dateRows, dateText, datesShown, DATE_SCALE, setBoxDates, setDateFormat, setPlanDates } from './boxdates';
import { validatePlan } from '../format/validate';
import { mergePlans } from '../merge';
import { textHeightInBox } from './fittext';

const opts = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 9, fitToSheet: false };
const boxOf = (L: ReturnType<typeof computeLayout>, id: string) => L.items.find((it): it is BoxItem => it.id === id && it.kind === 'box')!;
const boxes = (p: ReturnType<typeof testplan>) => p.lanes.flatMap((l) => l.boxes);

describe('datoer på boksene', () => {
  it('formaterer datoene', () => {
    expect(dateText('2026-11-03', '2026-11-14')).toBe('03.11–14.11');
    expect(dateText('2026-11-03', '2026-11-03')).toBe('03.11');
    expect(dateText('2026-11-03', '2026-11-14', 'dmy')).toBe('03.11.26–14.11.26');
    expect(dateText('2026-11-03', '2026-12-14', 'dmon')).toBe('3. nov–14. des');
    expect(dateText('2026-11-03', '2026-11-14', 'week')).toBe('uke 45–46');
    expect(dateText('2026-11-03', '2026-11-05', 'week')).toBe('uke 45');
  });

  it('deler raden etter tankestreken når den ikke får plass', () => {
    expect(dateRows('03.11–14.11', 100, 3, approxMeasure)).toEqual(['03.11–14.11']);
    expect(dateRows('03.11–14.11', 5, 3, approxMeasure)).toEqual(['03.11–', '14.11']);
    expect(dateRows('03.11', 1, 3, approxMeasure)).toEqual(['03.11']);
  });

  it('valg for planen, eget valg per boks, og milepæler uten datorad', () => {
    const p = testplan();
    setPlanDates(p, true);
    const all = boxes(p);
    const ms = all.find((b) => b.resolved?.isMilestone)!;
    expect(datesShown(ms, p)).toBe(false);
    setBoxDates(p, ['1_1'], false);
    expect(all.find((b) => b.id === '1_1')!.showDates).toBe(false);
    expect(datesShown(all.find((b) => b.id === '1_1')!, p)).toBe(false);
    // Likt valget for planen: lagres ikke
    setBoxDates(p, ['1_2'], true);
    expect(all.find((b) => b.id === '1_2')!.showDates).toBeUndefined();
    setDateFormat(p, 'week');
    expect(validatePlan(p).errors).toEqual([]);
    // Av for planen: boksen som var slått av, trenger ikke eget valg lenger
    setPlanDates(p, false);
    expect(all.find((b) => b.id === '1_1')!.showDates).toBeUndefined();
    setDateFormat(p, 'dm');
    expect(p.plan.layout.dateFormat).toBeUndefined();
  });

  it('boks med tekst inni får en mindre og dempet datorad under teksten', () => {
    const p = testplan();
    const before = boxOf(computeLayout(p, opts, approxMeasure), '1_1');
    setBoxDates(p, ['1_1'], true);
    const it = boxOf(computeLayout(p, opts, approxMeasure), '1_1');
    const b = boxes(p).find((x) => x.id === '1_1')!;
    expect(it.text).not.toBeNull();
    const t = it.text!;
    expect(t.sub).toBeDefined();
    expect(t.sub!.from).toBe(before.text!.lines.length);
    expect(t.lines.slice(t.sub!.from).join('')).toBe(dateText(b.resolved!.start, b.resolved!.finish));
    expect(t.sub!.size).toBeCloseTo(t.size * DATE_SCALE);
    expect(t.sub!.color).not.toBe(t.color);
    expect(it.h).toBeGreaterThan(before.h);
  });

  it('callout får datoraden under teksten', () => {
    const p = testplan();
    // 1_3 står i callout i testplanen
    expect(boxOf(computeLayout(p, opts, approxMeasure), '1_3').callout).not.toBeNull();
    setPlanDates(p, true);
    const it = boxOf(computeLayout(p, opts, approxMeasure), '1_3');
    const t = it.callout!.text;
    expect(t.sub).toBeDefined();
    expect(t.lines.length).toBeGreaterThan(t.sub!.from);
    expect(t.sub!.color).not.toBe('#000000');
  });

  it('valgene overlever oppdatering fra Project', () => {
    const work = testplan();
    setPlanDates(work, true);
    setDateFormat(work, 'dmy');
    setBoxDates(work, ['1_1'], false);
    const { plan } = mergePlans(work, testplan());
    expect(plan.plan.layout.showDates).toBe(true);
    expect(plan.plan.layout.dateFormat).toBe('dmy');
    expect(boxes(plan).find((b) => b.id === '1_1')!.showDates).toBe(false);
  });

  it('«Størst mulig tekst» regner med datoraden', () => {
    const box = { text: 'Riving', rotation: 0 as const, callout: 'auto' as const };
    const without = textHeightInBox(box, 40, 3, approxMeasure)!;
    const withDates = textHeightInBox(box, 40, 3, approxMeasure, '03.11–14.11')!;
    expect(withDates).toBeGreaterThan(without);
  });
});
