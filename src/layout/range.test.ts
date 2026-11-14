import { describe, expect, it } from 'vitest';
import { testplan } from '../test/testplaner';
import { validatePlan } from '../format/validate';
import { mergePlans } from '../merge';
import { computeLayout, type BoxItem } from './layout';
import { approxMeasure } from './text';
import { boxesOutside, columnCount, columnEnd, columnLabel, columnStart, effectiveRange, readCalendarRange, stepColumn, withCalendarRange } from './range';

const o = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 9, fitToSheet: false };
const ids = (p: ReturnType<typeof testplan>) =>
  computeLayout(p, o, approxMeasure)
    .items.filter((i): i is BoxItem => i.kind === 'box')
    .map((b) => b.id);

describe('tidsakse: omfang valgt i appen', () => {
  it('runder ut til hele måneder og uker', () => {
    expect(columnStart('2026-03-18', 'month')).toBe('2026-03-01');
    expect(columnEnd('2026-02-03', 'month')).toBe('2026-02-28');
    expect(columnStart('2026-11-14', 'week')).toBe('2026-11-09');
    expect(columnEnd('2026-11-14', 'week')).toBe('2026-11-15');
  });

  it('ett steg er én måned eller én uke, og måneden holder seg innenfor', () => {
    expect(stepColumn('2026-01-31', 'month', 1)).toBe('2026-02-28');
    expect(stepColumn('2026-01-15', 'month', -1)).toBe('2025-12-15');
    expect(stepColumn('2026-11-09', 'week', 1)).toBe('2026-11-16');
  });

  it('uten valg følger kalenderen Project, og planen er den samme', () => {
    const p = testplan();
    expect(effectiveRange(p, 'month')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(withCalendarRange(p, 'month')).toBe(p);
  });

  it('utvidet slutt viser boksen som lå etter Project-kalenderen', () => {
    const p = testplan();
    expect(ids(p)).not.toContain('5_2');
    expect(boxesOutside(p, 'month')).toBe(1);
    p.plan.layout.calendarRange = { end: '2027-02-10' };
    const v = withCalendarRange(p, 'month');
    expect(v.plan.calendar).toMatchObject({ start: '2026-01-01', end: '2027-02-28' });
    expect(ids(v)).toContain('5_2');
    expect(boxesOutside(p, 'month')).toBe(0);
    // Selve planen er urørt
    expect(p.plan.calendar.end).toBe('2026-12-31');
  });

  it('krympet kalender: bokser helt utenfor tegnes ikke, delvis synlige får pil', () => {
    const p = testplan();
    p.plan.layout.calendarRange = { start: '2026-04-01', end: '2026-09-30' };
    const v = withCalendarRange(p, 'month');
    const L = computeLayout(v, o, approxMeasure);
    const boxes = L.items.filter((i): i is BoxItem => i.kind === 'box');
    const get = (id: string) => boxes.find((b) => b.id === id);
    expect(get('1_1')).toBeUndefined(); // jan–mar
    expect(get('1_2')).toMatchObject({ arrowLeft: true, arrowRight: false }); // 23. mars–juni
    expect(get('2_1')).toMatchObject({ arrowLeft: true, arrowRight: true }); // feb–nov
    expect(get('4_2')).toBeUndefined(); // okt–des
    expect(boxesOutside(p, 'month')).toBe(5); // også milepælene i oktober og desember og boksen i 2027
    // Boksene ligger fortsatt i filen
    expect(p.lanes.flatMap((l) => l.boxes)).toHaveLength(13);
  });

  it('valget følger med ved Oppdater fra Project, og nye datoer fra Project endrer ikke omfanget', () => {
    const work = testplan();
    work.plan.layout.calendarRange = { start: '2026-04-01' };
    const fresh = testplan();
    fresh.plan.calendar.end = '2027-03-31';
    const { plan } = mergePlans(work, fresh);
    expect(plan.plan.layout.calendarRange).toEqual({ start: '2026-04-01' });
    // Slutten følger fortsatt Project
    expect(effectiveRange(plan, 'month')).toEqual({ start: '2026-04-01', end: '2027-03-31' });
  });

  it('ingen advarsel om bokser utenfor når omfanget er valgt i appen', () => {
    const p = testplan();
    const before = validatePlan(p);
    expect(before.plan && before.warnings.some((w) => w.includes('utenfor kalenderen'))).toBe(true);
    p.plan.layout.calendarRange = { start: '2026-04-01' };
    const after = validatePlan(p);
    expect(after.plan && after.warnings.some((w) => w.includes('utenfor kalenderen'))).toBe(false);
  });

  it('leser og avviser omfang', () => {
    expect(readCalendarRange({ start: '2026-01-01' })).toEqual({ start: '2026-01-01' });
    expect(readCalendarRange({ start: '1.1.2026' })).toBeNull();
    expect(readCalendarRange({ start: '2026-01-01', x: 1 })).toBeNull();
    const p = testplan();
    (p.plan.layout as Record<string, unknown>).calendarRange = { end: 'snart' };
    expect(validatePlan(p).plan).toBeNull();
  });

  it('tekst til menyen', () => {
    expect(columnLabel('2026-03-18', 'month')).toBe('Mar 2026');
    expect(columnLabel('2026-03-18', 'week')).toBe('uke 12 2026');
    expect(columnCount('2026-01-01', '2027-02-28', 'month')).toBe(14);
    expect(columnCount('2026-11-09', '2026-11-29', 'week')).toBe(3);
  });

  it('start etter slutt gir én kolonne', () => {
    const p = testplan();
    p.plan.layout.calendarRange = { start: '2027-05-01' };
    expect(effectiveRange(p, 'month')).toEqual({ start: '2027-05-01', end: '2027-05-31' });
  });
});
