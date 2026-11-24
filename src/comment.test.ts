import { describe, expect, it } from 'vitest';
import { splitLinks, addCommentImages, COMMENT_MAX_IMAGES, commentBytes, commentOf, commentSummary, formatBytes, removeCommentImage, setCommentText, validComment } from './comment';
import { fitSize } from './commenttip';
import { mergePlans } from './merge';
import { samePlanApartFromImages, snapshotOf } from './editmodel';
import { testplan } from './test/testplaner';
import { validatePlan } from './format/validate';
import type { Box } from './format/types';
import { findMatches } from './search';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const img = (data = PNG) => ({ data, w: 400, h: 300 });
const box = (p: ReturnType<typeof testplan>, id: string) => p.lanes.flatMap((l) => l.boxes).find((b) => b.id === id)!;
const blank = (): Box => ({ id: 'a', text: 'A', taskIds: [], rotation: 0, milestone: null, shown: true, resolved: null });

describe('kommentarer på bokser', () => {
  it('tom tekst uten bilder fjerner kommentaren', () => {
    const b = blank();
    setCommentText(b, 'Ventilasjon');
    expect(b.comment).toEqual({ text: 'Ventilasjon' });
    setCommentText(b, '');
    expect(b.comment).toBeUndefined();
  });

  it('bare mellomrom regnes ikke som kommentar', () => {
    const b = blank();
    setCommentText(b, '  ');
    expect(commentOf(b)).toBeNull();
    expect(commentSummary(b)).toBe('Ingen');
  });

  it('bilder legges til sist og tas bort igjen', () => {
    const b = blank();
    setCommentText(b, 'Se bildet');
    expect(addCommentImages(b, [img(), img('data:image/jpeg;base64,/9j/')])).toBe(2);
    expect(commentSummary(b)).toBe('Tekst · 2 bilder');
    removeCommentImage(b, 0);
    expect(b.comment!.images!.map((i) => i.data)).toEqual(['data:image/jpeg;base64,/9j/']);
    setCommentText(b, '');
    removeCommentImage(b, 0);
    expect(b.comment).toBeUndefined();
  });

  it(`høyst ${COMMENT_MAX_IMAGES} bilder`, () => {
    const b = blank();
    expect(addCommentImages(b, Array.from({ length: COMMENT_MAX_IMAGES + 2 }, () => img()))).toBe(COMMENT_MAX_IMAGES);
    expect(addCommentImages(b, [img()])).toBe(0);
  });

  it('størrelse og visning', () => {
    expect(commentBytes([{ data: 'data:image/png;base64,AAAA', w: 1, h: 1 }])).toBe(3);
    expect(formatBytes(340_000)).toBe('340 kB');
    expect(formatBytes(1_240_000)).toBe('1,2 MB');
    expect(fitSize({ w: 1280, h: 960 }, { w: 480, h: 360 })).toEqual({ w: 480, h: 360 });
    expect(fitSize({ w: 400, h: 1200 }, { w: 360, h: 270 })).toEqual({ w: 90, h: 270 });
    expect(fitSize({ w: 100, h: 50 }, { w: 360, h: 270 })).toEqual({ w: 100, h: 50 });
  });

  it('gyldig kommentar i planfilen', () => {
    expect(validComment({ text: 'x', images: [img()] })).toBe(true);
    expect(validComment({ images: [{ data: 'https://eksempel/bilde.png', w: 1, h: 1 }] })).toBe(false);
    expect(validComment({ text: 3 })).toBe(false);
    const p = testplan();
    box(p, '1_1').comment = { text: 'Hei\nder', images: [img()] };
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
    (box(p, '1_1') as unknown as { comment: unknown }).comment = { images: 'nei' };
    expect(validatePlan(JSON.stringify(p)).errors.length).toBeGreaterThan(0);
  });

  it('følger boksen ved oppdatering fra Project', () => {
    const work = testplan();
    box(work, '1_1').comment = { text: 'Leveranse fra Tyskland', images: [img()] };
    const { plan } = mergePlans(work, testplan());
    expect(box(plan, '1_1').comment).toEqual({ text: 'Leveranse fra Tyskland', images: [img()] });
  });

  it('finner lenker i teksten', () => {
    expect(splitLinks('Se https://eksempel.no/a?b=1. Og www.vg.no, takk')).toEqual([
      { text: 'Se ' },
      { text: 'https://eksempel.no/a?b=1', href: 'https://eksempel.no/a?b=1' },
      { text: '. Og ' },
      { text: 'www.vg.no', href: 'https://www.vg.no' },
      { text: ', takk' },
    ]);
    expect(splitLinks('(https://no.wikipedia.org/wiki/Kran_(maskin))')).toEqual([
      { text: '(' },
      { text: 'https://no.wikipedia.org/wiki/Kran_(maskin)', href: 'https://no.wikipedia.org/wiki/Kran_(maskin)' },
      { text: ')' },
    ]);
    expect(splitLinks('javascript:alert(1) og ftp://x')).toEqual([{ text: 'javascript:alert(1) og ftp://x' }]);
    expect(splitLinks('')).toEqual([]);
  });

  it('søket finner teksten i kommentaren', () => {
    const p = testplan();
    box(p, '1_1').comment = { text: 'Kran bestilt\nuke 12' };
    expect(findMatches(p, 'kran bestilt')).toEqual(['1_1']);
  });

  it('planer med ulik kommentar er ikke like', () => {
    const a = testplan();
    box(a, '1_1').comment = { images: [img()] };
    const b = snapshotOf(a);
    expect(samePlanApartFromImages(a, b)).toBe(true);
    box(b, '1_1').comment = { images: [img('data:image/png;base64,AAAA')] };
    expect(samePlanApartFromImages(a, b)).toBe(false);
  });
});
