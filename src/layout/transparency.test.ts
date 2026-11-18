import { describe, expect, it } from 'vitest';
import { testplan } from '../test/testplaner';
import { computeLayout } from './layout';
import { approxMeasure } from './text';
import { validatePlan } from '../format/validate';
import { resetBox } from '../editmodel';
import { seenFill, setTransparency, transparencyOf } from './transparency';

const o = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: true };
const pick = () => {
  const p = testplan();
  const vis = p.lanes.filter((l) => l.shown && !l.hidden);
  const lane = vis.find((l) => l.boxes.some((b) => b.shown && !b.resolved?.isMilestone && b.text.trim()))!;
  const box = lane.boxes.find((b) => b.shown && !b.resolved?.isMilestone && b.text.trim())!;
  box.spanTo = vis[Math.min(vis.indexOf(lane) + 2, vis.length - 1)].id;
  return { p, box };
};
const itemOf = (p: ReturnType<typeof testplan>, id: string) => {
  const it = computeLayout(p, o, approxMeasure).items.find((i) => i.id === id)!;
  if (it.kind !== 'box') throw new Error('ikke boks');
  return it;
};

describe('gjennomsiktighet', () => {
  it('gjelder bare overskrifts- og Multi Lane-bokser', () => {
    const { p, box } = pick();
    setTransparency(box, 60);
    expect(itemOf(p, box.id).fillOpacity).toBeCloseTo(0.4);
    delete box.spanTo;
    expect(transparencyOf(box)).toBe(0);
    expect(itemOf(p, box.id).fillOpacity).toBeUndefined();
    box.header = true;
    expect(itemOf(p, box.id).fillOpacity).toBeCloseTo(0.4);
  });

  it('teksten velges etter fargen slik den ser ut: lys etter gjennomsiktighet gir svart tekst', () => {
    const { p, box } = pick();
    box.fill = '#1F3864';
    expect(itemOf(p, box.id).text!.color).toBe('#FFFFFF');
    setTransparency(box, 80);
    expect(seenFill('#1F3864', 80)).not.toBe('#1F3864');
    expect(itemOf(p, box.id).text!.color).toBe('#000000');
    // Egen tekstfarge går foran
    box.textColor = '#FFFFFF';
    expect(itemOf(p, box.id).text!.color).toBe('#FFFFFF');
  });

  it('0 fjerner valget, verdier utenfor grensene avvises i fila og tilbakestill fjerner det', () => {
    const { p, box } = pick();
    setTransparency(box, 0);
    expect('transparency' in box).toBe(false);
    setTransparency(box, 140);
    expect(box.transparency).toBe(90);
    expect(validatePlan(JSON.parse(JSON.stringify(p))).errors).toEqual([]);
    (box as unknown as { transparency: number }).transparency = 95;
    expect(validatePlan(JSON.parse(JSON.stringify(p))).errors.length).toBeGreaterThan(0);
    resetBox(box);
    expect('transparency' in box).toBe(false);
  });
});
