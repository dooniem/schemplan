import { describe, expect, it } from 'vitest';
import { inLine, linesOf, lineIds, setInLine, setStyle, styleOf, usedLines } from './criticallines';
import { criticalLine } from './layout/critical';
import { computeLayout, type BoxItem } from './layout/layout';
import { approxMeasure } from './layout/text';
import { arrowTip, storeTip } from './layout/arrow';
import { testplan } from './test/testplaner';
import { validatePlan } from './format/validate';
import { mergePlans } from './merge';
import { planRows } from './data/rows';
import type { Box } from './format/types';

const opts = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 9, fitToSheet: true };

describe('flere kritiske linjer', () => {
  it('lagrer linje 1 som true, slik eldre arbeidsfiler har den', () => {
    const b = { critical: true } as Box;
    expect(linesOf(b)).toEqual([1]);
    setInLine(b, 2, true);
    expect(b.critical).toEqual([1, 2]);
    setInLine(b, 1, false);
    expect(b.critical).toEqual([2]);
    setInLine(b, 1, true);
    setInLine(b, 2, false);
    expect(b.critical).toBe(true);
    setInLine(b, 1, false);
    expect('critical' in b).toBe(false);
  });

  it('tegner hver linje for seg med eget utseende, og overlever lagring og oppdatering', () => {
    const p = testplan();
    const [a, b] = [p.lanes[0].boxes[0], p.lanes[1].boxes[0]];
    setInLine(a, 1, true);
    setInLine(b, 1, true);
    setInLine(b, 3, true);
    setInLine(p.lanes[2].boxes[0], 3, true);
    setStyle(p.plan.layout, 3, { color: '#0050D0', dash: 'dashed' });
    expect(usedLines(p)).toEqual([1, 3]);
    expect([...lineIds(p, 3)]).toEqual([b.id, p.lanes[2].boxes[0].id]);
    expect(p.plan.layout.criticalLine).toBeUndefined();
    expect(styleOf(p.plan.layout, 1).color).toBe('#E00000');

    const L = computeLayout(p, opts, approxMeasure);
    expect(L.criticals.map((c) => [c.n, c.color, c.dash])).toEqual([[1, '#E00000', 'solid'], [3, '#0050D0', 'dashed']]);

    const json = JSON.parse(JSON.stringify(p));
    expect(validatePlan(json).errors).toEqual([]);
    const { plan: merged } = mergePlans(p, testplan());
    expect(merged.lanes[1].boxes[0].critical).toEqual([1, 3]);
    expect(merged.plan.layout.criticalLine3).toEqual({ width: 0.6, color: '#0050D0', dash: 'dashed' });
    expect(inLine(merged.lanes[2].boxes[0], 3)).toBe(true);

    const rows = planRows(p);
    expect(rows.find((r) => r.id === b.id)?.critical).toBe('1, 3');
  });

  it('avviser ukjente linjenumre', () => {
    const p = testplan();
    (p.lanes[0].boxes[0] as { critical: unknown }).critical = [1, 4];
    expect(validatePlan(JSON.parse(JSON.stringify(p))).errors.length).toBeGreaterThan(0);
  });

  it('legger to linjer gjennom samme boks i hver sin høyde når det er plass', () => {
    // Tom boks: linjen kan gå midt gjennom eller langs kantene
    const box = (id: string, x0: number, x1: number): BoxItem => ({ kind: 'box', id, x0, x1, y: 10, h: 6, fill: '#FFFFFF', border: null, text: null, callout: null, arrowLeft: false, arrowRight: false });
    const items = [box('a', 10, 30), box('b', 35, 50)];
    const taken = new Map<string, number[]>();
    const one = criticalLine(items, new Set(['a', 'b']), { width: 0.6, color: '#E00000' }, 1, taken)!;
    const two = criticalLine(items, new Set(['a', 'b']), { width: 0.6, color: '#FF6600' }, 2, taken)!;
    expect(one.points[1]).toBeCloseTo(13);
    expect(two.points[1]).not.toBeCloseTo(13);
  });

  it('pilspissen følger linjen den er festet til', () => {
    const W = 400;
    const H = 300;
    const lines: Record<number, number[]> = { 1: [0, 10, 100, 10], 2: [0, 50, 100, 50] };
    const a = storeTip({ x: 50, y: 50 }, W, H, null, undefined, 0.5, 2);
    expect(a.lineNo).toBe(2);
    expect(arrowTip(a, W, H, () => null, (n) => lines[n] ?? null)).toEqual({ x: 50, y: 50 });
    // Linje 2 er borte: spissen blir stående der den var
    expect(arrowTip(a, W, H, () => null, (n) => (n === 1 ? lines[1] : null)).y).toBeCloseTo(50, 1);
    expect(storeTip({ x: 50, y: 10 }, W, H, null, a, 0.5, 1).lineNo).toBeUndefined();
  });
});
