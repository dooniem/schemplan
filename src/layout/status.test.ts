import { describe, expect, it } from 'vitest';
import { testplan } from '../test/testplaner';
import { validatePlan } from '../format/validate';
import { mergePlans } from '../merge';
import { readStatusLine, resolveStatus, STATUS_DEFAULT, statusHelp } from './status';
import { applyLookahead, LOOKAHEAD_DEFAULT } from './lookahead';
import { computeLayout } from './layout';
import { buildTimeAxis } from './calendar';
import { parseIso, toIso } from './dates';
import { approxMeasure } from './text';

const on = (r = {}) => ({ ...STATUS_DEFAULT, on: true, ...r });
const O = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: true };

describe('statuslinje: dato', () => {
  it('mandag denne uken: starten av mandagen', () => {
    const m = resolveStatus(on(), testplan(), '2026-11-12')!;
    expect(m).toMatchObject({ day: '2026-11-09', endOfDay: false });
    expect(statusHelp(on(), m)).toMatch(/starten av mandag 9\.11/);
  });

  it('statusdato fra Project: slutten av dagen', () => {
    const p = testplan();
    p.plan.statusDate = '2026-11-06';
    const m = resolveStatus(on({ source: 'project' }), p, '2026-11-12')!;
    expect(m).toMatchObject({ day: '2026-11-06', endOfDay: true });
    expect(toIso(m.t)).toBe('2026-11-07');
    expect(statusHelp(on({ source: 'project' }), m)).toMatch(/slutten av fredag 6\.11/);
  });

  it('uten statusdato, eller med «NA» fra Project, er valget ikke mulig, og planen er fortsatt gyldig', () => {
    const p = testplan();
    expect(resolveStatus(on({ source: 'project' }), p, '2026-11-12')).toBeNull();
    (p.plan as unknown as Record<string, unknown>).statusDate = 'NA';
    expect(resolveStatus(on({ source: 'project' }), p, '2026-11-12')).toBeNull();
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
    expect(statusHelp(on({ source: 'project' }), null)).toMatch(/ingen statusdato/);
  });

  it('egendefinert dag', () => {
    expect(resolveStatus(on({ source: 'custom', date: '2026-10-14' }), testplan(), '2026-11-12')).toMatchObject({ day: '2026-10-14', endOfDay: false });
  });
});

describe('statuslinje: tegning', () => {
  it('slutten av fredag og starten av mandag er samme sted i ukesvisning', () => {
    const cal = { ...testplan().plan.calendar, mode: 'week' as const };
    const a = buildTimeAxis(cal, 0, 500);
    expect(a.xEnd(parseIso('2026-11-06'))).toBeCloseTo(a.xStart(parseIso('2026-11-09')));
  });

  it('streken går gjennom planen, med lapp øverst', () => {
    const p = testplan();
    const m = resolveStatus(on(), p, '2026-11-12')!;
    const L = computeLayout(p, { ...O, status: { moment: m, style: on() } }, approxMeasure);
    expect(L.status).not.toBeNull();
    expect(L.status!.y0).toBeCloseTo(L.plot.y0);
    expect(L.status!.tag!.y + L.status!.tag!.h).toBeCloseTo(L.plot.y0);
    expect(L.status!.y1).toBeCloseTo(L.plot.y1);
    expect(L.status!.x).toBeGreaterThan(L.plot.x0);
    expect(L.status!.tag?.text.lines).toEqual(['Status 9.11']);
    const noTag = computeLayout(p, { ...O, status: { moment: m, style: on({ label: false }) } }, approxMeasure);
    expect(noTag.status!.tag).toBeNull();
    expect(computeLayout(p, O, approxMeasure).status).toBeNull();
  });

  it('utenfor kalenderen tegnes ingenting', () => {
    const p = testplan();
    const m = resolveStatus(on({ source: 'custom', date: '2030-01-01' }), p, '2026-11-12')!;
    expect(computeLayout(p, { ...O, status: { moment: m, style: on() } }, approxMeasure).status).toBeNull();
  });
});

describe('statuslinje: utkikk og arbeidsfil', () => {
  it('utkikken kan starte i uken med statuslinjen', () => {
    const v = applyLookahead(testplan(), { ...LOOKAHEAD_DEFAULT, on: true, from: 'status' }, '2026-11-12', '2026-10-14');
    expect(toIso(v.window.start)).toBe('2026-10-12');
    // Uten statuslinje: denne uken
    const w = applyLookahead(testplan(), { ...LOOKAHEAD_DEFAULT, on: true, from: 'status' }, '2026-11-12', null);
    expect(toIso(w.window.start)).toBe('2026-11-09');
  });

  it('valget lagres, leses og overlever oppdatering fra Project', () => {
    const p = testplan();
    p.plan.layout.statusLine = on({ source: 'custom', date: '2026-10-14', color: '#0050D0' });
    p.plan.layout.lookahead = { ...LOOKAHEAD_DEFAULT, from: 'status' };
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
    expect(readStatusLine({ ...on(), source: 'custom' })).toBeNull();
    expect(readStatusLine({ ...on(), width: 0 })).toBeNull();
    const merged = mergePlans(p, testplan()).plan;
    expect(merged.plan.layout.statusLine).toEqual(p.plan.layout.statusLine);
  });
});

describe('statuslinje: hjelpeteksten', () => {
  it('sier fra når datoen er utenfor planen', () => {
    const p = testplan();
    const r = on({ source: 'custom', date: '2030-01-01' });
    expect(statusHelp(r, resolveStatus(r, p, '2026-11-12'), p)).toMatch(/linjen vises ikke/);
    expect(statusHelp(on(), resolveStatus(on(), p, '2026-11-12'), p)).not.toMatch(/vises ikke/);
  });
});
