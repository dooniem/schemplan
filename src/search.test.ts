import { describe, expect, it } from 'vitest';
import { findMatches } from './search';
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
});
