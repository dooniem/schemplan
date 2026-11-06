import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PlanFile } from '../format/types';
import { buildTimeAxis } from './calendar';
import { parseIso, isoWeek } from './dates';
import { computeLayout, pack, type Item } from './layout';
import { approxMeasure } from './text';

const example = (): PlanFile => JSON.parse(readFileSync(new URL('../../examples/eksempelplan.json', import.meta.url), 'utf8'));

const footprint = (it: Item) =>
  it.kind === 'box'
    ? {
        x0: Math.min(it.x0, it.callout?.box.x ?? Infinity),
        x1: Math.max(it.x1, it.callout ? it.callout.box.x + it.callout.box.w : -Infinity),
        y0: it.y,
        y1: Math.max(it.y + it.h, it.callout ? it.callout.box.y + it.callout.box.h : -Infinity),
      }
    : {
        x0: Math.min(it.x - it.size / 2, it.labelBox.x),
        x1: Math.max(it.x + it.size / 2, it.labelBox.x + it.labelBox.w),
        y0: Math.min(it.y - it.size / 2, it.labelBox.y),
        y1: Math.max(it.y + it.size / 2, it.labelBox.y + it.labelBox.h),
      };

describe('tidsakse', () => {
  it('måned: første dag starter ved månedens venstre kant, siste dag slutter ved høyre', () => {
    const a = buildTimeAxis({ mode: 'month', start: '2026-01-01', end: '2026-12-31', workingDaysPerWeek: 5, bottomCalendar: false }, 0, 120);
    expect(a.columns).toHaveLength(12);
    expect(a.xStart(parseIso('2026-01-01'))).toBeCloseTo(0);
    expect(a.xEnd(parseIso('2026-01-31'))).toBeCloseTo(10);
    expect(a.xEnd(parseIso('2026-02-14'))).toBeCloseTo(15);
  });

  it('uke: dager etter hverandre gir ingen luke, og helg havner på fredag', () => {
    const a = buildTimeAxis({ mode: 'week', start: '2026-03-02', end: '2026-03-29', workingDaysPerWeek: 5, bottomCalendar: false }, 0, 40);
    expect(a.columns).toHaveLength(4);
    expect(a.xEnd(parseIso('2026-03-03'))).toBeCloseTo(a.xStart(parseIso('2026-03-04')));
    expect(a.xEnd(parseIso('2026-03-07'))).toBeCloseTo(10);
  });

  it('ISO-uke 1 2026 starter 29.12.2025', () => {
    expect(isoWeek(parseIso('2025-12-29'))).toEqual({ year: 2026, week: 1 });
    expect(isoWeek(parseIso('2027-01-03'))).toEqual({ year: 2026, week: 53 });
  });
});

describe('pack', () => {
  it('legger overlappende bokser under hverandre og ikke-overlappende på samme rad', () => {
    const ys = pack([
      { fx0: 0, fx1: 10, h: 5 },
      { fx0: 5, fx1: 15, h: 5 },
      { fx0: 10, fx1: 20, h: 5 },
    ], 1);
    expect(ys).toEqual([0, 6, 0]);
  });
});

describe('layout', () => {
  for (const orientation of ['landscape', 'portrait'] as const) {
    for (const heightMode of ['fill', 'compact'] as const) {
      it(`ingen overlapp og alt innenfor arket (${orientation}, ${heightMode})`, () => {
        const L = computeLayout(example(), { orientation, heightMode, textSizePt: 9, fitToSheet: true }, approxMeasure);
        expect(L.overflow).toBe(false);
        for (const lane of L.lanes) {
          const inLane = L.items.map(footprint).filter((f) => f.y0 >= lane.y0 - 1e-6 && f.y1 <= lane.y1 + 1e-6);
          for (let i = 0; i < inLane.length; i++)
            for (let j = i + 1; j < inLane.length; j++) {
              const a = inLane[i];
              const b = inLane[j];
              const overlap = a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;
              expect(overlap).toBe(false);
            }
        }
        // Alle tegnede elementer ligger i en lane
        const total = L.items.length;
        const placed = L.lanes.reduce((n, lane) => n + L.items.map(footprint).filter((f) => f.y0 >= lane.y0 - 1e-6 && f.y1 <= lane.y1 + 1e-6).length, 0);
        expect(placed).toBe(total);
        expect(L.plot.y1).toBeLessThanOrEqual(L.height - L.margin + 1e-6);
      });
    }
  }

  it('Fyll arket gir høyere lanes enn Kompakt', () => {
    const fill = computeLayout(example(), { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true }, approxMeasure);
    const compact = computeLayout(example(), { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: true }, approxMeasure);
    expect(fill.plot.y1).toBeGreaterThan(compact.plot.y1);
  });

  it('krymper teksten når planen ikke får plass', () => {
    const L = computeLayout(example(), { orientation: 'landscape', heightMode: 'compact', textSizePt: 40, fitToSheet: true }, approxMeasure);
    expect(L.textScale).toBeLessThan(1);
  });

  it('boks utenfor kalenderen tegnes ikke, boks som går ut av kalenderen får pil', () => {
    const p = example();
    p.lanes[0].boxes[0].resolved!.start = '2025-11-01';
    const L = computeLayout(p, { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true }, approxMeasure);
    expect(L.items.find((i) => i.id === '5_2')).toBeUndefined();
    const first = L.items.find((i) => i.id === '1_1');
    expect(first?.kind === 'box' && first.arrowLeft).toBe(true);
  });

  it('tegner ukesvisning', () => {
    const p = example();
    p.plan.calendar = { ...p.plan.calendar, mode: 'week', start: '2026-03-02', end: '2026-07-26' };
    const L = computeLayout(p, { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true }, approxMeasure);
    expect(L.calendarTop).toHaveLength(3);
    expect(L.items.length).toBeGreaterThan(0);
  });
});

describe('Excel-utseende', () => {
  it('annenhver måned er skyggelagt, og bare årsskifter får kraftig strek', () => {
    const L = computeLayout(example(), { orientation: 'landscape', heightMode: 'fill', textSizePt: 7, fitToSheet: true }, approxMeasure);
    expect(L.bands).toHaveLength(12);
    expect(new Set(L.bands.map((b) => b.fill)).size).toBe(2);
    expect(L.bands[0].fill).not.toBe(L.bands[1].fill);
    expect(L.grid.filter((g) => g.strong)).toHaveLength(0); // eksempelet dekker ett år
    expect(L.calendarTop[1].rotate).toBe(true);
  });

  it('ruter-milepæler har fet tekst og vanlig dato', () => {
    const L = computeLayout(example(), { orientation: 'landscape', heightMode: 'fill', textSizePt: 7, fitToSheet: true }, approxMeasure);
    const m = L.items.find((i) => i.kind === 'milestone' && i.symbol === 'diamond');
    expect(m && m.kind === 'milestone' && m.label.boldLines?.[0]).toBe(false);
    expect(m && m.kind === 'milestone' && m.label.boldLines?.[1]).toBe(true);
  });
});
