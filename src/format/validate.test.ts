import { testplan } from '../test/testplaner';
import { describe, expect, it } from 'vitest';
import { summarize, validatePlan } from './validate';
import { parseBoxText } from './text';
import type { PlanFile } from './types';

const example = JSON.stringify(testplan());
const clone = () => JSON.parse(example);

describe('validatePlan', () => {
  it('godtar eksempelplanen', () => {
    const r = validatePlan(example);
    expect(r.errors).toEqual([]);
    expect(r.plan).not.toBeNull();
    const s = summarize(r.plan!);
    expect(s.lanes).toBe(5);
    expect(s.boxes).toBe(13);
    expect(s.milestones).toBe(2);
    expect(s.drawable).toBe(12);
  });

  it('tåler BOM først i filen', () => {
    expect(validatePlan('﻿' + example).errors).toEqual([]);
  });

  it('varsler om boks utenfor kalenderen', () => {
    const r = validatePlan(example);
    expect(r.warnings.some((w) => w.includes('helt utenfor kalenderen'))).toBe(true);
  });

  it('varsler ikke om boks som går delvis utenfor kalenderen i ukesvisning (den tegnes med pil)', () => {
    const p = clone();
    p.plan.calendar.mode = 'week';
    p.plan.calendar.start = '2026-03-02';
    const r = validatePlan(p);
    expect(r.warnings.some((w) => w.includes('ukesvisning'))).toBe(false);
  });

  it('avviser umulige datoer og start etter slutt', () => {
    const box = () => {
      const p = clone();
      return { p, b: (p as PlanFile).lanes.flatMap((l) => l.boxes).find((x) => x.resolved)! };
    };
    let t = box();
    t.b.resolved!.start = '2030-01-01';
    expect(validatePlan(t.p).errors.some((e) => e.includes('start er etter slutt'))).toBe(true);
    t = box();
    t.b.follows = { box: 'x', edge: 'finish', at: '2026-13-45' };
    expect(validatePlan(t.p).plan).toBeNull();
    const h = clone();
    h.holidays = [{ start: '2026-08-01', end: '2026-07-01' }];
    expect(validatePlan(h).plan).toBeNull();
    const z = clone();
    z.plan.layout.textSize = 0;
    expect(validatePlan(z).plan).toBeNull();
  });

  it('avviser feil filtype og ugyldig JSON', () => {
    expect(validatePlan('{"format":"noe annet"}').plan).toBeNull();
    expect(validatePlan('ikke json').errors[0]).toMatch(/ikke gyldig JSON/);
  });

  it('avviser nyere formatversjon', () => {
    const p = clone();
    p.version = 99;
    expect(validatePlan(p).errors[0]).toMatch(/v99/);
  });

  it('finner duplikate bokser og ugyldige datoer', () => {
    const p = clone();
    p.lanes[0].boxes[1].id = p.lanes[0].boxes[0].id;
    p.lanes[0].boxes[2].resolved.start = '2026-02-30';
    const r = validatePlan(p);
    expect(r.plan).toBeNull();
    expect(r.errors.some((e) => e.includes('flere ganger'))).toBe(true);
    expect(r.errors.some((e) => e.includes('ÅÅÅÅ-MM-DD'))).toBe(true);
  });

  it('godtar baseline på planen og aktivitetene, og avviser feil datoer', () => {
    const p = clone();
    p.plan.baseline = { number: 2, name: 'Baseline2', saved: '2026-10-01' };
    p.tasks[0].baselineStart = '2026-01-05';
    p.tasks[0].baselineFinish = null;
    expect(validatePlan(p).errors).toEqual([]);
    p.tasks[0].baselineStart = '05.01.2026';
    p.plan.baseline = { number: 2, name: 'Baseline2', saved: 'NA' };
    const r = validatePlan(p);
    expect(r.errors.some((e) => e.includes('baselineStart'))).toBe(true);
    expect(r.errors.some((e) => e.includes('plan.baseline.saved'))).toBe(true);
  });

  it('varsler om aktiviteter som mangler', () => {
    const p = clone();
    p.lanes[0].boxes[0].taskIds.push(9999);
    expect(validatePlan(p).warnings.some((w) => w.includes('9999'))).toBe(true);
  });
});

describe('høyde og plass valgt i appen', () => {
  it('godtar gyldige verdier og avviser ugyldige', () => {
    const ok = clone();
    ok.lanes[0].height = 12.5;
    ok.lanes[0].boxes[0].height = 3;
    ok.lanes[0].boxes[0].top = 0;
    expect(validatePlan(ok).errors).toEqual([]);
    const bad = clone() as unknown as { lanes: { height: unknown; boxes: { height: unknown; top: unknown }[] }[] };
    bad.lanes[0].height = 0;
    bad.lanes[0].boxes[0].height = 'høy';
    bad.lanes[0].boxes[0].top = -1;
    expect(validatePlan(bad as never).errors).toHaveLength(3);
  });
});

describe('parseBoxText', () => {
  it('tolker linjeskift, escape og tvunget callout', () => {
    expect(parseBoxText('A|B')).toEqual({ lines: ['A', 'B'], forcedCallout: false });
    expect(parseBoxText('*A/|B')).toEqual({ lines: ['A|B'], forcedCallout: true });
  });
});
