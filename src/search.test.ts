import { describe, expect, it } from 'vitest';
import { findMatches, matchingLanes } from './search';
import { testplan } from './test/testplaner';

describe('søk i planen', () => {
  it('finner bokser på tekst, aktivitet og fag, uten hensyn til store bokstaver', () => {
    const p = testplan();
    const b = p.lanes[0].boxes[0];
    expect(findMatches(p, b.text.toUpperCase())).toContain(b.id);
    const task = p.tasks.find((t) => t.uid === b.taskIds[0])!;
    expect(findMatches(p, task.name)).toContain(b.id);
    expect(findMatches(p, b.resolved!.trade)).toContain(b.id);
    expect(findMatches(p, '   ')).toEqual([]);
    expect(findMatches(p, 'finnesikkeiplanen')).toEqual([]);
  });

  it('hopper over skjulte bokser og lanes', () => {
    const p = testplan();
    const b = p.lanes[0].boxes[0];
    b.hidden = true;
    expect(findMatches(p, b.text)).not.toContain(b.id);
    const c = p.lanes[1].boxes[0];
    p.lanes[1].hidden = true;
    expect(findMatches(p, c.text)).not.toContain(c.id);
  });

  it('lanenavnet snevrer inn, men gjør ikke hele lanen til treff', () => {
    const p = testplan();
    // Lane 2 heter «Iduntutlabore»; boksen 2_3 har faget Betong
    expect(findMatches(p, 'Secteturadip')).toEqual([]);
    expect(matchingLanes(p, 'secteturadip')).toEqual(['Secteturadip']);
    expect(findMatches(p, 'Secteturadip sumdolo')).toEqual(['5_2']);
    expect(findMatches(p, 'Iduntutlabore betong')).toEqual(['2_3']);
    // Ordet står i en aktivitet i boksen, så den er et ekte treff
    expect(findMatches(p, 'Iduntutlabore')).toEqual(['1_2']);
    expect(findMatches(p, 'betong').sort()).toEqual(['2_3', '3_1', '3_3']);
  });
});
