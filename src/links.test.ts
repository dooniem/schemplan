import { describe, expect, it } from 'vitest';
import { mergePlans } from './merge';
import { newBox, removeBox } from './editor';
import { applyFollows, canFollow, followersOf, setFollow } from './links';
import { testplan } from './test/testplaner';
import { validatePlan } from './format/validate';

const box = (p: ReturnType<typeof testplan>, id: string) => p.lanes.flatMap((l) => l.boxes).find((b) => b.id === id)!;

describe('egne bokser som følger en annen boks', () => {
  it('flytter seg like mange dager som sluttdatoen til boksen ved oppdatering fra Project', () => {
    const work = testplan();
    const target = box(work, '1_1');
    const own = newBox(work, work.lanes[0].id, '2026-05-04', '2026-05-15')!;
    expect(setFollow(work, own.id, target.id, 'finish')).toBe(true);
    expect(own.follows).toEqual({ box: '1_1', edge: 'finish', at: target.resolved!.finish });
    expect(validatePlan(JSON.stringify(work)).errors).toEqual([]);

    const fresh = testplan();
    const f = box(fresh, '1_1').resolved!;
    const before = new Date(`${f.finish}T00:00:00Z`);
    before.setUTCDate(before.getUTCDate() + 10);
    f.finish = before.toISOString().slice(0, 10);
    const { plan, report } = mergePlans(work, fresh);
    const moved = box(plan, own.id);
    expect(moved.resolved).toMatchObject({ start: '2026-05-14', finish: '2026-05-25' });
    expect(moved.follows!.at).toBe(f.finish);
    expect(report.followMoved).toEqual(['Ny boks']);
    // Neste oppdatering uten endring flytter ingenting
    expect(box(mergePlans(plan, fresh).plan, own.id).resolved!.start).toBe('2026-05-14');
  });

  it('følger startdatoen, også når Project har gitt boksen ny id', () => {
    const work = testplan();
    const own = newBox(work, work.lanes[0].id, '2026-05-04', '2026-05-04')!;
    setFollow(work, own.id, '2_2', 'start');
    const fresh = testplan();
    const t = box(fresh, '2_2');
    t.id = '2_9';
    const s = new Date(`${t.resolved!.start}T00:00:00Z`);
    s.setUTCDate(s.getUTCDate() - 3);
    t.resolved!.start = s.toISOString().slice(0, 10);
    const b = box(mergePlans(work, fresh).plan, own.id);
    expect(b.follows!.box).toBe('2_9');
    expect(b.resolved!.start).toBe('2026-05-01');
  });

  it('står der den sto når boksen den fulgte er borte fra Project', () => {
    const work = testplan();
    const own = newBox(work, work.lanes[0].id, '2026-05-04', '2026-05-08')!;
    setFollow(work, own.id, '1_1', 'start');
    const fresh = testplan();
    fresh.lanes.forEach((l) => (l.boxes = l.boxes.filter((b) => b.id !== '1_1')));
    const { plan, report } = mergePlans(work, fresh);
    const b = box(plan, own.id);
    expect(b.follows).toBeUndefined();
    expect(b.resolved!.start).toBe('2026-05-04');
    expect(report.followLost).toEqual(['Ny boks']);
  });

  it('kjeder flyttes i riktig rekkefølge, og ringer tillates ikke', () => {
    const plan = testplan();
    const a = newBox(plan, plan.lanes[0].id, '2026-05-04', '2026-05-08')!;
    const b = newBox(plan, plan.lanes[0].id, '2026-05-11', '2026-05-12')!;
    setFollow(plan, a.id, '1_1', 'finish');
    setFollow(plan, b.id, a.id, 'finish');
    expect(canFollow(plan, a.id, b.id)).toBe(false);
    expect(canFollow(plan, a.id, a.id)).toBe(false);
    expect(canFollow(plan, '1_1', a.id)).toBe(false); // bokser fra Project følger Project
    const t = box(plan, '1_1').resolved!;
    const d = new Date(`${t.finish}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    t.finish = d.toISOString().slice(0, 10);
    expect(applyFollows(plan)).toBe(2);
    expect(a.resolved).toMatchObject({ start: '2026-05-11', finish: '2026-05-15' });
    expect(b.resolved).toMatchObject({ start: '2026-05-18', finish: '2026-05-19' });
    expect(followersOf(plan, a.id).map((x) => x.id)).toEqual([b.id]);
  });

  it('koblingen fjernes når boksen den fulgte slettes i appen', () => {
    const plan = testplan();
    const a = newBox(plan, plan.lanes[0].id, '2026-05-04', '2026-05-08')!;
    const b = newBox(plan, plan.lanes[0].id, '2026-05-11', '2026-05-12')!;
    setFollow(plan, b.id, a.id, 'start');
    removeBox(plan, a.id);
    applyFollows(plan);
    expect(b.follows).toBeUndefined();
    expect(b.resolved!.start).toBe('2026-05-11');
  });
});
