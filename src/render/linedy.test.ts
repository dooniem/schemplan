import { describe, expect, it } from 'vitest';
import { carryEmptyDy } from './linedy';

describe('carryEmptyDy', () => {
  it('lar linjer med tekst være som de er', () => {
    expect(carryEmptyDy(['A', 'B'], [null, 5])).toEqual([null, 5]);
  });
  it('to linjeskift gir en tom linje: luften havner på neste linje', () => {
    expect(carryEmptyDy(['A', '', 'B'], [null, 5, 5])).toEqual([null, 0, 10]);
  });
  it('flere tomme linjer etter hverandre og tom linje først', () => {
    expect(carryEmptyDy(['', '', 'A'], [null, 5, 5])).toEqual([0, 0, 10]);
    expect(carryEmptyDy(['A', '', '', 'B'], [null, 5, 5, 5])).toEqual([null, 0, 0, 15]);
  });
  it('rotert tekst: negativ start på en tom første linje følger med', () => {
    expect(carryEmptyDy(['', 'A'], [-5, 10])).toEqual([0, 5]);
  });
});
