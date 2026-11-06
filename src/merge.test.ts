import { describe, expect, it } from 'vitest';
import { mergePlans } from './merge';
import { copyBox, moveBox } from './editor';
import { testplan } from './test/testplaner';
import { validatePlan } from './format/validate';

const box = (p: ReturnType<typeof testplan>, id: string) => p.lanes.flatMap((l) => l.boxes).find((b) => b.id === id)!;
const laneOf = (p: ReturnType<typeof testplan>, id: string) => p.lanes.find((l) => l.boxes.some((b) => b.id === id))!.id;

describe('oppdater fra Project', () => {
  it('beholder redigeringer og tar datoer fra Project', () => {
    const work = testplan();
    Object.assign(box(work, '1_1'), { fill: '#112233', height: 3, top: 1, header: true });
    work.lanes[0].height = 10;
    work.plan.layout.style = 'ny';
    const fresh = testplan();
    box(fresh, '1_1').resolved!.finish = '2026-04-30';
    const { plan, report } = mergePlans(work, fresh);
    const b = box(plan, '1_1');
    expect(b.fill).toBe('#112233');
    expect(b.height).toBe(3);
    expect(b.header).toBe(true);
    expect(b.resolved!.finish).toBe('2026-04-30');
    expect(plan.lanes[0].height).toBe(10);
    expect(plan.plan.layout.style).toBe('ny');
    expect(report.kept).toBeGreaterThan(5);
    expect(validatePlan(JSON.stringify(plan)).errors).toEqual([]);
  });

  it('finner boksen på aktivitetene selv om id-en er endret', () => {
    const work = testplan();
    box(work, '2_2').fill = '#ABCDEF';
    const fresh = testplan();
    box(fresh, '2_2').id = '2_9';
    expect(box(mergePlans(work, fresh).plan, '2_9').fill).toBe('#ABCDEF');
  });

  it('egen tekst gjelder til Project endrer teksten', () => {
    const work = testplan();
    const b = box(work, '1_1');
    b.original = { text: b.text, rotation: b.rotation };
    b.text = 'Min tekst';
    let r = mergePlans(work, testplan());
    expect(box(r.plan, '1_1').text).toBe('Min tekst');
    const fresh = testplan();
    box(fresh, '1_1').text = 'Ny fra Project';
    r = mergePlans(work, fresh);
    expect(box(r.plan, '1_1').text).toBe('Ny fra Project');
    expect(r.report.textChanged).toEqual(['Ny fra Project']);
  });

  it('nye og borte lanes og bokser, flyttede og egne bokser', () => {
    const work = testplan();
    moveBox(work, '1_1', '3');
    const copy = copyBox(work, '2_1')!;
    const fresh = testplan();
    fresh.lanes.push({ id: '9', name: 'Ny lane', fill: null, shown: true, boxes: [] });
    fresh.lanes[4].boxes.pop(); // 5_2 borte
    fresh.lanes.splice(3, 1); // lane 4 borte
    const { plan, report } = mergePlans(work, fresh);
    expect(laneOf(plan, '1_1')).toBe('3');
    expect(box(plan, '1_1').fromLane).toBe('1');
    expect(laneOf(plan, copy.id)).toBe('2');
    expect(report.newLanes).toEqual(['Ny lane']);
    expect(report.goneLanes).toEqual(['Olorsita met']);
    expect(report.goneBoxes).toContain('Sumdolo rsitamet');
    expect(report.manualKept).toBe(1);
  });

  it('Project har flyttet boksen selv: Project gjelder', () => {
    const work = testplan();
    moveBox(work, '1_1', '3');
    const fresh = testplan();
    const [b] = fresh.lanes[0].boxes.splice(0, 1);
    fresh.lanes[4].boxes.push(b);
    const { plan, report } = mergePlans(work, fresh);
    expect(laneOf(plan, '1_1')).toBe('5');
    expect(report.moveDropped).toHaveLength(1);
  });
});
