import { describe, expect, it } from 'vitest';
import { allUnderlined, carryTextStyles, paintRuns, remapRuns, remapUnderlines, styleLines, underlineRanges } from './textcolor';

const R = '#E6194B';
const B = '#4363D8';

describe('farge på deler av teksten', () => {
  it('gir og fjerner farge på et område', () => {
    let runs = paintRuns(undefined, 20, 7, 20, R);
    expect(runs).toEqual([{ from: 7, to: 20, color: R }]);
    runs = paintRuns(runs, 20, 10, 12, B);
    expect(runs).toEqual([
      { from: 7, to: 10, color: R },
      { from: 10, to: 12, color: B },
      { from: 12, to: 20, color: R },
    ]);
    expect(paintRuns(runs, 20, 0, 20, null)).toEqual([]);
  });

  it('følger teksten når den endres', () => {
    const runs = [{ from: 7, to: 10, color: R }];
    // Skrevet foran: flyttes
    expect(remapRuns(runs, 'Etasje AU2', 'Ny Etasje AU2')).toEqual([{ from: 10, to: 13, color: R }]);
    // Skrevet etter det fargede: får fargen, som i et tekstprogram
    expect(remapRuns(runs, 'Etasje AU2', 'Etasje AU22')).toEqual([{ from: 7, to: 11, color: R }]);
    // Det fargede slettet
    expect(remapRuns(runs, 'Etasje AU2', 'Etasje ')).toEqual([]);
  });

  it('deler linjene i biter, også når teksten brytes på nytt', () => {
    const text = 'Etasje|AU2 sirkulær';
    const runs = [{ from: 7, to: text.length, color: R }];
    const out = styleLines(text, runs, undefined, ['Etasje AU2', 'sirkulær']);
    expect(out).toEqual([
      [{ text: 'Etasje ' }, { text: 'AU2', color: R }],
      [{ text: 'sirkulær', color: R }],
    ]);
  });

  it('hopper over "*" først og linjer som ikke er teksten', () => {
    const text = '*Støp AU2';
    const runs = [{ from: 6, to: 9, color: B }];
    const out = styleLines(text, runs, undefined, ['Støp', 'AU2', '12.03–14.03']);
    expect(out).toEqual([undefined, [{ text: 'AU2', color: B }], undefined]);
  });

  it('ingen farge gir ingen biter', () => {
    expect(styleLines('Tekst', undefined, undefined, ['Tekst'])).toBeUndefined();
  });
});

describe('understreking av deler av teksten', () => {
  it('understreker og fjerner, og ser om alt markert er understreket', () => {
    const text = 'Etasje AU2 sirkulær';
    let r = underlineRanges(undefined, text.length, 7, 10, true);
    expect(r).toEqual([{ from: 7, to: 10 }]);
    expect(allUnderlined(text, r, 7, 10)).toBe(true);
    // Mellomrommet foran teller ikke
    expect(allUnderlined(text, r, 6, 10)).toBe(true);
    expect(allUnderlined(text, r, 0, 10)).toBe(false);
    r = underlineRanges(r, text.length, 0, text.length, false);
    expect(r).toEqual([]);
  });

  it('følger teksten når den endres', () => {
    const r = [{ from: 7, to: 10 }];
    expect(remapUnderlines(r, 'Etasje AU2', 'Ny Etasje AU2')).toEqual([{ from: 10, to: 13 }]);
    expect(remapUnderlines(r, 'Etasje AU2', 'Etasje AU22')).toEqual([{ from: 7, to: 11 }]);
    const b: { text: string; textColors?: { from: number; to: number; color: string }[]; underlines?: { from: number; to: number }[] } = {
      text: 'Etasje AU2',
      textColors: [{ from: 0, to: 6, color: R }],
      underlines: [{ from: 7, to: 10 }],
    };
    carryTextStyles(b, 'AU2');
    expect(b.textColors).toBeUndefined();
    expect(b.underlines).toEqual([{ from: 0, to: 3 }]);
  });

  it('understreker mellomrom bare mellom understrekede ord, og kombinerer med farge', () => {
    const text = 'Støp AU2 sirkulær dekke';
    const under = [{ from: 5, to: 17 }];
    const colors = [{ from: 5, to: 8, color: R }];
    expect(styleLines(text, colors, under, ['Støp AU2 sirkulær', 'dekke'])).toEqual([
      [{ text: 'Støp ' }, { text: 'AU2 ', color: R, underline: true }, { text: 'sirkulær', underline: true }],
      undefined,
    ]);
  });
});

