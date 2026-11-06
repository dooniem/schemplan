import { testform, testplan } from '../test/testplaner';
import { describe, expect, it } from 'vitest';
import { buildTimeAxis } from './calendar';
import { parseIso, isoWeek } from './dates';
import { computeLayout, fitAlternatives, pack, packVariants, type Item } from './layout';
import { approxMeasure } from './text';

const example = testplan;

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

const shape = testform;

describe('lane-titler', () => {
  it('"|" i lane-navnet gir linjeskift', () => {
    const p = example();
    p.lanes[0].name = 'Første|Andre';
    const L = computeLayout(p, { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: false }, approxMeasure);
    expect(L.lanes[0].title.lines).toEqual(['Første', 'Andre']);
    p.lanes[0].name = 'A /| B';
    expect(computeLayout(p, { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: false }, approxMeasure).lanes[0].title.lines).toEqual(['A | B']);
  });
});

describe('tilpasning til arket', () => {
  it('krymper under minimum heller enn å kutte planen, og sier fra', () => {
    const L = computeLayout(shape('mange-av-begge'), { orientation: 'landscape', heightMode: 'fill', textSizePt: 10, fitToSheet: true, minTextPt: 7 }, approxMeasure);
    expect(L.textSizePt).toBeLessThan(7);
    expect(L.overflow).toBe(false);
    expect(L.belowMin).toBe(true);
    // Forslag regnes bare som "får plass" når minimum holdes
    const alts = fitAlternatives(shape('mange-av-begge'), { orientation: 'landscape', heightMode: 'fill', textSizePt: 10, fitToSheet: true, minTextPt: 7 }, approxMeasure);
    expect(alts.find((a) => a.paper === 'A3')?.fits).toBe(false);
  });

  it('får plass ved minimum: ikke merket under minimum', () => {
    const L = computeLayout(shape('middels'), { orientation: 'landscape', heightMode: 'fill', textSizePt: 10, fitToSheet: true, minTextPt: 6 }, approxMeasure);
    expect(L.belowMin).toBe(false);
  });

  it('fast tekststørrelse krymper ikke', () => {
    const L = computeLayout(shape('mange-av-begge'), { orientation: 'landscape', heightMode: 'fill', textSizePt: 10, fitToSheet: false }, approxMeasure);
    expect(L.textSizePt).toBe(10);
  });

  it('finner største tekst i trinn på 0,25 pt som får plass', () => {
    const opts = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 12, fitToSheet: true, minTextPt: 4 };
    const L = computeLayout(shape('middels'), opts, approxMeasure);
    expect(L.overflow).toBe(false);
    expect((L.textSizePt * 4) % 1).toBeCloseTo(0);
    if (L.textSizePt < 12) {
      const bigger = computeLayout(shape('middels'), { ...opts, textSizePt: L.textSizePt + 0.25, fitToSheet: false }, approxMeasure);
      expect(bigger.overflow).toBe(true);
    }
  });

  it('større ark gir større tekst', () => {
    const p = shape('mange-lanes-faa-bokser');
    const base = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 14, fitToSheet: true, minTextPt: 4 };
    const a3 = computeLayout(p, { ...base, paper: 'A3' }, approxMeasure);
    const a2 = computeLayout(p, { ...base, paper: 'A2' }, approxMeasure);
    expect(a2.width).toBe(594);
    expect(a2.textSizePt).toBeGreaterThan(a3.textSizePt);
    const alts = fitAlternatives(p, { ...base, paper: 'A3' }, approxMeasure);
    expect(alts).toHaveLength(5);
  });

  it('ingen overlapp i noen av testformene', () => {
    for (const name of ['mange-lanes-faa-bokser', 'faa-lanes-mange-bokser', 'mange-av-begge', 'middels', 'ukeplan', 'lange-lanetitler']) {
      const L = computeLayout(shape(name), { orientation: 'landscape', heightMode: 'compact', textSizePt: 7, fitToSheet: false }, approxMeasure);
      const f = L.items.map(footprint);
      for (let i = 0; i < f.length; i++)
        for (let j = i + 1; j < f.length; j++) {
          const a = f[i];
          const b = f[j];
          const hit = a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01;
          expect(hit, `${name}: ${L.items[i].id} og ${L.items[j].id}`).toBe(false);
        }
    }
  });
});

describe('plassering med varianter', () => {
  it('velger varianten som ligger lavest, og ved likt den smaleste', () => {
    const r = packVariants([
      { alts: [{ fx0: 0, fx1: 10, h: 2 }] },
      { alts: [{ fx0: 5, fx1: 15, h: 2 }, { fx0: 12, fx1: 20, h: 2 }] },
    ]);
    expect(r[1]).toEqual({ y: 0, k: 1 });
  });
});

describe('brukerens callout-valg', () => {
  const withBox = (patch: object) => {
    const p = example();
    const lane = p.lanes[0];
    lane.boxes = [{ ...lane.boxes[0], text: 'Kort', resolved: { start: '2026-03-02', finish: '2026-03-04', isMilestone: false, trade: '(none)' }, milestone: null, ...patch }];
    return computeLayout(p, { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: false }, approxMeasure).items.find((i) => i.kind === 'box')!;
  };
  it('smal boks får callout når appen bestemmer', () => {
    const it = withBox({});
    expect(it.kind === 'box' && it.callout).toBeTruthy();
  });
  it('kort tekst som får plass blir stående i boksen, selv i en smal boks', () => {
    // Bredden avgjør ikke alene; bare om teksten faktisk får plass
    const it = withBox({ text: 'L2', resolved: { start: '2026-03-02', finish: '2026-03-07', isMilestone: false, trade: '(none)' } });
    const inner = it.kind === 'box' ? it.x1 - it.x0 - 1.4 : 0;
    expect(inner).toBeGreaterThan(approxMeasure('L2', 9 * 0.3528));
    expect(inner).toBeLessThan(9 * 0.3528 * 1.6); // den gamle faste grensen ville gitt callout
    expect(it.kind === 'box' && it.callout).toBeNull();
  });
  it('callout av: teksten står i boksen', () => {
    const it = withBox({ callout: 'off' });
    expect(it.kind === 'box' && it.callout).toBeNull();
    expect(it.kind === 'box' && it.text).toBeTruthy();
  });
  it('callout på venstre side når brukeren velger det', () => {
    const it = withBox({ calloutSide: 'left' });
    expect(it.kind === 'box' && it.callout && it.callout.box.x < it.x0).toBe(true);
  });
  it('stjerne i teksten gir callout også på bred boks', () => {
    const it = withBox({ text: '*Bred', resolved: { start: '2026-03-02', finish: '2026-08-28', isMilestone: false, trade: '(none)' } });
    expect(it.kind === 'box' && it.callout).toBeTruthy();
  });
});

describe('farger valgt i appen', () => {
  const firstBox = (p: ReturnType<typeof example>) => p.lanes.flatMap((l) => l.boxes).find((b) => b.resolved && !b.resolved.isMilestone)!;
  const draw = (p: ReturnType<typeof example>, id: string) =>
    computeLayout(p, { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: false }, approxMeasure).items.find((i) => i.id === id)!;
  it('egen bakgrunn går foran faget, og teksten får kontrast av seg selv', () => {
    const p = example();
    const b = firstBox(p);
    b.fill = '#000080';
    b.callout = 'off';
    const it = draw(p, b.id);
    expect(it.kind === 'box' && it.fill).toBe('#000080');
    expect(it.kind === 'box' && it.text?.color).toBe('#FFFFFF');
  });
  it('valgt tekstfarge går foran kontrastvalget', () => {
    const p = example();
    const b = firstBox(p);
    b.fill = '#000080';
    b.textColor = '#000000';
    b.callout = 'off';
    const it = draw(p, b.id);
    expect(it.kind === 'box' && it.text?.color).toBe('#000000');
  });
});
