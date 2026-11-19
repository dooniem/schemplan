import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GROUPS, TOPICS, TOUR, type HelpImage } from './content';
import { searchTopics } from './help';

const names = (img?: HelpImage) => (!img ? [] : typeof img === 'string' ? [img] : img.frames.map((f) => f.img));
const fil = (n: string) => new URL(`./img/${n}.webp`, import.meta.url);

describe('hjelpen', () => {
  it('har bilde for alle steg og emner som viser ett', () => {
    for (const x of [...TOUR, ...TOPICS]) for (const n of names(x.img)) expect(existsSync(fil(n)), n).toBe(true);
  });
  it('lenker bare til emner som finnes', () => {
    const ids = new Set(TOPICS.map((t) => t.id));
    expect(ids.size).toBe(TOPICS.length);
    for (const s of TOUR) expect(ids.has(s.topic), s.topic).toBe(true);
    for (const t of TOPICS) for (const s of t.see ?? []) expect(ids.has(s), `${t.id} → ${s}`).toBe(true);
    for (const t of TOPICS) expect(GROUPS).toContain(t.group);
  });
  it('har 6–8 steg i «Kom i gang»', () => {
    expect(TOUR.length).toBeGreaterThanOrEqual(6);
    expect(TOUR.length).toBeLessThanOrEqual(8);
  });
  it('søker i tittel, tekst og søkeord, med treff i tittelen først', () => {
    expect(searchTopics('')).toHaveLength(TOPICS.length);
    expect(searchTopics('kritisk')[0].id).toBe('kritisk');
    expect(searchTopics('excel').map((t) => t.id)).toContain('data');
    expect(searchTopics('KRITISK linje')[0].id).toBe('kritisk');
    expect(searchTopics('ordsomikkefinnes')).toHaveLength(0);
    expect(searchTopics('ctrl skyv')[0].id).toBe('skyv');
    expect(searchTopics('tettest').map((t) => t.id)).toContain('omplasser');
    expect(searchTopics('samle fag').map((t) => t.id)).toContain('omplasser');
    expect(searchTopics('trapp').map((t) => t.id)).toContain('omplasser');
  });
  it('ser bort fra HTML i teksten', () => {
    expect(searchTopics('span')).toHaveLength(0);
    expect(searchTopics('kbd')).toHaveLength(0);
  });
});
