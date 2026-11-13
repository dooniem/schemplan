// Endringer i selve planen: finne, flytte, lage og tilbakestille bokser og lanes.
// Ingen DOM her, så det kan testes for seg og brukes av redigeringen i editor.ts.
/**
 * Kopi av planen til angre-historikken. Tekst deles med originalen i stedet for å kopieres
 * (tekst kan ikke endres i JavaScript), så store bilder ikke tar nytt minne for hvert steg.
 */
export function snapshotOf<T>(v: T): T {
  if (Array.isArray(v)) return v.map(snapshotOf) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = snapshotOf(x);
    return out as T;
  }
  return v;
}
import type { Box, Lane, PlanFile } from './format/types';
import type { Item } from './layout/layout';

export function findLane(plan: PlanFile, id: string): Lane | null {
  return plan.lanes.find((l) => l.id === id) ?? null;
}

export function findBox(plan: PlanFile, id: string): Box | null {
  for (const l of plan.lanes) for (const b of l.boxes) if (b.id === id) return b;
  return null;
}

/** Boksen har fast plass i lanen, i «Fyll hele arket» eller i Kompakt. */
export const pinned = (b: Box): boolean => b.top !== undefined || b.compactTop !== undefined;
/** Løsner boksen i begge visningene. */
export function unpinBox(b: Box): void {
  delete b.top;
  delete b.compactTop;
}

/** Har brukeren overstyrt noe på boksen? */
export function isEdited(b: Box): boolean {
  return !!(b.trade !== undefined || b.fill || b.textColor || (b.callout && b.callout !== 'auto') || (b.calloutSide && b.calloutSide !== 'auto') || b.original || b.height || b.top !== undefined || b.compactTop !== undefined || b.hidden || b.fromLane || b.manual || b.header || b.spanTo !== undefined || b.textMiddle || b.bold || b.milestoneStyle || b.textScale || b.calloutWidthCm);
}

/** Fjerner alt brukeren har overstyrt, og setter tekst og rotasjon tilbake. */
export function resetBox(b: Box): void {
  if (b.original) {
    b.text = b.original.text;
    b.rotation = b.original.rotation;
  }
  delete b.original;
  delete b.trade;
  delete b.fill;
  delete b.textColor;
  delete b.callout;
  delete b.calloutSide;
  delete b.height;
  delete b.top;
  delete b.compactTop;
  delete b.hidden;
  delete b.header;
  delete b.spanTo;
  delete b.spanEnd;
  delete b.compactSpanEnd;
  delete b.textMiddle;
  delete b.bold;
  delete b.milestoneStyle;
  delete b.textScale;
  delete b.calloutWidthCm;
}

/** Lanen boksen ligger i nå. */
export function laneOf(plan: PlanFile, id: string): Lane | null {
  return plan.lanes.find((l) => l.boxes.some((b) => b.id === id)) ?? null;
}

/** Flytter boksen til en annen lane, sist i lanen. Husker lanen den kom fra, så den kan flyttes tilbake. */
export function moveBox(plan: PlanFile, id: string, toLane: string): void {
  const from = laneOf(plan, id);
  const to = plan.lanes.find((l) => l.id === toLane);
  if (!from || !to || from === to) return;
  const i = from.boxes.findIndex((b) => b.id === id);
  const [b] = from.boxes.splice(i, 1);
  if (!b.manual) {
    if (!b.fromLane) b.fromLane = from.id;
    if (b.fromLane === to.id) delete b.fromLane;
  }
  to.boxes.push(b);
}

/** Tilbakestiller boksen, og flytter den tilbake til lanen den kom fra. */
export function resetBoxInPlan(plan: PlanFile, id: string): void {
  const b = findBox(plan, id);
  if (!b) return;
  resetBox(b);
  if (b.fromLane) moveBox(plan, id, b.fromLane);
}

export const newId = (plan: PlanFile) => {
  const used = new Set(plan.lanes.flatMap((l) => l.boxes.map((b) => b.id)));
  let n = 1;
  while (used.has(`app_${n}`)) n++;
  return `app_${n}`;
};

/** Kopi av boksen rett etter den i samme lane. Kopien er laget i appen og følger ikke Project. */
export function copyBox(plan: PlanFile, id: string): Box | null {
  const lane = laneOf(plan, id);
  const src = lane && lane.boxes.find((b) => b.id === id);
  if (!lane || !src) return null;
  const b: Box = structuredClone(src);
  b.id = newId(plan);
  b.taskIds = [];
  b.manual = true;
  delete b.top;
  delete b.compactTop;
  delete b.original;
  delete b.fromLane;
  delete b.hidden;
  delete b.critical;
  lane.boxes.splice(lane.boxes.indexOf(src) + 1, 0, b);
  return b;
}

/**
 * Limer inn kopierte bokser (Ctrl+V) i lanen. Uten lane, eller om lanen ikke finnes, havner hver
 * boks i lanen den ble kopiert fra, ellers i første viste lane. Kopiene er laget i appen og følger
 * ikke Project, som med Ctrl+D. Gir de nye boksene.
 */
export function pasteBoxes(plan: PlanFile, items: { box: Box; lane: string }[], laneId: string | null): Box[] {
  const fallback = plan.lanes.find((l) => l.shown && !l.hidden) ?? plan.lanes[0];
  const out: Box[] = [];
  for (const it of items) {
    const lane = plan.lanes.find((l) => l.id === laneId) ?? plan.lanes.find((l) => l.id === it.lane) ?? fallback;
    if (!lane) break;
    const b: Box = structuredClone(it.box);
    b.id = newId(plan);
    b.taskIds = [];
    b.manual = true;
    delete b.top;
    delete b.compactTop;
    delete b.original;
    delete b.fromLane;
    delete b.hidden;
    delete b.critical;
    b.shown = true;
    lane.boxes.push(b);
    out.push(b);
  }
  return out;
}

/** Ny boks i lanen, laget i appen. */
export function newBox(plan: PlanFile, laneId: string, start: string, finish: string): Box | null {
  const lane = plan.lanes.find((l) => l.id === laneId);
  if (!lane) return null;
  const b: Box = { id: newId(plan), text: 'Ny boks', taskIds: [], rotation: 0, milestone: null, shown: true, manual: true, resolved: { start, finish, isMilestone: false, trade: '(none)' } };
  lane.boxes.push(b);
  return b;
}

/** Dato flyttet et antall dager (YYYY-MM-DD). */
export const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Ny milepæl laget i appen: rødt flagg med dato, på én dag. */
export function newMilestone(plan: PlanFile, laneId: string, date: string): Box | null {
  const lane = plan.lanes.find((l) => l.id === laneId);
  if (!lane) return null;
  const b: Box = {
    id: newId(plan),
    text: 'Ny milepæl',
    taskIds: [],
    rotation: 0,
    milestone: { dateSource: 'scheduled', symbol: 'flag', verticalLine: false, color: 'red', rotateText: false, showDate: true },
    shown: true,
    manual: true,
    resolved: { start: date, finish: date, isMilestone: true, trade: '(none)' },
  };
  lane.boxes.push(b);
  return b;
}

/** Bokser laget i appen slettes. Bokser fra Project skjules, så de kan vises igjen. */
export function removeBox(plan: PlanFile, id: string): void {
  const lane = laneOf(plan, id);
  const b = lane?.boxes.find((x) => x.id === id);
  if (!lane || !b) return;
  if (b.manual) {
    lane.boxes.splice(lane.boxes.indexOf(b), 1);
    // Et bilde brukt som symbol for milepælen hører til den og går samme vei
    const images = plan.plan.layout.images;
    if (images?.some((im) => im.milestone?.id === id)) plan.plan.layout.images = images.filter((im) => im.milestone?.id !== id);
  } else b.hidden = true;
}

// ---- Lanes ----
/** Lysere farger til lanes, i tillegg til fargene planen alt bruker. */
export const LANE_COLORS = ['#FFFFFF', '#DDDDDD', '#8DCDF8', '#BEE5B0', '#FCC781', '#D7B4F3', '#98DEDE', '#F8F1AE', '#D7CAB7', '#EA8183', '#CEE5ED', '#F6CDC7', '#FFC5D3'];
/** Navn på lanefargene, i samme rekkefølge som LANE_COLORS. */
export const LANE_COLOR_NAMES = ['Hvit', 'Grå', 'Blå', 'Grønn', 'Oransje', 'Lilla', 'Turkis', 'Gul', 'Brun', 'Rød', 'Lyseblå', 'Melon', 'Rosa'];
/** Fargerute: farge, navn og eventuelt nummer. */
export type Swatch = [string, string, number?];
/** Lanefargene med navn og nummer 0–12. */
export const LANE_PALETTE: Swatch[] = LANE_COLORS.map((c, i) => [c, LANE_COLOR_NAMES[i], i]);

/** Faste farger for bokser og fag, med navn og nummer 1–22. */
export const BOX_PALETTE: Swatch[] = (<[string, string][]>[
  ['#E6194B', 'Rød'], ['#3CB44B', 'Grønn'], ['#FFE119', 'Gul'], ['#4363D8', 'Blå'], ['#F58231', 'Oransje'],
  ['#911EB4', 'Lilla'], ['#42D4F4', 'Cyan'], ['#F032E6', 'Magenta'], ['#BFEF45', 'Lime'], ['#FABED4', 'Rosa'],
  ['#469990', 'Blågrønn'], ['#DCBEFF', 'Lavendel'], ['#9A6324', 'Brun'], ['#FFFAC8', 'Beige'], ['#800000', 'Rødbrun'],
  ['#AAFFC3', 'Mint'], ['#808000', 'Oliven'], ['#FFD8B1', 'Aprikos'], ['#000075', 'Marine'], ['#A9A9A9', 'Grå'],
  ['#FFFFFF', 'Hvit'], ['#000000', 'Svart'],
]).map(([c, n], i): Swatch => [c, n, i + 1]);

/** Har brukeren endret lanen? */
export function isLaneEdited(l: Lane): boolean {
  return !!(l.original || l.height || l.hidden || l.manual || l.order);
}

/** Tar vare på navn og farge fra Project før første endring. */
export function keepLaneOriginal(l: Lane): void {
  if (!l.original && !l.manual) l.original = { name: l.name, fill: l.fill };
}

/** Setter navn og farge tilbake og fjerner fast høyde og skjuling. */
export function resetLane(l: Lane): void {
  if (l.original) {
    l.name = l.original.name;
    l.fill = l.original.fill;
  }
  delete l.original;
  delete l.height;
  delete l.hidden;
  delete l.order;
}

/** Ny lane laget i appen, rett etter lanen med id `afterId` (eller først). */
export function newLane(plan: PlanFile, afterId: string | null): Lane {
  const used = new Set(plan.lanes.map((l) => l.id));
  let n = 1;
  while (used.has(`app_lane_${n}`)) n++;
  const lane: Lane = { id: `app_lane_${n}`, name: 'Ny lane', fill: null, shown: true, boxes: [], manual: true };
  const i = afterId === null ? -1 : plan.lanes.findIndex((l) => l.id === afterId);
  plan.lanes.splice(i + 1, 0, lane);
  return lane;
}

/** Flytter lanen til plass `to` i rekkefølgen (regnet etter at den er tatt ut). */
export function moveLane(plan: PlanFile, id: string, to: number): void {
  const i = plan.lanes.findIndex((l) => l.id === id);
  if (i < 0) return;
  const [l] = plan.lanes.splice(i, 1);
  plan.lanes.splice(Math.max(0, Math.min(plan.lanes.length, to)), 0, l);
}

/** Lanes laget i appen slettes; bokser som er flyttet dit, flyttes tilbake. Lanes fra Project skjules. */
export function removeLane(plan: PlanFile, id: string): void {
  const lane = plan.lanes.find((l) => l.id === id);
  if (!lane) return;
  if (!lane.manual) {
    lane.hidden = true;
    return;
  }
  for (const b of [...lane.boxes]) if (!b.manual && b.fromLane) moveBox(plan, b.id, b.fromLane);
  plan.lanes.splice(plan.lanes.indexOf(lane), 1);
}

/** Runder av til hundredeler av en tekstlinje, så filen ikke fylles med lange desimaltall. */
export const lines = (mm: number, unit: number) => Math.round((mm / unit) * 100) / 100;

/** Husker tekst og rotasjon før første endring, så de kan tilbakestilles. */
export function keepOriginal(b: Box) {
  if (!b.original) b.original = { text: b.text, rotation: b.rotation };
}

/** Ytterkantene til en boks eller milepæl, med callout og tekst. */
export function bounds(it: Item) {
  if (it.kind === 'box') {
    const cb = it.callout?.box;
    return {
      x0: Math.min(it.x0, cb?.x ?? Infinity),
      x1: Math.max(it.x1, cb ? cb.x + cb.w : -Infinity),
      y0: it.y,
      y1: Math.max(it.y + it.h, cb ? cb.y + cb.h : -Infinity),
    };
  }
  const lb = it.labelBox;
  return {
    x0: Math.min(it.x - it.size, lb.x),
    x1: Math.max(it.x + it.size, lb.x + lb.w),
    y0: Math.min(it.y - it.size, lb.y),
    y1: Math.max(it.y + it.size, lb.y + lb.h),
  };
}

/** Hører boksen til overskriftsboksen? Det som ser ut til å ligge inni, skal være med: minst halvparten
    av selve boksen (uten callout) må ligge innenfor. Høyde og plass rundes av til hundredeler av en
    tekstlinje, så en boks som er snappet til bunnen kan stikke litt ut; et krav om at alt skal ligge
    helt innenfor slapp da boksen ut. Multi Lane-bokser går over flere lanes og er aldri med. */
export function inHeaderBox(header: Item, o: Item): boolean {
  if (o === header || (o.kind === 'box' && o.span)) return false;
  const r = header.kind === 'box' ? { x0: header.x0, x1: header.x1, y0: header.y, y1: header.y + header.h } : bounds(header);
  const q = o.kind === 'box' ? { x0: o.x0, x1: o.x1, y0: o.y, y1: o.y + o.h } : bounds(o);
  const w = Math.min(q.x1, r.x1) - Math.max(q.x0, r.x0);
  const h = Math.min(q.y1, r.y1) - Math.max(q.y0, r.y0);
  if (w <= 0 || h <= 0) return false;
  const area = Math.max(q.x1 - q.x0, 1e-6) * Math.max(q.y1 - q.y0, 1e-6);
  return w * h >= area / 2 - 1e-9;
}
