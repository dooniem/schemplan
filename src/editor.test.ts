import { describe, expect, it } from 'vitest';
import { copyBox, pasteBoxes, isEdited, isLaneEdited, keepLaneOriginal, laneOf, moveBox, moveLane, newBox, newLane, removeBox, removeLane, resetBox, resetBoxInPlan, resetLane } from './editor';
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

describe('lanes i appen', () => {
  it('ny lane kommer rett under, og kan flyttes og slettes', () => {
    const p = testplan();
    const first = p.lanes[0].id;
    const l = newLane(p, first);
    expect(p.lanes[1]).toBe(l);
    expect(l.manual).toBe(true);
    expect(isLaneEdited(l)).toBe(true);
    moveLane(p, l.id, 0);
    expect(p.lanes[0]).toBe(l);
    // En boks fra Project flyttet inn i den nye lanen går tilbake når lanen slettes
    const b = p.lanes[1].boxes[0];
    moveBox(p, b.id, l.id);
    newBox(p, l.id, '2026-02-01', '2026-02-20');
    removeLane(p, l.id);
    expect(p.lanes.some((x) => x.id === l.id)).toBe(false);
    expect(laneOf(p, b.id)!.id).toBe(first);
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
  });

  it('lane fra Project skjules, og nytt navn og farge kan tilbakestilles', () => {
    const p = testplan();
    const l = p.lanes[1];
    const name = l.name;
    keepLaneOriginal(l);
    l.name = 'Nytt navn';
    l.fill = '#8DCDF8';
    removeLane(p, l.id);
    expect(l.hidden).toBe(true);
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
    const L = computeLayout(p, { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true }, approxMeasure);
    expect(L.lanes.some((x) => x.id === l.id)).toBe(false);
    resetLane(l);
    expect(l.name).toBe(name);
    expect(l.fill).toBe(null);
    expect(isLaneEdited(l)).toBe(false);
  });
});

describe('milepæler i appen', () => {
  it('utseende fra appen går foran Project og følger med ved oppdatering', async () => {
    const { mergePlans } = await import('./merge');
    const p = testplan();
    const ms = p.lanes.flatMap((l) => l.boxes).find((b) => b.resolved?.isMilestone)!;
    expect(ms).toBeTruthy();
    ms.milestoneStyle = { symbol: 'flag', color: 'red', verticalLine: true };
    expect(isEdited(ms)).toBe(true);
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
    const L = computeLayout(p, { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true }, approxMeasure);
    const it = L.items.find((i) => i.id === ms.id)!;
    expect(it.kind === 'milestone' && it.symbol === 'flag' && it.color === '#FF0000' && it.verticalLine).toBe(true);
    const merged = mergePlans(p, testplan()).plan.lanes.flatMap((l) => l.boxes).find((b) => b.id === ms.id)!;
    expect(merged.milestoneStyle).toEqual(ms.milestoneStyle);
    resetBox(ms);
    expect(ms.milestoneStyle).toBeUndefined();
  });
});

describe('fagfarger i appen', () => {
  it('farge for et fag gjelder alle boksene uten egen farge og følger med ved oppdatering', async () => {
    const { mergePlans } = await import('./merge');
    const p = testplan();
    const opts = { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true } as const;
    const boxes = p.lanes.flatMap((l) => l.boxes).filter((b) => b.resolved?.trade === 'Betong' && !b.resolved.isMilestone);
    expect(boxes.length).toBeGreaterThan(0);
    boxes[0].fill = '#123456';
    p.plan.layout.tradeColors = { Betong: { fill: '#8DCDF8' } };
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
    const L = computeLayout(p, opts, approxMeasure);
    const fills = boxes.map((b) => { const it = L.items.find((i) => i.id === b.id); return it?.kind === 'box' ? it.fill : null; });
    expect(fills[0]).toBe('#123456');
    if (fills.length > 1) expect(fills[1]).toBe('#8DCDF8');
    expect(L.legend.find((e) => e.trade === 'Betong')?.fill).toBe('#8DCDF8');
    expect(mergePlans(p, testplan()).plan.plan.layout.tradeColors).toEqual({ Betong: { fill: '#8DCDF8' } });
  });
});

describe('kopier og lim inn', () => {
  it('limer inn en kopi i valgt lane, laget i appen', () => {
    const p = testplan();
    const src = p.lanes[0].boxes[0];
    const made = pasteBoxes(p, [{ box: structuredClone(src), lane: '1' }], '3');
    expect(made).toHaveLength(1);
    expect(laneOf(p, made[0].id)!.id).toBe('3');
    expect(made[0].manual).toBe(true);
    expect(made[0].taskIds).toEqual([]);
    expect(made[0].text).toBe(src.text);
    // Uten lane: tilbake i lanen den kom fra
    const back = pasteBoxes(p, [{ box: structuredClone(src), lane: '1' }], null);
    expect(laneOf(p, back[0].id)!.id).toBe('1');
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
  });
});
