import { describe, expect, it } from 'vitest';
import { copyBox, isEdited, laneOf, moveBox, newBox, removeBox, resetBox, resetBoxInPlan } from './editor';
import { validatePlan } from './format/validate';
import { computeLayout } from './layout/layout';
import { approxMeasure } from './layout/text';
import { testplan } from './test/testplaner';

describe('tilbakestill boks', () => {
  it('fjerner overstyringer og setter tekst og rotasjon tilbake', () => {
    const b = testplan().lanes[0].boxes[0];
    const text = b.text;
    expect(isEdited(b)).toBe(false);
    Object.assign(b, { original: { text, rotation: b.rotation }, text: 'Ny tekst', rotation: 90, fill: '#FF0000', textColor: '#FFFFFF', callout: 'on', calloutSide: 'left' });
    expect(isEdited(b)).toBe(true);
    resetBox(b);
    expect(b.text).toBe(text);
    expect(b.rotation).toBe(0);
    expect(isEdited(b)).toBe(false);
    expect('fill' in b || 'callout' in b || 'original' in b).toBe(false);
  });
});

describe('nye, kopierte, flyttede og skjulte bokser', () => {
  it('flytter til en annen lane og tilbake ved tilbakestilling', () => {
    const p = testplan();
    moveBox(p, '1_1', '3');
    expect(laneOf(p, '1_1')!.id).toBe('3');
    const b = p.lanes[2].boxes.find((x) => x.id === '1_1')!;
    expect(b.fromLane).toBe('1');
    expect(isEdited(b)).toBe(true);
    resetBoxInPlan(p, '1_1');
    expect(laneOf(p, '1_1')!.id).toBe('1');
    expect(b.fromLane).toBeUndefined();
  });
  it('kopi er laget i appen, med ny id, uten aktiviteter, rett etter originalen', () => {
    const p = testplan();
    const c = copyBox(p, '2_1')!;
    expect(c.id).not.toBe('2_1');
    expect(c.manual).toBe(true);
    expect(c.taskIds).toEqual([]);
    expect(p.lanes[1].boxes[1]).toBe(c);
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
  });
  it('bokser fra Project skjules, bokser fra appen slettes', () => {
    const p = testplan();
    removeBox(p, '1_1');
    expect(p.lanes[0].boxes[0].hidden).toBe(true);
    const n = newBox(p, '1', '2026-05-01', '2026-05-30')!;
    removeBox(p, n.id);
    expect(laneOf(p, n.id)).toBeNull();
  });
  it('ny boks tegnes, skjult boks tegnes ikke', () => {
    const p = testplan();
    const n = newBox(p, '1', '2026-05-01', '2026-05-30')!;
    removeBox(p, '1_1');
    const L = computeLayout(p, { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: false }, approxMeasure);
    expect(L.items.some((i) => i.id === n.id)).toBe(true);
    expect(L.items.some((i) => i.id === '1_1')).toBe(false);
    expect(L.dateAt(L.plot.x0)).toBe('2026-01-01');
  });
});
