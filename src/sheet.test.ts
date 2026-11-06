import { describe, expect, it } from 'vitest';
import { a3Size, printableArea } from './sheet';

describe('A3-ark', () => {
  it('har riktige mål liggende og stående', () => {
    expect(a3Size('landscape')).toEqual({ width: 420, height: 297 });
    expect(a3Size('portrait')).toEqual({ width: 297, height: 420 });
  });

  it('trekker fra margene', () => {
    expect(printableArea({ width: 420, height: 297 }, { top: 10, right: 5, bottom: 10, left: 5 })).toEqual({
      width: 410,
      height: 277,
    });
  });

  it('blir aldri negativt', () => {
    expect(printableArea({ width: 10, height: 10 }, { top: 20, right: 20, bottom: 20, left: 20 })).toEqual({
      width: 0,
      height: 0,
    });
  });
});
