import { describe, expect, it } from 'vitest';
import { testplan } from '../test/testplaner';
import type { Lookahead } from '../format/types';
import { validatePlan } from '../format/validate';
import { applyLookahead, isoWeekMonday, LOOKAHEAD_DEFAULT, readLookahead, resolveWindow, todayIso } from './lookahead';
import { computeLayout, type BoxItem } from './layout';
import { toIso } from './dates';
import { approxMeasure } from './text';

const rule = (r: Partial<Lookahead> = {}): Lookahead => ({ ...LOOKAHEAD_DEFAULT, on: true, ...r });
const span = (w: { start: number; end: number }) => [toIso(w.start), toIso(w.end)];

describe('utkikk: periode', () => {
  // Planen går hele 2026. 8. november 2026 er en søndag i uke 45.
  const p = testplan();

  it('denne uken og 3 uker: fra mandag i uke 45 til og med søndag i uke 47', () => {
    const w = resolveWindow(rule(), p, '2026-11-08');
    expect(span(w)).toEqual(['2026-11-02', '2026-11-23']);
    expect(w.label).toBe('Uke 45–47 2026');
    expect(w.tag).toBe('u45-47');
    expect(w.note).toBeNull();
  });

  it('uken før tas med i tillegg', () => {
    const w = resolveWindow(rule({ prevWeek: true }), p, '2026-11-04');
    expect(span(w)).toEqual(['2026-10-26', '2026-11-23']);
    expect(w.weeks).toBe(4);
  });

  it('fra valgt uke til og med valgt uke', () => {
    const w = resolveWindow(rule({ from: { year: 2026, week: 10 }, length: { year: 2026, week: 12 } }), p, '2026-11-08');
    expect(span(w)).toEqual(['2026-03-02', '2026-03-23']);
    expect(w.tag).toBe('u10-12');
  });

  it('ukenummer får to sifre, så knappen ikke endrer bredde', () => {
    const w = resolveWindow(rule({ from: { year: 2026, week: 3 }, length: { year: 2026, week: 5 } }), p, '2026-11-08');
    expect(w.tag).toBe('u03-05');
    const en = resolveWindow(rule({ from: { year: 2026, week: 9 }, length: { year: 2026, week: 9 } }), p, '2026-11-08');
    expect(en.tag).toBe('u09');
  });

  it('plan som ikke har startet: viser de første ukene og sier fra', () => {
    const w = resolveWindow(rule({ length: { weeks: 8 } }), p, '2025-06-10');
    expect(toIso(w.start)).toBe('2025-12-29'); // mandagen i uken 1. januar ligger i
    expect(w.weeks).toBe(8);
    expect(w.note).toMatch(/Planen starter uke 1 2026\. Viser de første 8 ukene\./);
  });

  it('plan som er avsluttet: viser de siste ukene', () => {
    const w = resolveWindow(rule(), p, '2027-05-01');
    expect(toIso(w.end)).toBe('2027-01-04');
    expect(w.weeks).toBe(3);
    expect(w.note).toMatch(/Planen sluttet uke 53/);
  });

  it('perioden kuttes ved planens slutt', () => {
    const w = resolveWindow(rule({ length: { weeks: 8 } }), p, '2026-12-14');
    expect(toIso(w.end)).toBe('2027-01-04');
    expect(w.weeks).toBe(3);
    expect(w.note).toMatch(/Planen slutter/);
  });

  it('ISO-uke 1 kan starte i desember', () => {
    expect(toIso(isoWeekMonday(2026, 1))).toBe('2025-12-29');
    expect(toIso(isoWeekMonday(2027, 1))).toBe('2027-01-04');
  });

  it('dagens dato er lokal dato', () => {
    expect(todayIso(new Date(2026, 10, 8, 23, 30))).toBe('2026-11-08');
  });
});

describe('utkikk: tegning', () => {
  it('bokser utenfor er borte, delvis utenfor kuttes ved kanten, tomme lanes skjules', () => {
    const p = testplan();
    const { plan } = applyLookahead(p, rule(), '2026-11-08');
    expect(plan.plan.calendar).toMatchObject({ mode: 'week', start: '2026-11-02', end: '2026-11-22' });
    expect(plan.lanes.filter((l) => !l.hidden).map((l) => l.id)).toEqual(['2', '4']);
    const L = computeLayout(plan, { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: true }, approxMeasure);
    const ids = L.items.map((i) => i.id).sort();
    expect(ids).toEqual(['2_1', '4_1', '4_2']);
    const long = L.items.find((i) => i.id === '2_1') as BoxItem;
    // Startet lenge før perioden: pil mot venstre og starter ved kanten av planen
    expect(long.arrowLeft).toBe(true);
    expect(long.x0).toBeCloseTo(L.plot.x0);
    // Tre ukekolonner
    expect(L.calendarTop.length).toBeGreaterThan(0);
    // Den ekte planen er uendret
    expect(p.plan.calendar.mode).toBe('month');
    expect(p.lanes.every((l) => !l.hidden)).toBe(true);
  });

  it('tomme lanes beholdes når det er valgt', () => {
    const { plan } = applyLookahead(testplan(), rule({ hideEmptyLanes: false }), '2026-11-08');
    expect(plan.lanes.every((l) => !l.hidden)).toBe(true);
  });

  it('festet plass og fast lanehøyde brukes ikke i utkikken', () => {
    const p = testplan();
    p.lanes[1].height = 20;
    p.lanes[1].boxes[0].top = 6;
    const { plan } = applyLookahead(p, rule(), '2026-11-08');
    expect(plan.lanes[1].height).toBeUndefined();
    expect(plan.lanes[1].boxes[0].top).toBeUndefined();
    expect(p.lanes[1].boxes[0].top).toBe(6);
  });

  it('festet plass beholdes i en lane med overskriftsboks i perioden', () => {
    const p = testplan();
    p.lanes[1].boxes[0].header = true;
    p.lanes[1].boxes[0].top = 0;
    const { plan } = applyLookahead(p, rule(), '2026-11-08');
    expect(plan.lanes[1].boxes[0].top).toBe(0);
  });

  it('overskriften får perioden', () => {
    const { plan } = applyLookahead(testplan(), rule(), '2026-11-08');
    expect(plan.plan.layout.title).toBe('Eksempelplan – utkikk uke 45–47 2026');
  });
});

describe('utkikk: lagres i arbeidsfilen', () => {
  it('gyldig regel leses, ugyldig avvises', () => {
    expect(readLookahead(rule({ from: { year: 2026, week: 53 } }))).toBeTruthy();
    expect(readLookahead(rule({ from: { year: 2025, week: 53 } }))).toBeNull();
    expect(readLookahead({ ...rule(), length: { weeks: 0 } })).toBeNull();
    const p = testplan();
    p.plan.layout.lookahead = rule({ length: { year: 2027, week: 2 } });
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
    (p.plan.layout as Record<string, unknown>).lookahead = { on: 'ja' };
    expect(validatePlan(JSON.stringify(p)).errors.join()).toMatch(/lookahead/);
  });
});

describe('utkikk: tillegg', () => {
  it('neste milepæler etter perioden, med uke', () => {
    const v = applyLookahead(testplan(), rule(), '2026-11-08');
    // Perioden er uke 45–47; milepælen 14.12.2026 er i uke 51
    expect(v.extras.upcoming).toEqual(['Incididuntutla uke 51']);
  });

  it('miniatyren viser hele planen med perioden markert', () => {
    const p = testplan();
    const v = applyLookahead(p, rule(), '2026-11-08');
    expect(v.extras.overview!.lanes).toBe(5);
    expect(v.extras.overview!.bars.length).toBe(11);
    const L = computeLayout(v.plan, { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: true, lookahead: v.extras }, approxMeasure);
    expect(L.overview).not.toBeNull();
    const o = L.overview!;
    expect(o.window.x0).toBeGreaterThan(o.x0 + (o.x1 - o.x0) * 0.8);
    expect(o.y0).toBeGreaterThan(L.plot.y1);
    expect(L.legend[0].y).toBeGreaterThan(o.y1);
    expect(o.upcoming?.lines[0]).toMatch(/^Neste milepæler: Incididuntutla uke 51/);
  });
});

describe('utkikk: datafanen', () => {
  it('sier om boksen starter, slutter eller pågår i perioden', async () => {
    const { planRows, columnsFor } = await import('../data/rows');
    const rows = planRows(testplan(), { start: '2026-11-02', end: '2026-11-22' });
    const by = Object.fromEntries(rows.map((r) => [r.id, r.period]));
    expect(by['2_1']).toBe('Pågår');
    expect(by['4_1']).toBe('Slutter');
    expect(by['4_2']).toBe('Pågår');
    expect(by['1_1']).toBe('');
    expect(rows.filter((r) => r.inWindow).map((r) => r.id).sort()).toEqual(['2_1', '4_1', '4_2']);
    expect(columnsFor(null).some((c) => c.key === 'period')).toBe(false);
    const cols = columnsFor({ start: '', end: '' }).map((c) => c.key);
    expect(cols.indexOf('period')).toBe(cols.indexOf('finish') + 1);
  });
});

describe('utkikk: miniatyren kan slås av', () => {
  it('uten miniatyr står bare milepælslinjen igjen, og forklaringen flytter opp', () => {
    const on = applyLookahead(testplan(), rule(), '2026-11-08');
    const off = applyLookahead(testplan(), rule({ showOverview: false }), '2026-11-08');
    expect(off.extras.overview).toBeNull();
    const o = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: true };
    const Lon = computeLayout(on.plan, { ...o, lookahead: on.extras }, approxMeasure);
    const Loff = computeLayout(off.plan, { ...o, lookahead: off.extras }, approxMeasure);
    expect(Loff.overview).toBeNull();
    expect(Loff.upcoming?.lines[0]).toMatch(/^Neste milepæler/);
    expect(Loff.legend[0].y).toBeLessThan(Lon.legend[0].y);
    expect(readLookahead(rule({ showOverview: false }))?.showOverview).toBe(false);
  });
});
