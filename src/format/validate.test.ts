import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { summarize, validatePlan } from './validate';
import { parseBoxText } from './text';

const example = readFileSync(new URL('../../examples/eksempelplan.json', import.meta.url), 'utf8');
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

  it('varsler om boks som Excel hopper over i ukesvisning', () => {
    const p = clone();
    p.plan.calendar.mode = 'week';
    p.plan.calendar.start = '2026-03-02';
    const r = validatePlan(p);
    expect(r.warnings.some((w) => w.includes('Excel tegner den ikke'))).toBe(true);
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

  it('varsler om aktiviteter som mangler', () => {
    const p = clone();
    p.lanes[0].boxes[0].taskIds.push(9999);
    expect(validatePlan(p).warnings.some((w) => w.includes('9999'))).toBe(true);
  });
});

describe('parseBoxText', () => {
  it('tolker linjeskift, escape og tvunget callout', () => {
    expect(parseBoxText('A|B')).toEqual({ lines: ['A', 'B'], forcedCallout: false });
    expect(parseBoxText('*A/|B')).toEqual({ lines: ['A|B'], forcedCallout: true });
  });
});
