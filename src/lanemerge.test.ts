import { describe, expect, it } from 'vitest';
import { homeLane, mergedInto, mergeLanes, splitLane } from './lanemerge';
import { mergePlans } from './merge';
import { moveBox, newBox, newLane, removeLane, resetBoxInPlan, resetLane } from './editmodel';
import { validatePlan } from './format/validate';
import { testplan } from './test/testplaner';

type Plan = ReturnType<typeof testplan>;
const lane = (p: Plan, id: string) => p.lanes.find((l) => l.id === id)!;
const laneOf = (p: Plan, id: string) => p.lanes.find((l) => l.boxes.some((b) => b.id === id))?.id;
const box = (p: Plan, id: string) => p.lanes.flatMap((l) => l.boxes).find((b) => b.id === id)!;

describe('slå sammen lanes', () => {
  it('flytter bokser og milepæler, og skjuler lanen fra Project', () => {
    const p = testplan();
    const moved = mergeLanes(p, '3', '1')!;
    expect(moved.map((b) => b.id)).toEqual(['3_1', '3_2', '3_3']);
    expect(lane(p, '1').boxes.map((b) => b.id)).toEqual(['1_1', '1_2', '1_3', '3_1', '3_2', '3_3']);
    expect(lane(p, '3').boxes).toEqual([]);
    expect(lane(p, '3').hidden).toBe(true);
    expect(lane(p, '3').mergedInto).toBe('1');
    expect(box(p, '3_3').fromLane).toBe('3');
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
  });

  it('sletter en lane laget i appen; bokser flyttet dit beholder lanen de kom fra', () => {
    const p = testplan();
    const l = newLane(p, '2');
    newBox(p, l.id, '2026-02-01', '2026-03-01');
    moveBox(p, '1_1', l.id);
    mergeLanes(p, l.id, '4');
    expect(p.lanes.some((x) => x.id === l.id)).toBe(false);
    expect(laneOf(p, '1_1')).toBe('4');
    expect(box(p, '1_1').fromLane).toBe('1');
  });

  it('sletting av en lane laget i appen gir Project-lanen boksene tilbake', () => {
    const p = testplan();
    const l = newLane(p, '2');
    newBox(p, l.id, '2026-02-01', '2026-03-01');
    mergeLanes(p, '3', l.id);
    mergeLanes(p, '4', l.id);
    removeLane(p, l.id);
    expect(p.lanes.some((x) => x.id === l.id)).toBe(false);
    expect(lane(p, '3').boxes.map((b) => b.id)).toEqual(['3_1', '3_2', '3_3']);
    expect(lane(p, '4').boxes.map((b) => b.id)).toEqual(['4_1', '4_2']);
    for (const id of ['3', '4']) {
      expect(lane(p, id).hidden).toBeUndefined();
      expect(lane(p, id).mergedInto).toBeUndefined();
    }
    expect(box(p, '3_1').fromLane).toBeUndefined();
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
  });

  it('skiller ut igjen: lanen vises, og boksene fra Project flyttes tilbake', () => {
    const p = testplan();
    box(p, '3_1').top = 1;
    mergeLanes(p, '3', '1', 2);
    newBox(p, '1', '2026-02-01', '2026-03-01');
    moveBox(p, '3_2', '2');
    lane(p, '1').order = ['3_1', '1_1', '1_2', '1_3', '3_3'];
    expect(mergedInto(p, '1').map((l) => l.id)).toEqual(['3']);
    const back = splitLane(p, '3')!;
    expect(back.map((b) => b.id)).toEqual(['3_1', '3_3']);
    expect(lane(p, '3').boxes.map((b) => b.id)).toEqual(['3_1', '3_3']);
    expect(lane(p, '3').hidden).toBeUndefined();
    expect(lane(p, '3').mergedInto).toBeUndefined();
    expect(box(p, '3_1').fromLane).toBeUndefined();
    expect(box(p, '3_1').top).toBeUndefined();
    // Boksen som er flyttet videre, og den egne boksen, blir stående
    expect(laneOf(p, '3_2')).toBe('2');
    expect(lane(p, '1').boxes.filter((b) => b.manual)).toHaveLength(1);
    expect(lane(p, '1').order).toEqual(['1_1', '1_2', '1_3']);
    expect(mergedInto(p, '1')).toEqual([]);
    expect(splitLane(p, '3')).toBeNull();
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
  });

  it('skiller ut én av flere sammenslåtte lanes, og nye bokser fra Project følger riktig lane etterpå', () => {
    const p = testplan();
    mergeLanes(p, '3', '1');
    mergeLanes(p, '4', '1');
    splitLane(p, '3');
    expect(lane(p, '3').boxes.map((b) => b.id)).toEqual(['3_1', '3_2', '3_3']);
    expect(lane(p, '4').mergedInto).toBe('1');
    expect(laneOf(p, '4_1')).toBe('1');
    const fresh = testplan();
    const r = mergePlans(p, fresh).plan;
    expect(r.lanes.find((l) => l.id === '3')!.boxes.map((b) => b.id)).toEqual(['3_1', '3_2', '3_3']);
    expect(r.lanes.find((l) => l.id === '1')!.boxes.map((b) => b.id)).toContain('4_1');
  });

  it('festede bokser flyttes ned under innholdet, og Multi Lane-bokser følger med', () => {
    const p = testplan();
    box(p, '3_1').top = 1;
    box(p, '3_1').compactTop = 2;
    box(p, '1_1').spanTo = '3';
    box(p, '2_1').spanTo = '1';
    mergeLanes(p, '3', '4', 2.5);
    expect(box(p, '3_1').top).toBe(3.5);
    expect(box(p, '3_1').compactTop).toBeUndefined();
    expect(box(p, '1_1').spanTo).toBe('4');
    mergeLanes(p, '1', '2');
    // Lanen den gikk ned til, er nå dens egen
    expect(box(p, '2_1').spanTo).toBeUndefined();
  });

  it('flere sammenslåinger etter hverandre peker til siste lane', () => {
    const p = testplan();
    mergeLanes(p, '1', '2');
    mergeLanes(p, '2', '3');
    expect(lane(p, '1').mergedInto).toBe('3');
    expect(homeLane(p, '1')!.id).toBe('3');
  });

  it('tilbakestilt boks blir i lanen den er slått sammen til', () => {
    const p = testplan();
    mergeLanes(p, '1', '2');
    box(p, '1_1').fill = '#FF0000';
    resetBoxInPlan(p, '1_1');
    expect(laneOf(p, '1_1')).toBe('2');
    // Og slettes en egen lane med boksen i, havner den der også
    const l = newLane(p, '2');
    moveBox(p, '1_2', l.id);
    removeLane(p, l.id);
    expect(laneOf(p, '1_2')).toBe('2');
  });

  it('tilbakestill alt (lanene først) opphever sammenslåingen', () => {
    const p = testplan();
    mergeLanes(p, '1', '2');
    p.lanes.forEach(resetLane);
    for (const id of ['1_1', '1_2', '1_3']) resetBoxInPlan(p, id);
    expect(lane(p, '1').hidden).toBeUndefined();
    expect(lane(p, '1').boxes.map((b) => b.id)).toEqual(['1_1', '1_2', '1_3']);
  });

  it('går ikke med seg selv eller en lane som ikke finnes', () => {
    const p = testplan();
    expect(mergeLanes(p, '1', '1')).toBeNull();
    expect(mergeLanes(p, '1', 'x')).toBeNull();
  });
});

describe('sammenslåtte lanes ved «Oppdater fra Project»', () => {
  it('sammenslåingen holder, og nye bokser i lanen havner i lanen den er slått sammen med', () => {
    const work = testplan();
    mergeLanes(work, '3', '1');
    const fresh = testplan();
    const extra = structuredClone(box(fresh, '3_1'));
    Object.assign(extra, { id: '3_9', text: 'Ny i Project', taskIds: [999] });
    fresh.lanes[2].boxes.push(extra);
    const { plan, report } = mergePlans(work, fresh);
    expect(lane(plan, '3').hidden).toBe(true);
    expect(lane(plan, '3').mergedInto).toBe('1');
    expect(lane(plan, '3').boxes).toEqual([]);
    for (const id of ['3_1', '3_2', '3_3', '3_9']) expect(laneOf(plan, id)).toBe('1');
    expect(report.moveDropped).toEqual([]);
    expect(report.unmerged).toEqual([]);
    expect(validatePlan(JSON.stringify(plan)).errors).toEqual([]);
  });

  it('er lanen den ble slått sammen med borte fra Project, vises lanen igjen', () => {
    const work = testplan();
    mergeLanes(work, '3', '1');
    const fresh = testplan();
    fresh.lanes.splice(0, 1);
    const { plan, report } = mergePlans(work, fresh);
    expect(lane(plan, '3').hidden).toBeUndefined();
    expect(lane(plan, '3').mergedInto).toBeUndefined();
    expect(laneOf(plan, '3_1')).toBe('3');
    expect(report.unmerged).toHaveLength(1);
  });

  it('slått sammen med en lane laget i appen', () => {
    const work = testplan();
    const l = newLane(work, '5');
    mergeLanes(work, '2', l.id);
    const { plan } = mergePlans(work, testplan());
    for (const id of ['2_1', '2_2', '2_3']) expect(laneOf(plan, id)).toBe(l.id);
  });
});
