import { describe, expect, it } from 'vitest';
import { addTrade, boxTrade, currentFill, deleteTrade, projectFill, renameTrade, setBoxTrade, setProjectColor, tradeColors, tradeNameProblem } from './trades';
import { mergePlans } from './merge';
import { planRows } from './data/rows';
import { testplan } from './test/testplaner';
import { validatePlan } from './format/validate';
import { isEdited, resetBox } from './editor';

type Plan = ReturnType<typeof testplan>;
const box = (p: Plan, id: string) => p.lanes.flatMap((l) => l.boxes).find((b) => b.id === id)!;
const firstBox = (p: Plan) => p.lanes.flatMap((l) => l.boxes).find((b) => b.resolved && !b.resolved.isMilestone)!;
const otherTrade = (p: Plan, not: string) => p.colors.find((c) => c.name !== not && c.name !== '(none)')!.name;

describe('fag på bokser', () => {
  it('fag valgt i appen går foran Project og gir fagets farge', () => {
    const p = testplan();
    const b = firstBox(p);
    const t = otherTrade(p, b.resolved!.trade);
    setBoxTrade(p, [b.id], t);
    expect(boxTrade(b)).toBe(t);
    expect(isEdited(b)).toBe(true);
    expect(currentFill(p, b)).toBe(p.colors.find((c) => c.name === t)!.fill!.toUpperCase());
    expect(planRows(p).find((r) => r.id === b.id)!.trade).toBe(t);
    // Tilbake til Project-faget lagrer ikke noe valg
    setBoxTrade(p, [b.id], b.resolved!.trade);
    expect(b.trade).toBeUndefined();
    resetBox(b);
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);
  });

  it('nytt fag får ledig navn og farge, kan få nytt navn og slettes', () => {
    const p = testplan();
    const b = firstBox(p);
    const name = addTrade(p, [b.id]);
    expect(name).toBe('Nytt fag');
    expect(addTrade(p)).toBe('Nytt fag 2');
    expect(tradeColors(p).map((c) => c.name)).toContain('Nytt fag');
    expect(boxTrade(b)).toBe('Nytt fag');
    expect(validatePlan(JSON.stringify(p)).errors).toEqual([]);

    expect(tradeNameProblem(p, 'Nytt fag', 'nytt fag 2')).toMatch(/finnes allerede/);
    expect(tradeNameProblem(p, 'Nytt fag', ' ')).toMatch(/navn/);
    expect(tradeNameProblem(p, 'Nytt fag', 'Rørlegger')).toBeNull();
    p.plan.layout.legendItems = { 'Nytt fag': { text: 'Rør' } };
    renameTrade(p, 'Nytt fag', 'Rørlegger');
    expect(boxTrade(b)).toBe('Rørlegger');
    expect(p.plan.layout.tradeColors!['Rørlegger']).toBeTruthy();
    expect(p.plan.layout.legendItems!['Rørlegger'].text).toBe('Rør');

    deleteTrade(p, 'Rørlegger');
    expect(b.trade).toBeUndefined();
    expect(p.plan.layout.appTrades).toEqual(['Nytt fag 2']);
  });

  it('fargen fra Project kan avvike fra fagets farge', () => {
    const p = testplan();
    const b = firstBox(p);
    const pf = projectFill(p, b)!;
    // Faget får ny farge i appen: «Fargen fra Project» gir boksen egen farge
    p.plan.layout.tradeColors = { [b.resolved!.trade]: { fill: '#123456' } };
    expect(currentFill(p, b)).toBe('#123456');
    setProjectColor(p, b);
    expect(b.fill).toBe(pf);
    // Når faget har samme farge som i Project, fjernes egen farge
    delete p.plan.layout.tradeColors;
    delete b.fill;
    b.fill = '#ABCDEF';
    setProjectColor(p, b);
    expect(b.fill).toBeUndefined();
  });

  it('fag fra appen beholdes ved oppdatering, til Project endrer faget selv', () => {
    const work = testplan();
    const b = firstBox(work);
    const name = addTrade(work, [b.id]);
    let r = mergePlans(work, testplan());
    expect(box(r.plan, b.id).trade).toBe(name);
    expect(r.plan.plan.layout.appTrades).toEqual([name]);

    const fresh = testplan();
    box(fresh, b.id).resolved!.trade = otherTrade(fresh, b.resolved!.trade);
    r = mergePlans(work, fresh);
    expect(box(r.plan, b.id).trade).toBeUndefined();
    expect(r.report.tradeChanged.length).toBe(1);
  });
});
