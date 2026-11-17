import { describe, expect, it } from 'vitest';
import { computeLayout } from './layout';
import { approxMeasure } from './text';
import { resetLane, isLaneEdited } from '../editmodel';
import { testplan } from '../test/testplaner';

const OPTS = { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true } as const;

describe('skriftfarge på lanenavnet', () => {
  it('er svart som standard og hvit når valgt, bare for den lanen', () => {
    const p = testplan();
    const [a, b] = p.lanes.filter((l) => l.shown);
    let L = computeLayout(p, OPTS, approxMeasure);
    expect(L.lanes.find((x) => x.id === a.id)!.title.color).toBe('#000000');
    a.whiteText = true;
    L = computeLayout(p, OPTS, approxMeasure);
    expect(L.lanes.find((x) => x.id === a.id)!.title.color).toBe('#FFFFFF');
    expect(L.lanes.find((x) => x.id === b.id)!.title.color).toBe('#000000');
  });

  it('teller som endring og fjernes av Tilbakestill', () => {
    const p = testplan();
    const l = p.lanes[0];
    l.whiteText = true;
    expect(isLaneEdited(l)).toBe(true);
    resetLane(l);
    expect(l.whiteText).toBeUndefined();
  });
});
