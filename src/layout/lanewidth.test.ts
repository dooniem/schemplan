import { describe, expect, it } from 'vitest';
import { computeLayout } from './layout';
import { approxMeasure, wrapHyphenated } from './text';
import { laneColumnWidth, MAX_SHARE, widthToEm } from './lanewidth';
import { remapPlanArea } from '../lanewidthui';
import { testplan } from '../test/testplaner';
import { mergePlans } from '../merge';

const OPTS = { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true } as const;
const colW = (L: ReturnType<typeof computeLayout>) => L.plot.x0 - L.laneTitleX;

describe('valgt bredde på lane-kolonnen', () => {
  it('er automatisk uten valg, og følger valgt bredde ellers', () => {
    const p = testplan();
    const L0 = computeLayout(p, OPTS, approxMeasure);
    expect(L0.laneCol.chosen).toBe(false);
    p.plan.layout.laneTitleWidth = widthToEm(60, L0.laneCol.size);
    const L1 = computeLayout(p, OPTS, approxMeasure);
    expect(L1.laneCol.chosen).toBe(true);
    expect(colW(L1)).toBeGreaterThan(colW(L0));
  });

  it('følger tekststørrelsen på navnene, så linjeskiftene blir like', () => {
    const p = testplan();
    p.lanes[0].name = 'Kabelkanaler og trekkerør';
    const L0 = computeLayout(p, OPTS, approxMeasure);
    p.plan.layout.laneTitleWidth = widthToEm(80, L0.laneCol.size);
    const a = computeLayout(p, OPTS, approxMeasure);
    p.plan.layout.laneTitleScale = 1.6;
    const b = computeLayout(p, OPTS, approxMeasure);
    expect(colW(b) / b.laneCol.size).toBeCloseTo(colW(a) / a.laneCol.size, 5);
    expect(b.lanes[0].title.lines).toEqual(a.lanes[0].title.lines);
    // Samme på A4 stående, med standard størrelse på navnene
    delete p.plan.layout.laneTitleScale;
    const c = computeLayout(p, { ...OPTS, paper: 'A4', orientation: 'portrait' }, approxMeasure);
    expect(c.lanes[0].title.lines).toEqual(a.lanes[0].title.lines);
  });

  it('tar aldri mer enn en tredjedel av arket, og blir aldri smalere enn minstebredden', () => {
    const base = { longestWord: 30, widestName: 50, pad: 3.4, size: 3.6, sheetW: 420 };
    expect(laneColumnWidth({ ...base, chosen: 200 })).toBeCloseTo(420 * MAX_SHARE);
    expect(laneColumnWidth({ ...base, chosen: 0.1 })).toBeCloseTo(4 * 3.6 + 3.4);
    // Lengste ord setter ikke grensen når bredden er valgt
    expect(laneColumnWidth({ ...base, chosen: 5 })).toBeLessThan(30);
  });

  it('følger med ved oppdatering fra Project', () => {
    const work = testplan();
    work.plan.layout.laneTitleWidth = 20;
    expect(mergePlans(work, testplan()).plan.plan.layout.laneTitleWidth).toBe(20);
  });
});

describe('deling av lange ord', () => {
  const m = approxMeasure;
  it('foretrekker bindestreken i ordet', () => {
    const w = m('Høyesteretts-', 4, true) + 0.01;
    expect(wrapHyphenated(['Høyesteretts-justitiarius'], w, 4, m, true)).toEqual(['Høyesteretts-', 'justitiarius']);
  });
  it('står på én linje når det er plass', () => {
    expect(wrapHyphenated(['Høyesteretts-justitiarius'], 500, 4, m, true)).toEqual(['Høyesteretts-justitiarius']);
  });
  it('deler for lange ord med bindestrek', () => {
    const lines = wrapHyphenated(['Høyesterettsjustitiarius'], m('Høyesterett', 4, true), 4, m, true);
    expect(lines.length).toBe(3);
    expect(lines[0].endsWith('-')).toBe(true);
    expect(lines.join('').replace(/-/g, '')).toBe('Høyesterettsjustitiarius');
  });
  it('lar ikke ett eller to tegn stå alene på neste linje', () => {
    const lines = wrapHyphenated(['Betong'], m('Beto-', 4, true) + 0.01, 4, m, true);
    expect(lines).toEqual(['Bet-', 'ong']);
  });
  it('holder ord uten for lange deler hele', () => {
    expect(wrapHyphenated(['Grunnarbeid og sprengning'], m('Grunnarbeid og', 4, true) + 0.01, 4, m, true)).toEqual(['Grunnarbeid og', 'sprengning']);
  });
});

describe('planområdet følger tidsaksen', () => {
  it('flytter knekkpunktene så de beholder datoen', () => {
    const p = testplan();
    p.plan.layout.planArea = { top: [[0, 0.2], [0.5, 0.3], [1, 0.2]] };
    // Tidsaksen går fra 30 til 410 mm og så fra 60 til 410 mm på et 420 mm bredt ark
    remapPlanArea(p, 420, [30, 410], [60, 410]);
    const top = p.plan.layout.planArea!.top!;
    expect(top[0][0] * 420).toBeCloseTo(60, 2);
    const t = (0.5 * 420 - 30) / 380;
    expect(top[1][0] * 420).toBeCloseTo(60 + t * 350, 1);
    expect(top[2][0] * 420).toBeCloseTo(410, 1);
    expect(top[1][1]).toBe(0.3);
  });
});

describe('grupper: loddrette lane-navn og bredde på baren', () => {
  const grouped = () => {
    const p = testplan();
    const ids = p.lanes.filter((l) => l.shown).slice(0, 2).map((l) => l.id);
    p.lanes.find((l) => l.id === ids[0])!.name = 'Kabelkanaler og trekkerør';
    p.plan.layout.laneGroups = [{ id: 'g', name: 'Nord', fill: '#CEE5ED', lanes: ids }];
    return { p, ids };
  };

  it('tegner navnene loddrett, og lanen blir høy nok til navnet', () => {
    const { p, ids } = grouped();
    p.plan.layout.laneGroups![0].rotateNames = true;
    const L = computeLayout(p, { ...OPTS, heightMode: 'compact' }, approxMeasure);
    const ln = L.lanes.find((l) => l.id === ids[0])!;
    expect(ln.title.rotate).toBe(-90);
    const longest = Math.max(...ln.title.lines.map((t) => approxMeasure(t, ln.title.size, true)));
    expect(ln.y1 - ln.y0).toBeGreaterThanOrEqual(longest);
    // Lanes utenfor gruppen står som før
    const other = L.lanes.find((l) => !ids.includes(l.id))!;
    expect(other.title.rotate).toBeUndefined();
  });

  it('gir baren valgt bredde, som følger tekststørrelsen', () => {
    const { p } = grouped();
    const auto = computeLayout(p, OPTS, approxMeasure).laneGroups[0];
    expect(auto.chosen).toBe(false);
    p.plan.layout.laneGroups![0].barWidth = 3;
    const a = computeLayout(p, OPTS, approxMeasure);
    expect(a.laneGroups[0].chosen).toBe(true);
    expect(a.laneGroups[0].x1 - a.laneGroups[0].x0).toBeCloseTo(3 * a.laneCol.size, 5);
    expect(a.laneGroups[0].autoW).toBeCloseTo(auto.x1 - auto.x0, 5);
    // Aldri mer enn 60 % av kolonnen
    p.plan.layout.laneGroups![0].barWidth = 200;
    const b = computeLayout(p, OPTS, approxMeasure);
    expect(b.laneGroups[0].x1 - b.laneGroups[0].x0).toBeCloseTo((b.plot.x0 - b.laneTitleX) * 0.6, 5);
  });
});
