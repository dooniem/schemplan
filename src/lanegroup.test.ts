import { describe, expect, it } from 'vitest';
import { createLaneGroup, dissolveLaneGroup, groupLanes, groupOfLane, groupRuns, growLaneGroup, removeFromLaneGroup, settleLaneGroups } from './lanegroup';
import { moveLane, newLane, removeLane } from './editmodel';
import { mergePlans } from './merge';
import { validatePlan } from './format/validate';
import { computeLayout } from './layout/layout';
import { approxMeasure } from './layout/text';
import { testplan } from './test/testplaner';

const groups = (p: ReturnType<typeof testplan>) => (p.plan.layout.laneGroups ?? []).map((g) => g.lanes);

describe('grupper av lanes', () => {
  it('grupperer lanene fra den ene til den andre, også de imellom', () => {
    const p = testplan();
    const g = groupLanes(p, '4', '2')!;
    expect(g.lanes).toEqual(['2', '3', '4']);
    expect(g.name).toBe('Gruppe');
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
  });

  it('utvider gruppen når lanen alt er i en gruppe, og tar lanene ut av andre grupper', () => {
    const p = testplan();
    createLaneGroup(p, '1', '2');
    createLaneGroup(p, '4', '5');
    groupLanes(p, '2', '4');
    expect(groups(p)).toEqual([['1', '2', '3', '4'], ['5']]);
    expect(growLaneGroup(p, groupOfLane(p, '1')!.id, 1)).toBe(true);
    expect(groups(p)).toEqual([['1', '2', '3', '4', '5']]);
    expect(growLaneGroup(p, groupOfLane(p, '1')!.id, 1)).toBe(false);
  });

  it('tar en lane ut; midt i gruppen deles den i to med samme tekst og farge', () => {
    const p = testplan();
    const g = createLaneGroup(p, '1', '4')!;
    g.name = 'Bygg A';
    g.fill = '#BEE5B0';
    removeFromLaneGroup(p, '1');
    expect(groups(p)).toEqual([['2', '3', '4']]);
    removeFromLaneGroup(p, '3');
    expect(groups(p)).toEqual([['2'], ['4']]);
    expect(p.plan.layout.laneGroups!.every((x) => x.name === 'Bygg A' && x.fill === '#BEE5B0')).toBe(true);
    dissolveLaneGroup(p, groupOfLane(p, '2')!.id);
    dissolveLaneGroup(p, groupOfLane(p, '4')!.id);
    expect(p.plan.layout.laneGroups).toBeUndefined();
  });

  it('en lane flyttet ut av gruppen går ut; en ny lane midt i gruppen blir med', () => {
    const p = testplan();
    createLaneGroup(p, '2', '4');
    moveLane(p, '2', 4);
    settleLaneGroups(p, '2');
    expect(groups(p)).toEqual([['3', '4']]);
    const l = newLane(p, '3');
    settleLaneGroups(p, l.id);
    expect(groups(p)).toEqual([['3', '4', l.id]]);
    removeLane(p, l.id);
    settleLaneGroups(p, '3');
    expect(groups(p)).toEqual([['3', '4']]);
  });

  it('barene følger lanene som vises etter hverandre', () => {
    const p = testplan();
    const g = createLaneGroup(p, '1', '3')!;
    expect(groupRuns([g], ['1', '2', '3', '4']).map((r) => [r.start, r.end])).toEqual([[0, 2]]);
    expect(groupRuns([g], ['1', '4', '2', '3']).map((r) => [r.start, r.end])).toEqual([[0, 0], [2, 3]]);
  });

  it('overlever «Oppdater fra Project»', () => {
    const work = testplan();
    createLaneGroup(work, '2', '3');
    const { plan } = mergePlans(work, testplan());
    expect(groups(plan)).toEqual([['2', '3']]);
  });

  it('baren tar plass fra lane-navnene, og kolonnen blir ikke bredere', () => {
    const opts = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 9, fitToSheet: false };
    const before = computeLayout(testplan(), opts, approxMeasure);
    const p = testplan();
    createLaneGroup(p, '2', '3')!.name = 'Bygg A';
    const L = computeLayout(p, opts, approxMeasure);
    expect(L.plot.x0).toBeCloseTo(before.plot.x0);
    expect(L.laneGroups).toHaveLength(1);
    const bar = L.laneGroups[0];
    const [l2, l3] = [L.lanes[1], L.lanes[2]];
    expect(bar.y0).toBeCloseTo(l2.y0);
    expect(bar.y1).toBeCloseTo(l3.y1);
    expect(bar.x1 - bar.x0).toBeLessThan((L.plot.x0 - L.laneTitleX) / 3 + 1e-6);
    expect(l2.titleX0).toBeCloseTo(bar.x1);
    expect(L.lanes[0].titleX0).toBeCloseTo(L.laneTitleX);
    expect(bar.title.rotate).toBe(-90);
  });

  it('lanene blir høye nok til teksten i baren', () => {
    const opts = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: false };
    const p = testplan();
    createLaneGroup(p, '5', '5')!.name = 'En veldig lang tekst i gruppebaren som trenger plass';
    const L = computeLayout(p, opts, approxMeasure);
    const bar = L.laneGroups[0];
    const len = approxMeasure(bar.title.lines[0], bar.title.size, true);
    expect(bar.y1 - bar.y0).toBeGreaterThan(len);
  });
});
