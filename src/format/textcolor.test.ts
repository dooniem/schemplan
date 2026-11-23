import { describe, expect, it } from 'vitest';
import { colorLines, paintRuns, remapRuns } from './textcolor';

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
    const out = colorLines(text, runs, ['Etasje AU2', 'sirkulær']);
    expect(out).toEqual([
      [{ text: 'Etasje ' }, { text: 'AU2', color: R }],
      [{ text: 'sirkulær', color: R }],
    ]);
  });

  it('hopper over "*" først og linjer som ikke er teksten', () => {
    const text = '*Støp AU2';
    const runs = [{ from: 6, to: 9, color: B }];
    const out = colorLines(text, runs, ['Støp', 'AU2', '12.03–14.03']);
    expect(out).toEqual([undefined, [{ text: 'AU2', color: B }], undefined]);
  });

  it('ingen farge gir ingen biter', () => {
    expect(colorLines('Tekst', undefined, ['Tekst'])).toBeUndefined();
  });
});
