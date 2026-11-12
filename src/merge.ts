// Oppdater fra Project: fletter en fersk plan inn i en arbeidsfil.
// Datoer, tekst, fag og lanes kommer fra Project. Det brukeren har endret i appen blir stående.
import type { Box, BoxFollow, Lane, PlanFile } from './format/types';
import { applyFollows } from './links';

export interface MergeReport {
  /** Bokser fra Project som fant igjen redigeringene sine. */
  kept: number;
  newBoxes: string[];
  goneBoxes: string[];
  newLanes: string[];
  goneLanes: string[];
  /** Lanes som er borte i Project, men beholdt fordi de har bokser laget i appen. */
  keptLanes: string[];
  /** Bokser der Project har endret teksten du hadde redigert. Teksten fra Project gjelder. */
  textChanged: string[];
  /** Bokser du hadde flyttet, men som Project nå har lagt i en annen lane. Project gjelder. */
  moveDropped: string[];
  /** Bokser der Project har endret faget du hadde endret. Faget fra Project gjelder. */
  tradeChanged: string[];
  /** Lanes der Project har endret navnet du hadde endret. Navnet fra Project gjelder. */
  laneNameChanged: string[];
  manualKept: number;
  /** Lanes laget i appen som er beholdt. */
  manualLanes: number;
  /** Egne bokser som er flyttet fordi boksen de følger, har fått nye datoer. */
  followMoved: string[];
  /** Egne bokser som fulgte en boks som er borte fra Project. De står der de sto. */
  followLost: string[];
}

/** Felt som bare settes i appen og følger boksen. */
const APP_FIELDS = ['fill', 'textColor', 'callout', 'calloutSide', 'height', 'top', 'hidden', 'header', 'spanTo', 'spanEnd', 'compactTop', 'compactSpanEnd', 'textMiddle', 'bold', 'milestoneStyle', 'critical', 'textScale', 'calloutWidthCm'] as const;
/** Valg fra appen som ligger i plan.layout. */
const APP_LAYOUT = ['orientation', 'heightMode', 'textSize', 'paper', 'style', 'fitToSheet', 'minTextSize', 'titleSize', 'title', 'headerRight', 'showLegend', 'showBottomCalendar', 'calendarMode', 'logo', 'tradeColors', 'appTrades', 'criticalLine', 'lookahead', 'statusLine', 'laneTitleScale', 'legendItems', 'headerRightScale', 'legendScale', 'editedAt', 'logoScale', 'calloutMaxWidthCm', 'images', 'planArea'] as const;

const label = (s: string) => s.replace(/\/?\|/g, ' ').replace(/^\*/, '').trim() || '(uten tekst)';
const key = (b: Box) => (b.taskIds.length ? [...b.taskIds].sort((a, c) => a - c).join(',') : '');

export function mergePlans(work: PlanFile, fresh: PlanFile): { plan: PlanFile; report: MergeReport } {
  const plan: PlanFile = structuredClone(fresh);
  const report: MergeReport = { kept: 0, newBoxes: [], goneBoxes: [], newLanes: [], goneLanes: [], keptLanes: [], textChanged: [], tradeChanged: [], moveDropped: [], laneNameChanged: [], manualKept: 0, manualLanes: 0, followMoved: [], followLost: [] };

  for (const k of APP_LAYOUT) if (work.plan.layout[k] !== undefined) (plan.plan.layout as Record<string, unknown>)[k] = structuredClone(work.plan.layout[k]);

  // Gamle bokser fra Project, slått opp på aktivitetene og deretter på id
  const oldLaneOf = new Map<Box, Lane>();
  const byKey = new Map<string, Box>();
  const byId = new Map<string, Box>();
  for (const l of work.lanes)
    for (const b of l.boxes) {
      if (b.manual) continue;
      oldLaneOf.set(b, l);
      const k = key(b);
      if (k && !byKey.has(k)) byKey.set(k, b);
      byId.set(b.id, b);
    }
  const used = new Set<Box>();
  const oldLanes = new Map(work.lanes.map((l) => [l.id, l]));
  const freshLaneIds = new Set(plan.lanes.map((l) => l.id));
  const moves: { box: Box; from: Lane; to: string }[] = [];
  /** Gammel id → boksen fra Project den ble til, så egne bokser finner igjen boksen de følger. */
  const newOf = new Map<string, Box>();

  for (const lane of plan.lanes) {
    const ol = oldLanes.get(lane.id);
    if (!ol) report.newLanes.push(label(lane.name));
    else mergeLane(ol, lane, report);
    for (const fb of lane.boxes) {
      let ob = byKey.get(key(fb));
      if (!ob || used.has(ob)) ob = byId.get(fb.id);
      if (!ob || used.has(ob)) {
        report.newBoxes.push(label(fb.text));
        continue;
      }
      used.add(ob);
      newOf.set(ob.id, fb);
      report.kept++;
      for (const f of APP_FIELDS) if (ob[f] !== undefined) (fb as unknown as Record<string, unknown>)[f] = structuredClone(ob[f]);
      // Fag valgt i appen gjelder så lenge Project ikke har endret faget selv
      if (ob.trade !== undefined) {
        if (fb.resolved && ob.resolved && fb.resolved.trade !== ob.resolved.trade) {
          report.tradeChanged.push(label(fb.text));
          delete fb.trade;
        } else if (fb.resolved?.trade === ob.trade) delete fb.trade;
        else fb.trade = ob.trade;
      }
      // Tekst og rotasjon du har endret, gjelder så lenge Project ikke har endret dem
      if (ob.original) {
        const textOk = fb.text === ob.original.text;
        const rotOk = fb.rotation === ob.original.rotation;
        if (!textOk && ob.text !== ob.original.text) report.textChanged.push(label(fb.text));
        const orig = { text: fb.text, rotation: fb.rotation };
        if (textOk) fb.text = ob.text;
        if (rotOk) fb.rotation = ob.rotation;
        if (fb.text !== orig.text || fb.rotation !== orig.rotation) fb.original = orig;
      }
      // Flyttet til en annen lane i appen: blir der, så lenge Project ikke har flyttet den selv
      const now = oldLaneOf.get(ob)!;
      if (ob.fromLane && now.id !== lane.id) {
        if (ob.fromLane !== lane.id) report.moveDropped.push(label(fb.text));
        else if (freshLaneIds.has(now.id) || now.manual || now.boxes.some((b) => b.manual))
          moves.push({ box: fb, from: lane, to: now.id });
        else report.moveDropped.push(label(fb.text));
      }
    }
  }

  // Lanes laget i appen beholdes alltid. Lanes som er borte i Project, beholdes bare om de har bokser laget i appen.
  for (const ol of work.lanes) {
    if (freshLaneIds.has(ol.id)) continue;
    if (ol.manual) {
      report.manualLanes++;
      plan.lanes.push({ ...structuredClone(ol), boxes: [] });
      continue;
    }
    const manual = ol.boxes.filter((b) => b.manual);
    if (!manual.length) {
      report.goneLanes.push(label(ol.name));
      continue;
    }
    report.keptLanes.push(label(ol.name));
    plan.lanes.push({ ...structuredClone(ol), boxes: [] });
  }

  // Bokser laget i appen følger lanen sin
  const manualOf = new Map<string, Box>();
  for (const ol of work.lanes)
    for (const b of ol.boxes)
      if (b.manual) {
        const c = structuredClone(b);
        manualOf.set(b.id, c);
        plan.lanes.find((l) => l.id === ol.id)!.boxes.push(c);
        report.manualKept++;
      }
  // Koblingene peker på boksene selv til id-ene er ferdige
  const follows: { f: BoxFollow; target: Box }[] = [];
  for (const b of manualOf.values()) {
    if (!b.follows) continue;
    const target = manualOf.get(b.follows.box) ?? newOf.get(b.follows.box);
    if (target) follows.push({ f: b.follows, target });
    else {
      report.followLost.push(label(b.text));
      delete b.follows;
    }
  }

  for (const m of moves) {
    m.from.boxes.splice(m.from.boxes.indexOf(m.box), 1);
    m.box.fromLane = m.from.id;
    plan.lanes.find((l) => l.id === m.to)!.boxes.push(m.box);
  }

  for (const [b] of oldLaneOf) if (!used.has(b)) report.goneBoxes.push(label(b.text));

  plan.lanes = orderLanes(work.lanes.map((l) => l.id), fresh.lanes.map((l) => l.id), plan.lanes);

  // Id-er må være unike: bokser laget i appen får nytt nummer om Project har tatt id-en
  const seen = new Set<string>();
  let n = 1;
  for (const l of plan.lanes)
    for (const b of l.boxes) {
      if (seen.has(b.id)) {
        while (seen.has(`app_${n}`)) n++;
        b.id = `app_${n}`;
      }
      seen.add(b.id);
    }
  for (const { f, target } of follows) f.box = target.id;
  const before = new Map([...manualOf.values()].map((b) => [b, b.resolved?.start]));
  applyFollows(plan);
  for (const [b, start] of before) if (b.resolved?.start !== start) report.followMoved.push(label(b.text));
  return { plan, report };
}

/** Navn, farge, høyde og skjuling fra appen. Navn og farge gjelder så lenge Project ikke har endret dem. */
function mergeLane(ol: Lane, lane: Lane, report: MergeReport) {
  if (ol.height) lane.height = ol.height;
  if (ol.order) lane.order = ol.order;
  if (ol.hidden) lane.hidden = true;
  if (!ol.original) return;
  const orig = { name: lane.name, fill: lane.fill };
  if (lane.name === ol.original.name) lane.name = ol.name;
  else if (ol.name !== ol.original.name) report.laneNameChanged.push(label(lane.name));
  if ((lane.fill ?? '').toUpperCase() === (ol.original.fill ?? '').toUpperCase()) lane.fill = ol.fill;
  if (lane.name !== orig.name || lane.fill !== orig.fill) lane.original = orig;
}

/**
 * Rekkefølgen fra arbeidsfilen gjelder. Nye lanes fra Project settes inn rett etter
 * lanen de kommer etter i Project, eller først om de er først der.
 */
function orderLanes(workOrder: string[], freshOrder: string[], lanes: Lane[]): Lane[] {
  const byId = new Map(lanes.map((l) => [l.id, l]));
  const known = new Set(workOrder);
  const out = workOrder.filter((id) => byId.has(id));
  freshOrder.forEach((id, i) => {
    if (known.has(id) || !byId.has(id)) return;
    const prev = i > 0 ? out.indexOf(freshOrder[i - 1]) : -1;
    out.splice(prev + 1, 0, id);
  });
  for (const l of lanes) if (!out.includes(l.id)) out.push(l.id);
  return out.map((id) => byId.get(id)!);
}

/** Kort sammendrag til statuslinjen. */
export function summarizeMerge(r: MergeReport): string {
  const parts = [
    `${r.kept} bokser oppdatert`,
    r.newBoxes.length && `${r.newBoxes.length} nye`,
    r.goneBoxes.length && `${r.goneBoxes.length} borte`,
    r.newLanes.length && `${r.newLanes.length} nye lanes`,
    r.goneLanes.length && `${r.goneLanes.length} lanes borte`,
    r.manualKept && `${r.manualKept} egne bokser beholdt`,
    r.manualLanes && `${r.manualLanes} egne lanes beholdt`,
    r.followMoved.length && `${r.followMoved.length} egne bokser flyttet med`,
  ].filter(Boolean);
  return `Oppdatert fra Project: ${parts.join(', ')}.`;
}
