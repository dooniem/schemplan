// «Størst mulig tekst»: gir hver boks den største teksten som får plass i boksen slik den er nå,
// og lane-titlene én felles størrelse. Planen skal se lik ut ellers: ingen boks eller lane blir
// høyere, og teksten i resten av planen krymper ikke.
import { snapshotOf } from '../editmodel';
import type { Box, PlanFile } from '../format/types';
import { parseBoxText } from '../format/text';
import { computeLayout, defaultLaneTitleScale, laneTitleScaleOf, MAX_TEXT_SCALE, PAD_X, PAD_Y, rotatedLines, type BoxItem, type Layout, type LayoutOptions } from './layout';
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
