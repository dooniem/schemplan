// «Størst mulig tekst»: større tekst i boksene og lane-titlene uten at planens tekst krymper
// eller planen blir høyere. fitTextIntoLaneSpace lar boksene bli høyere der det er ledig plass;
// fitTextToBoxes bruker bare plassen inne i boksene slik de står, og gir lane-titlene én felles størrelse.
import { snapshotOf } from '../editmodel';
import type { Box, PlanFile } from '../format/types';
import { parseBoxText } from '../format/text';
import { computeLayout, defaultLaneTitleScale, layoutAtScale, laneTitleScaleOf, MAX_TEXT_SCALE, PAD_X, PAD_Y, rotatedLines, type BoxItem, type Layout, type LayoutOptions } from './layout';
import { LINE_HEIGHT, PT_TO_MM, widest, wrapLines, type Measure } from './text';

/** Tilpasset tekst blir aldri større enn dette, selv om planens tekst er stor. */
export const MAX_FIT_PT = 14;
/** Lane-titlene blir høyst halvannen gang så store som planens tekst, så de ikke roper. */
export const MAX_LANE_TITLE_SCALE = 1.5;
/** Størrelsene går i halve punkter, så like bokser får lik tekst og planen ser rolig ut. */
const STEP_PT = 0.5;
const EPS = 1e-6;

export interface FitTextScope {
  /** Lanene som tilpasses. Mangler den: alle. */
  laneIds?: string[];
  /** Bare disse boksene. Mangler den: alle i lanene. */
  boxIds?: Set<string> | null;
  /** Tilpass lane-titlene også (bare når hele planen tilpasses, siden de har felles størrelse). */
  laneTitles: boolean;
}

export interface FitTextResult {
  plan: PlanFile;
  /** Bokser som fikk større tekst enn planens. */
  grown: number;
  /** Største tekst i en boks, i punkter. */
  maxPt: number;
  /** Lane-titlenes størrelse i punkter, eller null når de ikke ble tilpasset. */
  laneTitlePt: number | null;
  /** Planens tekst i punkter. */
  planPt: number;
}

/** Største størrelse, i halve punkter, fra taket og ned mot planens tekst. */
function candidates(planPt: number, scale = MAX_TEXT_SCALE): number[] {
  const cap = Math.min(planPt * scale, Math.max(planPt, MAX_FIT_PT));
  const out: number[] = [];
  for (let pt = Math.floor((cap + EPS) / STEP_PT) * STEP_PT; pt > planPt + EPS; pt -= STEP_PT) out.push(pt);
  return out;
}

const sameFit = (a: Layout, b: Layout) => Math.abs(a.textScale - b.textScale) < EPS && (!b.overflow || a.overflow) && b.plot.y1 <= a.plot.y1 + EPS;

/** Høyden teksten trenger i en boks med bredde w, eller null når den ikke får plass uten callout eller delte ord. */
export function textHeightInBox(box: Pick<Box, 'text' | 'rotation' | 'callout'>, w: number, sizeMm: number, measure: Measure): number | null {
  const raw = parseBoxText(box.text).lines;
  const lh = sizeMm * LINE_HEIGHT;
  if (box.rotation !== 0) {
    const lines = rotatedLines(raw, w - 2 * PAD_X, sizeMm, measure);
    if (lines.length * lh > w - 2 * PAD_X + EPS) return null;
    return widest(lines, sizeMm, measure) + 2 * PAD_Y + 1;
  }
  const inner = Math.max(w - 2 * PAD_X, 0.5);
  const words = raw.flatMap((l) => l.split(/\s+/)).filter(Boolean);
  if (words.some((wd) => measure(wd, sizeMm) > inner + EPS)) return null;
  const lines = wrapLines(raw, inner, sizeMm, measure);
  const h = lines.length * lh + 2 * PAD_Y;
  // Samme grense som gir callout når planen tegnes
  if (box.callout !== 'off' && w / h < 0.25) return null;
  return h;
}

/** Finner størst mulig tekst for boksene og lane-titlene. Endrer ikke planen som sendes inn. */
export function fitTextToBoxes(file: PlanFile, opts: LayoutOptions, measure: Measure, scope: FitTextScope): FitTextResult {
  const before = computeLayout(file, opts, measure);
  const planPt = before.textSizePt;
  const next: PlanFile = snapshotOf(file);
  const laneIds = new Set(scope.laneIds ?? next.lanes.map((l) => l.id));
  let laneTitlePt: number | null = null;

  // ---- Lane-titlene: én størrelse for alle, den største som ikke gjør planen høyere eller teksten mindre ----
  if (scope.laneTitles) {
    const lay = next.plan.layout;
    let found = false;
    for (const pt of candidates(planPt, MAX_LANE_TITLE_SCALE)) {
      lay.laneTitleScale = pt / planPt;
      // Standardstørrelsen lagres ikke, så den følger med om standarden endres
      if (Math.abs(lay.laneTitleScale - defaultLaneTitleScale(planPt)) < EPS) delete lay.laneTitleScale;
      if (sameFit(before, computeLayout(next, opts, measure))) {
        laneTitlePt = pt;
        found = true;
        break;
      }
    }
    if (!found) {
      // Ingen større størrelse får plass: navnene beholder størrelsen de har
      if (file.plan.layout.laneTitleScale === undefined) delete lay.laneTitleScale;
      else lay.laneTitleScale = file.plan.layout.laneTitleScale;
      laneTitlePt = planPt * laneTitleScaleOf(lay, planPt);
    }
  }

  // ---- Boksene: størst mulig tekst innenfor boksen slik den står ----
  const L = computeLayout(next, opts, measure);
  const items = new Map(L.items.filter((i): i is BoxItem => i.kind === 'box').map((i) => [i.id, i]));
  let grown = 0;
  let maxPt = planPt;
  for (const lane of next.lanes) {
    if (!laneIds.has(lane.id)) continue;
    for (const box of lane.boxes) {
      if (scope.boxIds && !scope.boxIds.has(box.id)) continue;
      const it = items.get(box.id);
      // Callout, overskriftsbokser og milepæler beholder planens tekst
      if (!it || !it.text || it.callout || it.header || box.resolved?.isMilestone) continue;
      const w = it.x1 - it.x0;
      let best: { pt: number; h: number } | null = null;
      for (const pt of candidates(planPt)) {
        const h = textHeightInBox(box, w, pt * PT_TO_MM, measure);
        if (h !== null && h <= it.h + EPS) {
          best = { pt, h };
          break;
        }
      }
      if (!best) {
        delete box.textScale;
        continue;
      }
      box.textScale = Math.round((best.pt / planPt) * 10000) / 10000;
      // Boksen beholder høyden den har, også når den nye teksten trenger mindre plass
      if (box.height === undefined && best.h < it.h - EPS) box.height = Math.ceil((it.h / L.unit) * 100) / 100;
      grown++;
      maxPt = Math.max(maxPt, best.pt);
    }
  }

  // Sikkerhetsnett: krympet planen likevel, beholdes ikke endringen
  const after = computeLayout(next, opts, measure);
  if (!sameFit(before, after)) {
    if (scope.laneTitles && next.plan.layout.laneTitleScale !== file.plan.layout.laneTitleScale)
      return fitTextToBoxes(file, opts, measure, { ...scope, laneTitles: false });
    return { plan: snapshotOf(file), grown: 0, maxPt: planPt, laneTitlePt: null, planPt };
  }
  return { plan: next, grown, maxPt, laneTitlePt, planPt };
}

/**
 * «Størst mulig tekst»: boksene får større tekst og blir høyere der det er ledig plass,
 * i lanen eller på arket. Alle går opp en halv pt om gangen, så teksten blir så lik som mulig;
 * en boks stopper når neste steg ville krympet planens tekst, gjort planen høyere eller gitt callout.
 * Lanene kan få andre høyder. Bokser som deler høyden med en annen boks i lanen, kan vokse uten at lanen gjør det.
 */
export function fitTextIntoLaneSpace(input: PlanFile, opts: LayoutOptions, measure: Measure, scope: FitTextScope): FitTextResult {
  // Større lane-titler kan gi boksene mer plass og omvendt, så det gjentas til ingenting endrer seg
  let res = growOnce(input, opts, measure, scope);
  for (let i = 0; i < 4 && (res.grown || res.titlesChanged); i++) {
    const again = growOnce(res.plan, opts, measure, scope);
    if (!again.grown && !again.titlesChanged) break;
    res = { ...again, titlesChanged: true };
  }
  const scaleOf = (b: Box) => b.textScale ?? 1;
  const old = new Map(input.lanes.flatMap((l) => l.boxes.map((b) => [b.id, scaleOf(b)] as const)));
  const grownBoxes = res.plan.lanes.flatMap((l) => l.boxes).filter((b) => scaleOf(b) > (old.get(b.id) ?? 1) + EPS);
  // Skalaen er rundet, så punktene rundes tilbake til halve pt
  const maxPt = grownBoxes.reduce((m, b) => Math.max(m, Math.round((scaleOf(b) * res.planPt) / STEP_PT) * STEP_PT), res.planPt);
  return { plan: res.plan, grown: grownBoxes.length, maxPt, laneTitlePt: res.laneTitlePt, planPt: res.planPt };
}

/** Én runde: lane-titlene først, så boksene en halv pt om gangen. */
function growOnce(input: PlanFile, opts: LayoutOptions, measure: Measure, scope: FitTextScope): FitTextResult & { titlesChanged: boolean } {
  // Lane-titlene først, med den vanlige regelen. Større titler kan gjøre lanene høyere, og den plassen kan boksene bruke.
  const titles = scope.laneTitles ? fitTextToBoxes(input, opts, measure, { laneIds: scope.laneIds, boxIds: new Set(), laneTitles: true }) : null;
  const file = titles?.plan ?? input;
  const before = computeLayout(file, opts, measure);
  const planPt = before.textSizePt;
  const cap = candidates(planPt)[0] ?? planPt;
  // Underveis tegnes planen med fast tekststørrelse, så lanehøydene kan sammenlignes, og det går raskere
  const at = (p: PlanFile) => layoutAtScale(p, opts, measure, before.textScale);
  const start = at(file);
  const fitsFixed = (L: Layout) => (!L.overflow || start.overflow) && L.plot.y1 <= start.plot.y1 + EPS;
  const plan: PlanFile = snapshotOf(file);
  const laneIds = new Set(scope.laneIds ?? plan.lanes.map((l) => l.id));
  const items = new Map(before.items.filter((i): i is BoxItem => i.kind === 'box').map((i) => [i.id, i]));
  const minHOf = (L: Layout) => new Map(L.lanes.map((l) => [l.id, l.minH]));
  let laneMinH = minHOf(start);

  // Boksene som kan få større tekst, per lane, med bredden de har nå
  type Target = { box: Box; lane: string; w: number; pt: number; start: number; done: boolean };
  const perLane: Target[][] = [];
  for (const lane of plan.lanes) {
    if (!laneIds.has(lane.id)) continue;
    const list: Target[] = [];
    for (const box of lane.boxes) {
      if (scope.boxIds && !scope.boxIds.has(box.id)) continue;
      const it = items.get(box.id);
      if (!it || !it.text || it.callout || it.header || it.span || box.resolved?.isMilestone) continue;
      const pt = Math.max(planPt, (box.textScale ?? 1) * planPt);
      list.push({ box, lane: lane.id, w: it.x1 - it.x0, pt, start: pt, done: false });
    }
    if (list.length) perLane.push(list);
  }

  // Én boks per lane prøves om gangen, så det er klart hvilken boks som gjorde lanen høyere
  const scaleOf = (pt: number) => Math.round((pt / planPt) * 10000) / 10000;
  // Flere runder: en boks som stoppet tidlig, kan ha fått plass etter at de andre er ferdige
  for (let pass = 0; pass < 4; pass++) {
    const was = perLane.flat().map((t) => t.pt);
    while (perLane.some((l) => l.some((t) => !t.done))) {
      const slots = Math.max(...perLane.map((l) => l.length));
      for (let j = 0; j < slots; j++) {
        const tried: { t: Target; old: number | undefined; pt: number }[] = [];
        for (const list of perLane) {
          const t = list[j];
          if (!t || t.done) continue;
          const pt = Math.floor((t.pt + STEP_PT + EPS) / STEP_PT) * STEP_PT;
          if (pt > cap + EPS || textHeightInBox(t.box, t.w, pt * PT_TO_MM, measure) === null) {
            t.done = true;
            continue;
          }
          tried.push({ t, old: t.box.textScale, pt });
          t.box.textScale = scaleOf(pt);
        }
        if (!tried.length) continue;
        const L = at(plan);
        const mh = minHOf(L);
        const callout = new Set(L.items.filter((i) => i.kind === 'box' && !!i.callout).map((i) => i.id));
        const grew = (t: Target) => (mh.get(t.lane) ?? 0) > (laneMinH.get(t.lane) ?? 0) + EPS;
        // Krympet planen eller ble den høyere, går bokser som gjorde lanen sin høyere tilbake. Uten slike: alle.
        const fits = fitsFixed(L);
        const anyGrew = tried.some(({ t }) => grew(t));
        const undo = (t: Target) => callout.has(t.box.id) || (!fits && (grew(t) || !anyGrew));
        for (const { t, old, pt } of tried) {
          if (!undo(t)) {
            t.pt = pt;
            continue;
          }
          if (old === undefined) delete t.box.textScale;
          else t.box.textScale = old;
          t.done = true;
        }
        if (fits) laneMinH = mh;
        else if (tried.some(({ t }) => !undo(t))) laneMinH = minHOf(at(plan));
      }
    }
    const all = perLane.flat();
    if (all.every((t, i) => t.pt <= was[i] + EPS)) break;
    laneMinH = minHOf(at(plan));
    for (const t of all) t.done = false;
  }

  // Sikkerhetsnett: planen skal ikke ha krympet eller blitt høyere
  const all = perLane.flat();
  const ok = sameFit(before, computeLayout(plan, opts, measure));
  const grown = ok ? all.filter((t) => t.pt > t.start + EPS) : [];
  const result = ok ? plan : snapshotOf(file);
  const laneTitlePt = titles?.laneTitlePt ?? null;
  const titlesChanged = file.plan.layout.laneTitleScale !== input.plan.layout.laneTitleScale;
  return { plan: result, grown: grown.length, maxPt: grown.reduce((m, t) => Math.max(m, t.pt), planPt), laneTitlePt, planPt, titlesChanged };
}

/** Standard tekststørrelse: planens tekst i boksene, og standardstørrelsen på lane-titlene. Faste høyder som ble satt for å holde på plassen, blir stående. */
export function resetTextSizes(file: PlanFile, scope: FitTextScope): PlanFile {
  const next: PlanFile = snapshotOf(file);
  const laneIds = new Set(scope.laneIds ?? next.lanes.map((l) => l.id));
  for (const lane of next.lanes) {
    if (!laneIds.has(lane.id)) continue;
    for (const b of lane.boxes) if (!scope.boxIds || scope.boxIds.has(b.id)) delete b.textScale;
  }
  if (scope.laneTitles) delete next.plan.layout.laneTitleScale;
  return next;
}
