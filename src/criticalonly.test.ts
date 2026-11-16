import { describe, expect, it } from 'vitest';
import { criticalIds, criticalKeep, shownImages, shownItems } from './criticalonly';
import type { Item } from './layout/layout';
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
  it('symbolbildet til en skjult milepæl tas ikke med, andre bilder blir stående', () => {
    const images = [{ id: 'a', milestone: null }, { id: 'b', milestone: '3_3' }, { id: 'c', milestone: '5_1' }];
    expect(shownImages(images, new Set(['3_3'])).map((i) => i.id)).toEqual(['a', 'b']);
  });
  it('viser alt når filteret er av', () => {
    const all = testplan().lanes.flatMap((l) => l.boxes);
    expect(shownItems(all, null)).toHaveLength(all.length);
  });
});

describe('overskriftsbokser', () => {
  const box = (id: string, x0: number, x1: number, y: number, h: number, header = false) =>
    ({ kind: 'box', id, x0, x1, y, h, header }) as unknown as Item;
  it('tar med overskriftsboksen en kritisk boks ligger i, bare når valget er på', () => {
    const p = testplan();
    const all = p.lanes.flatMap((l) => l.boxes);
    all[0].critical = true;
    const items = [box('H1', 0, 100, 0, 30, true), box('H2', 200, 300, 0, 30, true), box(all[0].id, 10, 40, 5, 5), box(all[1].id, 210, 240, 5, 5)];
    expect([...criticalKeep(p, items, true)].sort()).toEqual([all[0].id, 'H1'].sort());
    expect([...criticalKeep(p, items, false)]).toEqual([all[0].id]);
  });
});
