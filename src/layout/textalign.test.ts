import { describe, expect, it } from 'vitest';
import { testplan } from '../test/testplaner';
import { computeLayout } from './layout';
import { approxMeasure } from './text';
import { validatePlan } from '../format/validate';
import { resetBox } from '../editmodel';

const o = {
  orientation: 'landscape' as const,
  heightMode: 'compact' as const,
  textSizePt: 9,
  fitToSheet: true,
};
const pick = () => {
  const p = testplan();
  const lane = p.lanes.find((l) => l.shown && !l.hidden && l.boxes.some((b) => b.shown && !b.resolved?.isMilestone && b.text.trim()))!;
  const box = lane.boxes.find((b) => b.shown && !b.resolved?.isMilestone && b.text.trim())!;
  box.rotation = 0;
  return { p, box };
};
const textOf = (p: ReturnType<typeof testplan>, id: string) => {
  const it = computeLayout(p, o, approxMeasure).items.find((i) => i.id === id)!;
  if (it.kind !== 'box' || !it.text) throw new Error('ingen tekst');
  return { it, t: it.text };
};

describe('tekstjustering', () => {
  it('venstre og høyre i overskriftsboks, midtstilt uten valg', () => {
    const { p, box } = pick();
    box.header = true;
    const mid = textOf(p, box.id);
    expect(mid.t.anchor).toBe('middle');
    box.textAlign = 'left';
    const left = textOf(p, box.id);
    expect(left.t.anchor).toBe('start');
    expect(left.t.x).toBeCloseTo(left.it.x0 + 1, 0);
    box.textAlign = 'right';
    const right = textOf(p, box.id);
    expect(right.t.anchor).toBe('end');
    expect(right.t.x).toBeLessThan(right.it.x1);
    expect(right.t.x).toBeGreaterThan(mid.t.x);
  });

  it('gjelder vanlige bokser og Multi Lane, men ikke rotert tekst', () => {
    const { p, box } = pick();
    box.textAlign = 'left';
    expect(textOf(p, box.id).t.anchor).toBe('start');
    box.spanTo = p.lanes[p.lanes.length - 1].id;
    expect(textOf(p, box.id).t.anchor).toBe('start');
    delete box.spanTo;
    box.rotation = 90;
    expect(textOf(p, box.id).t.anchor).toBe('middle');
  });

  it('rotert tekst i en høyere boks: oppe, midt eller nede', () => {
    const { p, box } = pick();
    box.rotation = -90;
    box.height = 30;
    const mid = textOf(p, box.id).t.y;
    box.textAt = 'top';
    const top = textOf(p, box.id);
    box.textAt = 'bottom';
    const bottom = textOf(p, box.id);
    expect(top.t.y).toBeLessThan(mid);
    expect(bottom.t.y).toBeGreaterThan(mid);
    expect(top.t.y).toBeGreaterThan(top.it.y);
    expect(bottom.t.y).toBeLessThan(bottom.it.y + bottom.it.h);
  });

  it('valideres og fjernes av Tilbakestill', () => {
    const { p, box } = pick();
    (box as { textAlign?: string }).textAlign = 'justify';
    expect(validatePlan(JSON.parse(JSON.stringify(p))).errors.some((e) => e.includes('textAlign'))).toBe(true);
    box.textAlign = 'right';
    resetBox(box);
    expect(box.textAlign).toBeUndefined();
  });
});
