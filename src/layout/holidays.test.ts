import { describe, expect, it } from 'vitest';
import { holidaySpans, minHolidayDays } from './holidays';
import { toIso } from './dates';

const iso = (spans: { s: number; e: number }[]) => spans.map((h) => [toIso(h.s), toIso(h.e)]);

describe('holidaySpans', () => {
  // 2026: skjærtorsdag 2. april, langfredag 3. april, 2. påskedag 6. april
  const paske = [
    { start: '2026-04-02', end: '2026-04-02' },
    { start: '2026-04-03', end: '2026-04-03' },
    { start: '2026-04-06', end: '2026-04-06' },
  ];

  it('slår sammen påsken med helgen til tor–man', () => {
    expect(iso(holidaySpans(paske, 4))).toEqual([['2026-04-02', '2026-04-06']]);
  });

  it('tor–fre alene blir tor–søn og er 4 dager', () => {
    expect(iso(holidaySpans(paske.slice(0, 2), 4))).toEqual([['2026-04-02', '2026-04-05']]);
    expect(holidaySpans(paske.slice(0, 2), 5)).toEqual([]);
  });

  it('skjuler enkeltstående fridager under grensen, viser dem med grense 1', () => {
    const mai17 = [{ start: '2026-05-14', end: '2026-05-14' }]; // torsdag
    expect(holidaySpans(mai17, 4)).toEqual([]);
    expect(iso(holidaySpans(mai17, 1))).toEqual([['2026-05-14', '2026-05-14']]);
  });

  it('tar med helgen på begge sider av en lang ferie', () => {
    const sommer = [{ start: '2026-07-06', end: '2026-07-24' }]; // man–fre
    expect(iso(holidaySpans(sommer, 7))).toEqual([['2026-07-04', '2026-07-26']]);
  });

  it('med 7 arbeidsdager i uka regnes ingen helg med', () => {
    expect(iso(holidaySpans(paske.slice(0, 2), 2, 7))).toEqual([['2026-04-02', '2026-04-03']]);
  });
});

describe('minHolidayDays', () => {
  it('bruker 4 som standard og holder seg innenfor 1–31', () => {
    expect(minHolidayDays(undefined)).toBe(4);
    expect(minHolidayDays(0)).toBe(1);
    expect(minHolidayDays(99)).toBe(31);
    expect(minHolidayDays(2.6)).toBe(3);
  });
});
