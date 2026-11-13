import { describe, expect, it } from 'vitest';
import { NOTE_DEFAULT, PX_PER_MM, roundNotePt, shownPt } from './note';

describe('fritekst', () => {
  const W = 420;
  const px: [number, number] = [320, 80];
  const w = px[0] / PX_PER_MM / W;

  it('viser valgt størrelse når teksten ikke er dratt', () => {
    expect(shownPt(NOTE_DEFAULT, px, w, W)).toBe(12);
  });

  it('følger skaleringen, i halve pt', () => {
    expect(shownPt(NOTE_DEFAULT, px, w * 2, W)).toBe(24);
    expect(shownPt(NOTE_DEFAULT, px, w * 1.1, W)).toBe(13);
  });

  it('holder seg innenfor grensene', () => {
    expect(roundNotePt(1)).toBe(4);
    expect(roundNotePt(500)).toBe(200);
  });
});
