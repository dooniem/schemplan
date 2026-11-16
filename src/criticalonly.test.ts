import { describe, expect, it } from 'vitest';
import { criticalIds, shownItems } from './criticalonly';
import { testplan } from './test/testplaner';

describe('vis bare kritiske aktiviteter', () => {
  it('finner boksene i linjen og viser bare dem', () => {
    const p = testplan();
    const all = p.lanes.flatMap((l) => l.boxes);
    all[0].critical = true;
    all[2].critical = true;
    const keep = criticalIds(p);
    expect([...keep]).toEqual([all[0].id, all[2].id]);
    expect(shownItems(all, keep).map((b) => b.id)).toEqual([all[0].id, all[2].id]);
  });
  it('viser alt når filteret er av', () => {
    const all = testplan().lanes.flatMap((l) => l.boxes);
    expect(shownItems(all, null)).toHaveLength(all.length);
  });
});
