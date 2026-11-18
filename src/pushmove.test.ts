import { describe, expect, it } from 'vitest';
import { hopped, pieceRect, pinAt, placesOf, pushDown, settle } from './pushmove';
import { bounds, findBox, lines, snapshotOf } from './editmodel';
import { computeLayout, type Layout } from './layout/layout';
import { approxMeasure } from './layout/text';
import { testform } from './test/testplaner';
import type { PlanFile } from './format/types';

const r = (id: string, x0: number, x1: number, y0: number, y1: number) => ({ id, x0, x1, y0, y1 });

describe('skyv ned', () => {
  it('skyver en trapp ned like langt, og lar det ved siden av stå', () => {
    // Trapp: hvert trinn starter under callouten til det forrige
    const others = [r('a', 0, 30, 0, 2), r('b', 20, 50, 2, 4), r('c', 40, 70, 4, 6), r('ved-siden', 80, 100, 0, 2)];
    const out = pushDown([r('ny', 10, 35, 2, 4)], others);
    expect([...out]).toEqual([
      ['b', 4],
      ['c', 6],
    ]);
  });

  it('skyver videre det som treffes, også når avstanden er ulik', () => {
    const out = pushDown([r('ny', 0, 10, 0, 5)], [r('a', 0, 10, 1, 3), r('b', 5, 15, 4, 6), r('c', 50, 60, 4, 6)]);
    expect(out.get('a')).toBe(5);
    expect(out.get('b')).toBe(7);
    expect(out.has('c')).toBe(false);
  });

  it('skyver aldri oppover, og kanter som bare berører teller ikke', () => {
    const out = pushDown([r('ny', 0, 10, 0, 2)], [r('over', 0, 10, -2, 0), r('under', 0, 10, 2, 4)]);
    expect(out.size).toBe(0);
  });

  it('merker løse bokser som har flyttet seg eller byttet side', () => {
    const a = new Map([
      ['x', { lane: 'L', y: 1, side: 'right' as const }],
      ['y', { lane: 'L', y: 2, side: 'right' as const }],
      ['z', { lane: 'L', y: 3, side: 'left' as const }],
    ]);
    const b = new Map([
      ['x', { lane: 'L', y: 1.1, side: 'right' as const }],
      ['y', { lane: 'L', y: 4, side: 'right' as const }],
      ['z', { lane: 'L', y: 3, side: 'right' as const }],
    ]);
    expect(hopped(a, b, new Set(['x', 'y', 'z']))).toEqual(['y', 'z']);
  });
});

describe('Ctrl-slipp i en ekte plan', () => {
  let heightMode: 'compact' | 'fill' = 'compact';
  const layoutOf = (p: PlanFile) => computeLayout(p, { orientation: 'landscape', heightMode, textSizePt: 9, fitToSheet: false }, approxMeasure);

  /** Flytter boks nr. `from` i lanen opp til toppen av boks nr. `to`, slik end() i startMove gjør med Ctrl. */
  const drop = (p: PlanFile, L: Layout, laneIdx: number, from: number, to: number) => {
    const ln = L.lanes[laneIdx];
    const ids = p.lanes.find((l) => l.id === ln.id)!.boxes.map((b) => b.id);
    const items = ids.map((id) => L.items.find((i) => i.id === id)).filter((i) => !!i);
    const sorted = [...items].sort((a, b) => bounds(a).y0 - bounds(b).y0);
    const mover = sorted[from];
    const target = sorted[to];
    const mb = pieceRect(mover);
    const y = Math.max(pieceRect(target).y0, ln.top);
    const moverRect = { ...mb, y0: y, y1: y + mb.y1 - mb.y0 };
    const others = items.filter((i) => i.id !== mover.id && !(i.kind === 'box' && (i.header || i.span))).map(pieceRect);
    const pushed = pushDown([moverRect], others);
    const trial = snapshotOf(p);
    pinAt(findBox(trial, mover.id)!, lines(y - ln.top, L.unit), L.compact);
    for (const [id, py] of pushed) pinAt(findBox(trial, id)!, lines(py - ln.top, L.unit), L.compact);
    const want = (_id: string, yy: number) => (yy - ln.top) / L.unit;
    const extra = settle(trial, L, new Set([ln.id]), layoutOf, new Set(pushed.keys()));
    return { trial, ln, ids, mover: mover.id, y, pushed, extra, want };
  };

  it('ingen andre bokser i lanen hopper, og ingen overlapper', () => {
    for (const [mode, form, from, to] of [
      ['compact', 'middels', -1, 1],
      ['fill', 'middels', -1, 1],
      ['compact', 'lange-lanetitler', -1, 0],
      ['fill', 'ukeplan', -2, 1],
    ] as const) {
      heightMode = mode;
      const p = testform(form);
      const L = layoutOf(p);
      for (let li = 0; li < L.lanes.length; li++) {
        const n = p.lanes.find((l) => l.id === L.lanes[li].id)?.boxes.length ?? 0;
        if (n < 4) continue;
        const { trial, ln, ids, mover, y, pushed, want: at } = drop(p, L, li, n + from, to);
        const before = placesOf(L, p);
        const L2 = layoutOf(trial);
        const after = placesOf(L2, trial);
        for (const id of ids) {
          if (id === mover) {
            expect(after.get(id)!.y).toBeCloseTo(at(id, y), 1);
            continue;
          }
          const want = pushed.has(id) ? at(id, pushed.get(id)!) : before.get(id)!.y;
          expect(Math.abs(after.get(id)!.y - want), `${form} lane ${ln.id} boks ${id}`).toBeLessThan(0.3);
        }
      }
    }
  });
});
