import { testform, testplan } from '../test/testplaner';
import { describe, expect, it } from 'vitest';
import { buildTimeAxis } from './calendar';
import { parseIso, isoWeek } from './dates';
import { applyOrder, arrangeLanes, computeLayout, fitAlternatives, footerLine, pack, packVariants, planDate, tightestOrder, type Item } from './layout';
import { approxMeasure, LINE_HEIGHT, PT_TO_MM } from './text';
import { validatePlan } from '../format/validate';

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
    // Uten stil: Excel-lik, med to kalenderrader
    p.plan.calendar = { ...p.plan.calendar, mode: 'week', start: '2026-03-02', end: '2026-07-26' };
    const L = computeLayout(p, { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true }, approxMeasure);
    expect(L.calendarTop).toHaveLength(2);
    expect(L.items.length).toBeGreaterThan(0);
  });
});

describe('Excel-utseende', () => {
  it('annenhver måned er skyggelagt, og bare årsskifter får kraftig strek', () => {
    const L = computeLayout(example(), { orientation: 'landscape', heightMode: 'fill', textSizePt: 7, fitToSheet: true }, approxMeasure);
    const full = L.bands.filter((b) => b.y0 === undefined);
    expect(full).toHaveLength(12);
    expect(new Set(full.map((b) => b.fill)).size).toBe(2);
    expect(full[0].fill).not.toBe(full[1].fill);
    expect(L.grid.filter((g) => g.strong)).toHaveLength(0); // eksempelet dekker ett år
    expect(L.calendarTop[1].rotate).toBe(true);
  });

  it('de mørke feltene er lysere i annenhver lane, som i Excel', () => {
    for (const style of ['excel', 'ny'] as const) {
      const L = computeLayout(example(), { orientation: 'landscape', heightMode: 'fill', textSizePt: 7, fitToSheet: true, style }, approxMeasure);
      const full = L.bands.filter((b) => b.y0 === undefined);
      const dark = full[0].fill;
      const alt = L.bands.filter((b) => b.y0 !== undefined);
      // Bare lane 2, 4 … får egne felt, og bare over de mørke månedene
      const odd = L.lanes.filter((_, i) => i % 2 === 1);
      expect(alt.length, style).toBe(odd.length * full.filter((b) => b.fill === dark).length);
      for (const b of alt) {
        expect(b.fill, style).not.toBe(dark);
        expect(odd.some((ln) => ln.y0 === b.y0 && ln.y1 === b.y1), style).toBe(true);
      }
    }
  });

  it('ukesvisning: oddetallsukene er skyggelagt i planområdet, som i kalenderen', () => {
    const p = example();
    p.plan.calendar = { ...p.plan.calendar, mode: 'week' };
    const L = computeLayout(p, { orientation: 'landscape', heightMode: 'fill', textSizePt: 7, fitToSheet: true, style: 'excel' }, approxMeasure);
    const weeks = L.calendarTop[L.calendarTop.length - 1].cells;
    const full = L.bands.filter((b) => b.y0 === undefined);
    for (const w of weeks) {
      const b = full.find((x) => x.x0 <= w.x0 + 1e-6 && w.x1 <= x.x1 + 1e-6)!;
      expect(b.fill === full.find((x) => x.fill === '#EBEBEB')?.fill).toBe(w.fill === '#B4B4B4');
    }
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
      // Med minimum ett trinn høyere må planen under minimum for å få plass
      const bigger = computeLayout(shape('middels'), { ...opts, minTextPt: L.textSizePt + 0.25 }, approxMeasure);
      expect(bigger.belowMin).toBe(true);
    }
  });

  it('bunnteksten krymper ikke når planen skaleres ned', () => {
    const opts = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 12, fitToSheet: true, minTextPt: 4 };
    const L = computeLayout(shape('middels'), opts, approxMeasure);
    expect(L.textSizePt).toBeLessThan(12);
    // 12 pt er over taket på 10 pt, så datoen står på taket uansett krymping
    expect(L.subtitle.size).toBeCloseTo(10 * 0.35278, 2);
    // Forklaringen kan krympe for å holde seg på én rad, men aldri under planteksten
    for (const e of L.legend) expect(e.label.size).toBeGreaterThanOrEqual(L.textSizePt * 0.3528 - 1e-6);
  });

  it('forklaringen holder seg på én rad når den kan', () => {
    const opts = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 12, fitToSheet: true, minTextPt: 4 };
    const L = computeLayout(shape('middels'), opts, approxMeasure);
    expect(L.legend.length).toBeGreaterThan(1);
    expect(new Set(L.legend.map((e) => e.y)).size).toBe(1);
    const last = L.legend[L.legend.length - 1];
    expect(last.label.x + approxMeasure(last.label.lines[0], last.label.size)).toBeLessThan(L.subtitle.x - approxMeasure(L.subtitle.lines[0], L.subtitle.size));
  });

  it('A4 gir et mindre ark med mindre tekst', () => {
    const p = shape('mange-lanes-faa-bokser');
    const base = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 14, fitToSheet: true, minTextPt: 4 };
    const a4 = computeLayout(p, { ...base, paper: 'A4' }, approxMeasure);
    const a3 = computeLayout(p, { ...base, paper: 'A3' }, approxMeasure);
    expect([a4.width, a4.height]).toEqual([297, 210]);
    expect(a4.textSizePt).toBeLessThanOrEqual(a3.textSizePt);
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
  it('egen callout-bredde i cm brytes smalere enn planens, og bredere når den er større', () => {
    const text = 'Lang tekst som må brytes over flere linjer i callouten';
    const std = withBox({ text, callout: 'on' });
    const narrow = withBox({ text, callout: 'on', calloutWidthCm: 1.5 });
    const wide = withBox({ text, callout: 'on', calloutWidthCm: 12 });
    if (std.kind !== 'box' || !std.callout || narrow.kind !== 'box' || !narrow.callout || wide.kind !== 'box' || !wide.callout) throw new Error('mangler callout');
    expect(narrow.callout.box.w).toBeLessThanOrEqual(15 + 1.5);
    expect(narrow.callout.text.lines.length).toBeGreaterThan(std.callout.text.lines.length);
    expect(wide.callout.text.lines.length).toBeLessThanOrEqual(std.callout.text.lines.length);
  });
  it('callout på venstre side når brukeren velger det', () => {
    const it = withBox({ calloutSide: 'left' });
    expect(it.kind === 'box' && it.callout && it.callout.box.x < it.x0).toBe(true);
  });
  it('høyere boks: callouten midtstilles i boksen når den får plass, ellers flukter den med toppen', () => {
    const text = 'Nivå 1|Åpne for vekseldrift';
    const lower = withBox({ text, callout: 'on' });
    if (lower.kind !== 'box' || !lower.callout) throw new Error('mangler callout');
    const ch = lower.callout.box.h;
    const unit = 9 * 0.3528 * LINE_HEIGHT;
    // Like høy som callouten: bunnen av teksten flukter med bunnen av boksen
    const same = withBox({ text, callout: 'on', height: ch / unit });
    if (same.kind !== 'box' || !same.callout) throw new Error('mangler callout');
    expect(same.callout.box.y - same.y).toBeCloseTo(Math.max(0, (same.h - same.callout.box.h) / 2));
    expect(same.callout.box.y + same.callout.box.h).toBeLessThanOrEqual(same.y + same.h + 0.5);
    // Høyere enn callouten: midt i boksen, og streken går ut fra midten
    const tall = withBox({ text, callout: 'on', height: (ch * 2) / unit });
    if (tall.kind !== 'box' || !tall.callout) throw new Error('mangler callout');
    expect(tall.callout.box.y + tall.callout.box.h / 2).toBeCloseTo(tall.y + tall.h / 2);
    const lead = tall.callout.leader;
    expect(lead[lead.length - 1]).toBeCloseTo(tall.y + tall.h / 2);
    // Litt høyere enn én linje, men lavere enn callouten: teksten starter i toppen av boksen
    const mid = withBox({ text, callout: 'on', height: (lower.h + 1) / unit });
    if (mid.kind !== 'box' || !mid.callout) throw new Error('mangler callout');
    expect(mid.callout.box.y).toBeCloseTo(mid.y);
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

describe('høyde og plass valgt i appen', () => {
  const opts = (heightMode: 'fill' | 'compact' = 'compact') => ({ orientation: 'landscape' as const, heightMode, textSizePt: 9, fitToSheet: false });
  const box = (L: ReturnType<typeof computeLayout>, id: string) => L.items.find((i) => i.id === id) as Extract<Item, { kind: 'box' }>;

  it('høyere boks får teksten midt i, og blir aldri lavere enn teksten krever', () => {
    const p = example();
    const before = box(computeLayout(p, opts(), approxMeasure), '2_1');
    p.lanes[1].boxes[0].height = 4;
    const L = computeLayout(p, opts(), approxMeasure);
    const after = box(L, '2_1');
    expect(after.h).toBeCloseTo(4 * L.unit);
    expect(after.minH).toBeCloseTo(before.h);
    expect(after.text!.y - after.y).toBeCloseTo(before.text!.y - before.y + (after.h - before.h) / 2);
    p.lanes[1].boxes[0].height = 0.1;
    expect(box(computeLayout(p, opts(), approxMeasure), '2_1').h).toBeCloseTo(before.h);
  });

  it('boks med fast plass står der, og de andre pakkes rundt', () => {
    const p = example();
    // 2_1 går over hele året og ligger øverst; flytt den ned under 2_2
    p.lanes[1].boxes[0].top = 3;
    const L = computeLayout(p, opts('fill'), approxMeasure);
    const lane = L.lanes.find((l) => l.id === '2')!;
    const b1 = box(L, '2_1');
    const b2 = box(L, '2_2');
    expect(b1.y - lane.top).toBeCloseTo(3 * L.unit);
    expect(b2.y).toBeCloseTo(lane.top);
    for (const a of L.items) for (const b of L.items) {
      if (a === b) continue;
      const fa = footprint(a), fb = footprint(b);
      const overlap = fa.x0 < fb.x1 - 1e-6 && fb.x0 < fa.x1 - 1e-6 && fa.y0 < fb.y1 - 1e-6 && fb.y0 < fa.y1 - 1e-6;
      expect(overlap, `${a.id} og ${b.id}`).toBe(false);
    }
  });

  it('lane med valgt høyde: brukes når den er høy nok, ellers innholdets minimum', () => {
    const p = example();
    const auto = computeLayout(p, opts(), approxMeasure).lanes[0];
    p.lanes[0].height = 20;
    let L = computeLayout(p, opts('fill'), approxMeasure);
    expect(L.lanes[0].y1 - L.lanes[0].y0).toBeCloseTo(20 * L.unit);
    expect(L.lanes[0].manual).toBe(true);
    expect(L.lanes[0].minH).toBeCloseTo(auto.y1 - auto.y0);
    p.lanes[0].height = 0.5;
    L = computeLayout(p, opts('fill'), approxMeasure);
    expect(L.lanes[0].y1 - L.lanes[0].y0).toBeCloseTo(auto.y1 - auto.y0);
  });

  it('Kompakt: tomrommet over festede bokser tas bort, rekkefølgen beholdes', () => {
    const p = example();
    p.lanes[1].boxes[0].top = 30;
    const fill = computeLayout(p, opts('fill'), approxMeasure);
    const L = computeLayout(p, opts(), approxMeasure);
    const lane = L.lanes.find((l) => l.id === '2')!;
    const b1 = box(L, '2_1');
    const b2 = box(L, '2_2');
    // I «Fyll hele arket» står den der den er festet
    expect(box(fill, '2_1').y - fill.lanes.find((l) => l.id === '2')!.top).toBeCloseTo(30 * fill.unit);
    // I Kompakt rett under de andre boksene i lanen, som den lå under (den går over hele året)
    expect(b2.y).toBeCloseTo(lane.top);
    const others = L.items.filter((i) => i !== b1 && footprint(i).y0 >= lane.y0 && footprint(i).y0 < lane.y1);
    expect(b1.y).toBeCloseTo(Math.max(...others.map((i) => footprint(i).y1)));
    expect(lane.y1 - lane.top).toBeLessThan(30 * L.unit);
  });

  it('Kompakt: plass satt i Kompakt står fast og endrer ikke «Fyll hele arket»', () => {
    const p = example();
    p.lanes[1].boxes[0].top = 30;
    p.lanes[1].boxes[0].compactTop = 6;
    const L = computeLayout(p, opts(), approxMeasure);
    expect(box(L, '2_1').y - L.lanes.find((l) => l.id === '2')!.top).toBeCloseTo(6 * L.unit);
    const fill = computeLayout(p, opts('fill'), approxMeasure);
    expect(box(fill, '2_1').y - fill.lanes.find((l) => l.id === '2')!.top).toBeCloseTo(30 * fill.unit);
  });

  it('Kompakt ser bort fra fast lanehøyde', () => {
    const p = example();
    const auto = computeLayout(p, opts(), approxMeasure).lanes[0];
    p.lanes[0].height = 20;
    const L = computeLayout(p, opts(), approxMeasure);
    expect(L.lanes[0].y1 - L.lanes[0].y0).toBeCloseTo(auto.y1 - auto.y0);
    expect(L.lanes[0].manual).toBe(false);
  });

  it('Fyll arket: ledig plass går bare til lanene med automatisk høyde', () => {
    const p = example();
    p.lanes[0].height = 6;
    const L = computeLayout(p, opts('fill'), approxMeasure);
    expect(L.lanes[0].y1 - L.lanes[0].y0).toBeCloseTo(Math.max(6 * L.unit, L.lanes[0].minH));
    expect(L.lanes[1].y1 - L.lanes[1].y0).toBeGreaterThan(L.lanes[1].minH + 5);
  });
});

describe('overskrift, logo og ukeskravering', () => {
  const o = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 9, fitToSheet: true };
  it('overskriften krympes ikke når teksten tilpasses arket', () => {
    const L = computeLayout(testform('mange-av-begge'), o, approxMeasure);
    expect(L.textScale).toBeLessThan(1);
    expect(L.title.size).toBeCloseTo(16 * 0.3528, 2);
  });
  it('logo øverst til venstre med riktig forhold', () => {
    const p = example();
    p.plan.layout.logo = { data: 'data:image/png;base64,AAAA', aspect: 4 };
    const L = computeLayout(p, o, approxMeasure);
    expect(L.logo).not.toBeNull();
    expect(L.logo!.w / L.logo!.h).toBeCloseTo(4);
    expect(L.logo!.y + L.logo!.h).toBeLessThan(L.plot.y0);
  });
  it('logoens høyde følger egen størrelse, ikke overskriften', () => {
    const p = example();
    p.plan.layout.logo = { data: 'data:image/png;base64,AAAA', aspect: 4 };
    const base = computeLayout(p, o, approxMeasure).logo!.h;
    expect(computeLayout(p, { ...o, titleSizePt: 24 }, approxMeasure).logo!.h).toBeCloseTo(base);
    p.plan.layout.logoScale = 1.5;
    expect(computeLayout(p, o, approxMeasure).logo!.h).toBeCloseTo(base * 1.5);
  });
  it('ny stil i ukesvisning: skraveringen følger annenhver uke', () => {
    const p = example();
    p.plan.calendar.mode = 'week';
    const L = computeLayout(p, { ...o, style: 'ny' }, approxMeasure);
    const weekW = (L.plot.x1 - L.plot.x0) / L.calendarTop[2].cells.length;
    for (const b of L.bands) expect(b.x1 - b.x0).toBeLessThan(weekW * 1.5);
  });
  it('Excel-lik ukesvisning: to rader, «Okt 28» over ukene og grå oddetallsuker', () => {
    const p = example();
    p.plan.calendar = { ...p.plan.calendar, mode: 'month', start: '2028-10-02', end: '2029-02-10' };
    const L = computeLayout(p, { ...o, style: 'excel', calendarMode: 'week' }, approxMeasure);
    expect(L.calendarTop).toHaveLength(2);
    const [months, weeks] = L.calendarTop;
    expect(months.cells.map((c) => c.label)).toEqual(['Okt 28', 'Nov 28', 'Des 28', 'Jan 29', 'Feb 29']);
    // Uke 5 2029 (29.1–4.2) har tre dager i januar og hører til januar, som i Excel
    const jan = months.cells[3];
    const w5 = weeks.cells.find((c) => c.label === '5')!;
    expect(w5.x1).toBeCloseTo(jan.x1);
    expect(weeks.dotMonths).toBe(true);
    expect(weeks.cells.find((c) => c.label === '41')!.fill).not.toBe(weeks.cells.find((c) => c.label === '42')!.fill);
    // Kraftig strek ved årsskiftet, mellom uke 52 og uke 1
    const w1 = weeks.cells.find((c) => c.label === '1')!;
    expect(L.grid.find((g) => Math.abs(g.x - w1.x0) < 1e-6)?.strong).toBe(true);
  });
  it('lang plan i uker: ukenumrene deles aldri, står loddrett og vises for annenhver eller hver fjerde uke', () => {
    for (const style of ['excel', 'ny'] as const) {
      const p = example();
      p.plan.calendar = { ...p.plan.calendar, mode: 'week', start: '2027-01-04', end: '2031-12-28' };
      const L = computeLayout(p, { ...o, style }, approxMeasure);
      const weeks = L.calendarTop[L.calendarTop.length - 1];
      const shown = weeks.cells.filter((c) => c.label);
      expect(weeks.rotate, style).toBe(true);
      expect(shown.length, style).toBeGreaterThan(weeks.cells.length / 5);
      expect(shown.some((c) => c.label === '1'), style).toBe(true);
      for (const c of shown) expect(Number(c.label) >= 1 && Number(c.label) <= 53, `${style} ${c.label}`).toBe(true);
      // Ingen avkuttede numre: hvert synlig nummer følger forrige uke med riktig avstand
      const nums = weeks.cells.map((c) => c.label);
      const idx = nums.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
      for (let k = 1; k < idx.length; k++) expect(idx[k] - idx[k - 1], style).toBeLessThanOrEqual(4);
    }
  });
  it('ukenumre som ikke får plass liggende, står loddrett når da hver uke får nummer', () => {
    const p = example();
    const weekRowAt = (end: string) => {
      p.plan.calendar = { ...p.plan.calendar, mode: 'week', start: '2027-01-04', end };
      const L = computeLayout(p, { ...o, style: 'excel' }, approxMeasure);
      return L.calendarTop[L.calendarTop.length - 1];
    };
    const short = weekRowAt('2027-12-26');
    expect(short.rotate).toBe(false);
    const found = ['2029-06-30', '2029-12-30', '2030-06-30', '2030-12-29'].map(weekRowAt).find((r) => r.rotate);
    expect(found).toBeTruthy();
    expect(found!.cells.filter((c) => !c.label).length).toBeLessThanOrEqual(2);
  });
  it('valget måned eller uke i appen går foran planen, men ikke foran utkikken', () => {
    const p = example();
    p.plan.calendar.mode = 'month';
    expect(computeLayout(p, { ...o, calendarMode: 'week', style: 'ny' }, approxMeasure).calendarTop).toHaveLength(3);
    p.plan.calendar.mode = 'week';
    expect(computeLayout(p, { ...o, calendarMode: 'month', style: 'ny' }, approxMeasure).calendarTop).toHaveLength(2);
  });
});

describe('overskriftsboks', () => {
  const o = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: false };
  it('teksten står øverst, boksen tegnes først, og en boks med fast plass kan ligge inne i den', () => {
    const p = example();
    // 2_1 går over nesten hele året; gjør den til overskriftsboks og legg 2_2 inne i den
    const head = p.lanes[1].boxes[0];
    head.header = true;
    head.height = 5;
    head.top = 0;
    p.lanes[1].boxes[1].top = 1.5;
    const L = computeLayout(p, o, approxMeasure);
    const hi = L.items.findIndex((i) => i.id === '2_1');
    const h = L.items[hi] as Extract<Item, { kind: 'box' }>;
    const c = L.items.find((i) => i.id === '2_2') as Extract<Item, { kind: 'box' }>;
    expect(h.header).toBe(true);
    expect(h.callout).toBeNull();
    expect(h.text!.y - h.y).toBeLessThan(L.unit);
    expect(c.y).toBeGreaterThan(h.y);
    expect(c.y + c.h).toBeLessThanOrEqual(h.y + h.h + 1e-6);
    expect(hi).toBeLessThan(L.items.findIndex((i) => i.id === '2_2'));
  });

  it('blir høyere når en boks inni den blir skjøvet ned, og boksene under flyttes ned', () => {
    for (const [heightMode, withCallout] of [['compact', false], ['fill', false], ['compact', true], ['fill', true]] as const) {
      const p = example();
      const [head, a, b] = p.lanes[1].boxes;
      Object.assign(head, { header: true, top: 0, height: 3.8 });
      a.top = 1.2;
      b.top = 2.4;
      if (withCallout) {
        // Boksen nederst har callout som stikker ut til høyre for overskriftsboksen
        a.resolved = { ...a.resolved!, start: '2026-09-01', finish: '2026-11-13' };
        b.resolved = { ...b.resolved!, start: '2026-11-02', finish: '2026-11-20' };
        b.text = 'Etterarbeid og opprydding';
        b.callout = 'on';
        b.calloutSide = 'right';
      }
      // a blir høyere (som når teksten blir callout eller større), og skyver b ned
      a.height = 3;
      const L = computeLayout(p, { ...o, heightMode }, approxMeasure);
      const box = (id: string) => L.items.find((i) => i.id === id) as Extract<Item, { kind: 'box' }>;
      const h = box('2_1');
      expect(box('2_3').y + box('2_3').h).toBeLessThanOrEqual(h.y + h.h + 1e-6);
      // Ingen annen boks i lanen overlapper overskriftsboksen
      const lane = L.lanes.find((l) => l.id === '2')!;
      for (const it of L.items) {
        if (it.kind !== 'box' || ['2_1', '2_2', '2_3'].includes(it.id) || it.y < lane.y0 || it.y >= lane.y1) continue;
        const overlapX = it.x0 < h.x1 && h.x0 < it.x1;
        if (overlapX) expect(it.y).toBeGreaterThanOrEqual(h.y + h.h - 1e-6);
      }
    }
  });
});

describe('forklaringen', () => {
  it('har et tak på tekststørrelsen også når planen forstørres', () => {
    const opts = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 14, fitToSheet: true, minTextPt: 4 };
    const L = computeLayout(shape('mange-lanes-faa-bokser'), { ...opts, paper: 'A1' }, approxMeasure);
    for (const e of L.legend) expect(e.label.size).toBeLessThanOrEqual(10 * 0.35278 + 1e-6);
    expect(L.subtitle.size).toBeLessThanOrEqual(10 * 0.35278 + 1e-6);
  });
});

describe('topptekst', () => {
  const opts = { orientation: 'landscape' as const, heightMode: 'fill' as const, textSizePt: 9, fitToSheet: true };
  it('overskrift fra appen går foran den fra Project', () => {
    const p = structuredClone(shape('middels'));
    p.plan.layout.title = 'Ny overskrift';
    expect(computeLayout(p, opts, approxMeasure).title.lines).toEqual(['Ny overskrift']);
  });
  it('tekst til høyre er høyrejustert i toppfeltet, og | gir linjeskift', () => {
    const p = structuredClone(shape('middels'));
    expect(computeLayout(p, opts, approxMeasure).headerRight).toBeUndefined();
    p.plan.layout.headerRight = 'Prosjekt 1234|Rev. B';
    const L = computeLayout(p, opts, approxMeasure);
    expect(L.headerRight?.lines).toEqual(['Prosjekt 1234', 'Rev. B']);
    expect(L.headerRight?.anchor).toBe('end');
    expect(L.headerRight!.x).toBeLessThan(L.width);
    expect(L.headerRight!.y + L.headerRight!.size * 1.18).toBeLessThanOrEqual(L.headerBottom);
  });
});

describe('omplassering', () => {
  const piece = (id: string, fx0: number, fx1: number, h: number, lock?: number) => ({ item: { id }, sortX: fx0, fx0, fx1, h, lock });
  const height = (ps: ReturnType<typeof piece>[]) => {
    const r = packVariants(ps.map((p) => ({ alts: [p], lock: p.lock })));
    return Math.max(...r.map((x, i) => x.y + ps[i].h));
  };

  it('finner en tettere rekkefølge enn tidligst først', () => {
    // Tidligst først legger B under A, så C må under B: 4 høy. Med B først blir det 3.
    const ps = [piece('A', 0, 4, 1), piece('B', 2, 8, 1), piece('C', 5, 10, 2)];
    expect(height(ps)).toBeCloseTo(4);
    const found = tightestOrder(ps)!;
    expect(found).not.toBeNull();
    expect(height(found)).toBeCloseTo(3);
    // Samme svar hver gang
    expect(tightestOrder(ps)!.map((p) => p.item.id)).toEqual(found.map((p) => p.item.id));
  });

  it('beholder vanlig rekkefølge når den allerede er tettest', () => {
    expect(tightestOrder([piece('A', 0, 4, 1), piece('B', 2, 8, 1), piece('C', 9, 12, 1)])).toBeNull();
  });

  it('flytter ikke bokser med fast plass', () => {
    const ps = [piece('A', 0, 4, 1), piece('B', 2, 8, 1, 3), piece('C', 5, 10, 2)];
    const found = tightestOrder(ps);
    const order = found ?? ps;
    const r = packVariants(order.map((p) => ({ alts: [p], lock: p.lock })));
    expect(r[order.findIndex((p) => p.item.id === 'B')].y).toBeCloseTo(3);
  });

  it('nye bokser settes inn etter startdato i en lagret rekkefølge', () => {
    const ps = [piece('A', 0, 4, 1), piece('N', 3, 5, 1), piece('B', 2, 8, 1), piece('C', 5, 10, 2)].sort((a, b) => a.sortX - b.sortX);
    expect(applyOrder(ps, ['C', 'B', 'A']).map((p) => p.item.id)).toEqual(['N', 'C', 'B', 'A']);
    expect(applyOrder(ps, ['B', 'C', 'A']).map((p) => p.item.id)).toEqual(['B', 'N', 'C', 'A']);
  });

  it('overskriftsboks flyttes med boksene inni', () => {
    const p = example();
    const opts = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: false };
    const [head, kid] = p.lanes[1].boxes;
    Object.assign(head, { header: true, height: 5, top: 3 });
    kid.top = 5;
    const L = computeLayout(p, opts, approxMeasure);
    const hb = L.items.find((i) => i.id === head.id) as Extract<Item, { kind: 'box' }>;
    const kb = L.items.find((i) => i.id === kid.id) as Extract<Item, { kind: 'box' }>;
    // Boksen ligger inne i overskriftsboksen
    expect(kb.x0).toBeGreaterThanOrEqual(hb.x0 - 1e-6);
    expect(kb.y + kb.h).toBeLessThanOrEqual(hb.y + hb.h + 1e-6);
    delete head.top;
    delete kid.top;
    const { pins } = arrangeLanes(p, opts, approxMeasure, [p.lanes[1].id], { mode: 'chrono', groups: new Map([[head.id, [{ id: kid.id, dy: 2 }]]]) });
    expect(pins.get(head.id)).toBe(0);
    expect(pins.get(kid.id)).toBe(2);
  });

  it('lagret rekkefølge brukes i tegningen og gir aldri overlapp', () => {
    const p = example();
    const opts = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: false };
    const { orders } = arrangeLanes(p, opts, approxMeasure, p.lanes.map((l) => l.id));
    expect(orders.size).toBe(p.lanes.filter((l) => l.shown).length);
    const lane = p.lanes[1];
    lane.order = lane.boxes.map((b) => b.id).reverse();
    const L = computeLayout(p, opts, approxMeasure);
    for (const a of L.items) for (const b of L.items) {
      if (a === b) continue;
      const fa = footprint(a), fb = footprint(b);
      const overlap = fa.x0 < fb.x1 - 1e-6 && fb.x0 < fa.x1 - 1e-6 && fa.y0 < fb.y1 - 1e-6 && fb.y0 < fa.y1 - 1e-6;
      expect(overlap, `${a.id} og ${b.id}`).toBe(false);
    }
  });
});

describe('datoen nederst til høyre', () => {
  it('er den nyeste av eksporten og siste endring i appen', () => {
    const p = testplan();
    p.exportedAt = '2026-11-01T12:00:00';
    expect(planDate(p)).toBe('2026-11-01');
    p.plan.layout.editedAt = '2026-11-10';
    expect(planDate(p)).toBe('2026-11-10');
    expect(validatePlan(p).errors).toEqual([]);
    p.exportedAt = '2026-11-12T08:00:00';
    expect(planDate(p)).toBe('2026-11-12');
    p.plan.layout.editedAt = '10.11.2026';
    expect(validatePlan(p).errors.length).toBeGreaterThan(0);
  });
  it('viser revisjonsteksten også når Rev.-nummeret er tomt', () => {
    const p = testplan();
    const date = footerLine(p);
    p.plan.layout.revision = { on: true, number: 'B', text: 'Ny fase' };
    expect(footerLine(p)).toBe(`Rev. B – Ny fase  ·  ${date}`);
    p.plan.layout.revision = { on: true, number: ' ', text: 'Utkast til møte' };
    expect(footerLine(p)).toBe(`Utkast til møte  ·  ${date}`);
    p.plan.layout.revision = { on: true, number: 'C' };
    expect(footerLine(p)).toBe(`Rev. C  ·  ${date}`);
    p.plan.layout.revision = { on: true, number: '', text: '  ' };
    expect(footerLine(p)).toBe(date);
    p.plan.layout.revision = { on: false, number: 'B', text: 'Ny fase' };
    expect(footerLine(p)).toBe(date);
  });
});

describe('egne størrelser på topptekst og forklaring', () => {
  it('teksten til høyre og forklaringen følger forholdet, forklaringen og datoen likt', () => {
    const p = testplan();
    const opts = { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true, style: 'ny' } as const;
    p.plan.layout.headerRight = 'Rev. A';
    const A = computeLayout(p, opts, approxMeasure);
    expect(A.headerRight!.size / PT_TO_MM).toBeCloseTo(A.headerRightBasePt, 6);
    expect(A.subtitle.size / PT_TO_MM).toBeCloseTo(A.legendBasePt, 6);
    p.plan.layout.headerRightScale = 1.5;
    p.plan.layout.legendScale = 0.8;
    expect(validatePlan(p).errors).toEqual([]);
    const B = computeLayout(p, opts, approxMeasure);
    expect(B.headerRight!.size).toBeCloseTo(A.headerRight!.size * 1.5, 6);
    expect(B.subtitle.size).toBeCloseTo(A.subtitle.size * 0.8, 6);
    expect(B.legend[0].label.size).toBeLessThanOrEqual(B.subtitle.size + 1e-9);
    p.plan.layout.legendScale = 3;
    expect(validatePlan(p).errors.length).toBeGreaterThan(0);
  });
});

describe('forklaringen', () => {
  it('skjuler fag og bruker egen tekst', () => {
    const p = testplan();
    const opts = { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true, style: 'ny' } as const;
    const before = computeLayout(p, opts, approxMeasure).legend;
    expect(before.some((e) => e.trade === 'Betong')).toBe(true);
    p.plan.layout.legendItems = { Betong: { hidden: true }, Elektro: { text: 'Strøm' }, '(ferie)': { text: 'Fellesferie' } };
    const after = computeLayout(p, opts, approxMeasure).legend;
    expect(after.some((e) => e.trade === 'Betong')).toBe(false);
    expect(after.find((e) => e.trade === 'Elektro')!.label.lines[0]).toBe('Strøm');
    expect(after.find((e) => e.symbol === 'holiday')!.label.lines[0]).toBe('Fellesferie');
  });
});

describe('rotert tekst', () => {
  it('brytes i flere linjer når boksen er bred nok, så boksen ikke blir unødig høy', () => {
    const p = testplan();
    const opts = { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: false } as const;
    const b = p.lanes[1].boxes[0]; // lang, bred boks
    b.rotation = 90;
    b.text = 'Montering av utstyr i generatorrom og kontrollrom';
    const it = computeLayout(p, opts, approxMeasure).items.find((i) => i.id === b.id) as Extract<Item, { kind: 'box' }>;
    expect(it.text!.lines.length).toBeGreaterThan(1);
    // Linjene får plass side om side i boksen
    expect(it.text!.lines.length * it.text!.size * LINE_HEIGHT).toBeLessThanOrEqual(it.x1 - it.x0);
  });
});

describe('rotert tekst og høyde', () => {
  it('får færre linjer når boksen gjøres høyere', () => {
    const p = testplan();
    const opts = { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: false } as const;
    const b = p.lanes[1].boxes[0];
    b.rotation = 90;
    b.text = 'Montering av utstyr i generatorrom og kontrollrom';
    const get = () => computeLayout(p, opts, approxMeasure).items.find((i) => i.id === b.id) as Extract<Item, { kind: 'box' }>;
    const n0 = get().text!.lines.length;
    b.height = 30;
    expect(get().text!.lines.length).toBeLessThan(n0);
    b.height = 60;
    expect(get().text!.lines).toEqual([b.text]);
  });
});

describe('Multi Lane-boks', () => {
  const o = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: true };
  const setup = () => {
    const p = example();
    const vis = p.lanes.filter((l) => l.shown && !l.hidden);
    const lane = vis.find((l) => l.boxes.some((b) => b.shown && !b.resolved?.isMilestone))!;
    const box = lane.boxes.find((b) => b.shown && !b.resolved?.isMilestone)!;
    const at = vis.indexOf(lane);
    return { p, vis, lane, box, at };
  };
  it('går ned til bunnen av valgt lane uten å gjøre noen lane høyere', () => {
    const { p, vis, box, at } = setup();
    const before = computeLayout(p, o, approxMeasure);
    const target = vis[Math.min(at + 2, vis.length - 1)];
    box.spanTo = target.id;
    const L = computeLayout(p, o, approxMeasure);
    L.lanes.forEach((l, i) => expect(l.y1 - l.y0).toBeCloseTo(before.lanes[i].y1 - before.lanes[i].y0, 6));
    const it = L.items.find((i) => i.id === box.id)!;
    expect(it.kind).toBe('box');
    const tl = L.lanes.find((l) => l.id === target.id)!;
    if (it.kind === 'box') {
      expect(it.span).toBe(true);
      expect(it.callout).toBeNull();
      expect(it.y + it.h).toBeCloseTo(tl.y1 - (tl.top - tl.y0), 5);
    }
    // Tegnes først, bak alle andre bokser
    expect(L.items[0].id).toBe(box.id);
  });
  it('egen bunn i Kompakt gjelder bare Kompakt, ellers brukes bunnen fra «Fyll hele arket»', () => {
    const { p, box, lane } = setup();
    box.spanTo = lane.id;
    const bottom = (mode: 'fill' | 'compact') => {
      const L = computeLayout(p, { ...o, heightMode: mode }, approxMeasure);
      const it = L.items.find((i) => i.id === box.id)!;
      return it.kind === 'box' ? (it.y + it.h - L.lanes.find((l) => l.id === lane.id)!.top) / L.unit : NaN;
    };
    box.spanEnd = 2;
    expect(bottom('compact')).toBeCloseTo(2);
    box.compactSpanEnd = 1.5;
    expect(bottom('compact')).toBeCloseTo(1.5);
    expect(bottom('fill')).toBeCloseTo(2);
  });
  it('skjult eller ukjent lane gir boksens egen lane som bunn', () => {
    const { p, box, lane } = setup();
    box.spanTo = 'finnes-ikke';
    const L = computeLayout(p, o, approxMeasure);
    const it = L.items.find((i) => i.id === box.id)!;
    const ll = L.lanes.find((l) => l.id === lane.id)!;
    if (it.kind === 'box') expect(it.y + it.h).toBeCloseTo(ll.y1 - (ll.top - ll.y0), 5);
  });
  it('spanTo godtas av valideringen og må være tekst', () => {
    const { p, box } = setup();
    box.spanTo = p.lanes[0].id;
    expect(validatePlan(JSON.parse(JSON.stringify(p))).errors).toEqual([]);
    (box as unknown as { spanTo: number }).spanTo = 3;
    expect(validatePlan(JSON.parse(JSON.stringify(p))).errors.length).toBeGreaterThan(0);
  });
});

describe('Multi Lane-boks: tekst i midten og fet skrift', () => {
  const o = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: true };
  const pick = () => {
    const p = testplan();
    const vis = p.lanes.filter((l) => l.shown && !l.hidden);
    const lane = vis.find((l) => l.boxes.some((b) => b.shown && !b.resolved?.isMilestone && b.text.trim()))!;
    const box = lane.boxes.find((b) => b.shown && !b.resolved?.isMilestone && b.text.trim())!;
    box.spanTo = vis[Math.min(vis.indexOf(lane) + 2, vis.length - 1)].id;
    return { p, box };
  };
  it('teksten står øverst som standard, og midt i boksen når det er valgt', () => {
    const { p, box } = pick();
    const top = computeLayout(p, o, approxMeasure).items.find((i) => i.id === box.id)!;
    box.textMiddle = true;
    const mid = computeLayout(p, o, approxMeasure).items.find((i) => i.id === box.id)!;
    if (top.kind !== 'box' || mid.kind !== 'box') throw new Error('ikke boks');
    expect(top.text!.y - top.y).toBeLessThan(top.h / 3);
    const lines = mid.text!.lines.length;
    const centre = mid.text!.y - mid.text!.size * 0.85 + (lines * mid.text!.size * LINE_HEIGHT) / 2;
    expect(centre - mid.y).toBeCloseTo(mid.h / 2, 0);
  });
  it('fet skrift gjelder overskrifts- og Multi Lane-bokser, ikke vanlige', () => {
    const { p, box } = pick();
    box.bold = true;
    const it = computeLayout(p, o, approxMeasure).items.find((i) => i.id === box.id)!;
    expect(it.kind === 'box' && it.text?.bold).toBe(true);
    delete box.spanTo;
    const plain = computeLayout(p, o, approxMeasure).items.find((i) => i.id === box.id)!;
    expect(plain.kind === 'box' && plain.text?.bold).toBeFalsy();
    box.header = true;
    const hdr = computeLayout(p, o, approxMeasure).items.find((i) => i.id === box.id)!;
    expect(hdr.kind === 'box' && hdr.text?.bold).toBe(true);
  });
});

describe('Multi Lane-boks: egen høyde', () => {
  const o = { orientation: 'landscape' as const, heightMode: 'compact' as const, textSizePt: 9, fitToSheet: true };
  it('spanEnd gir bunnen inne i lanen, aldri under lanens bunn', () => {
    const p = testplan();
    const vis = p.lanes.filter((l) => l.shown && !l.hidden);
    const lane = vis.find((l) => l.boxes.some((b) => b.shown && !b.resolved?.isMilestone))!;
    const box = lane.boxes.find((b) => b.shown && !b.resolved?.isMilestone)!;
    const target = vis[Math.min(vis.indexOf(lane) + 1, vis.length - 1)];
    box.spanTo = target.id;
    box.spanEnd = 0.5;
    const L = computeLayout(p, o, approxMeasure);
    const it = L.items.find((i) => i.id === box.id)!;
    const tl = L.lanes.find((l) => l.id === target.id)!;
    if (it.kind !== 'box') throw new Error('ikke boks');
    expect(it.y + it.h).toBeCloseTo(Math.max(it.y + it.minH!, tl.top + 0.5 * L.unit), 5);
    box.spanEnd = 999;
    const L2 = computeLayout(p, o, approxMeasure);
    const it2 = L2.items.find((i) => i.id === box.id)!;
    const tl2 = L2.lanes.find((l) => l.id === target.id)!;
    expect(it2.kind === 'box' && it2.y + it2.h).toBeCloseTo(tl2.y1 - (tl2.top - tl2.y0), 5);
  });
});
