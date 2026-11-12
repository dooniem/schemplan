// Redigering i tegningen: velg en boks, endre den i panelet, angre og gjør om.
// Endringene skrives rett inn i planen (som valgfrie felt på boksen), så de følger med i arbeidsfilen.
import { autoTextColor } from './layout/color';
import type { Box, Lane, PlanFile, Rotation } from './format/types';
import { MILESTONE_COLORS, type ArrangeOptions, type ArrangeResult, type BoxItem, type Item, type LaneLayout, type Layout } from './layout/layout';
import { CRITICAL_DEFAULT } from './layout/critical';
import { resetTextSizes, type FitTextResult, type FitTextScope } from './layout/fittext';
import { DEFAULT_TITLE_PT, defaultLaneTitleScale, FERIE_KEY, MAX_TEXT_SCALE, MIN_TEXT_SCALE } from './layout/layout';
import { PT_TO_MM } from './layout/text';
import { todayIso } from './layout/lookahead';
import { createCtxMenu, icon, type IconName } from './ctxmenu';
import { addTrade, boxTrade, currentFill, deleteTrade, isAppTrade, NO_TRADE, projectFill, renameTrade, setBoxTrade, setProjectColor, tradeColors, tradeCount, tradeFill, tradeNameProblem } from './trades';

const NS = 'http://www.w3.org/2000/svg';
const MAX_HISTORY = 100;
const ACCENT = '#1F5FBF';

export interface EditorHost {
  getPlan(): PlanFile | null;
  setPlan(p: PlanFile): void;
  redraw(): void;
  /** Finner tettest rekkefølge i lanene (null for en lane der tidligst først er like tett). */
  arrange(p: PlanFile, laneIds: string[], how: ArrangeOptions): ArrangeResult;
  /** Størst mulig tekst i boksene (og lane-titlene) uten at planen endrer seg ellers. */
  fitText(p: PlanFile, scope: FitTextScope): FitTextResult;
  /** Overskriftens størrelse i punkter (et valg i appen, som i Innstillinger). */
  setTitleSize(pt: number): void;
}

export interface Editor {
  /** Kalles etter hver tegning, så valg og markeringer legges på den nye SVG-en. */
  afterDraw(svg: SVGSVGElement, layout: Layout): void;
  /** Ny plan er åpnet: tøm historikk og valg. */
  reset(): void;
  /** Hører hendelsen til redigeringen (så visningen ikke skal panorere eller zoome)? */
  owns(e: Event): boolean;
  readonly active: boolean;
  /** Endringer siden sist lagring. */
  readonly dirty: boolean;
  /** Bytter ut hele planen (f.eks. etter oppdatering fra Project), så det kan angres. */
  replacePlan(p: PlanFile): void;
  markSaved(): void;
  /** Slår på redigering og velger boksen (f.eks. fra datafanen). */
  focusBox(id: string): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};

function findLane(plan: PlanFile, id: string): Lane | null {
  return plan.lanes.find((l) => l.id === id) ?? null;
}

function findBox(plan: PlanFile, id: string): Box | null {
  for (const l of plan.lanes) for (const b of l.boxes) if (b.id === id) return b;
  return null;
}

/** Har brukeren overstyrt noe på boksen? */
/** Boksen har fast plass i lanen, i «Fyll hele arket» eller i Kompakt. */
export const pinned = (b: Box): boolean => b.top !== undefined || b.compactTop !== undefined;
/** Løsner boksen i begge visningene. */
export function unpinBox(b: Box): void {
  delete b.top;
  delete b.compactTop;
}

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

const newId = (plan: PlanFile) => {
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

/** Bokser laget i appen slettes. Bokser fra Project skjules, så de kan vises igjen. */
export function removeBox(plan: PlanFile, id: string): void {
  const lane = laneOf(plan, id);
  const b = lane?.boxes.find((x) => x.id === id);
  if (!lane || !b) return;
  if (b.manual) lane.boxes.splice(lane.boxes.indexOf(b), 1);
  else b.hidden = true;
}

// ---- Lanes ----
/** Lysere farger til lanes, i tillegg til fargene planen alt bruker. */
export const LANE_COLORS = ['#FFFFFF', '#DDDDDD', '#8DCDF8', '#BEE5B0', '#FCC781', '#D7B4F3', '#98DEDE', '#F8F1AE', '#D7CAB7', '#EA8183', '#CEE5ED', '#F6CDC7', '#FFC5D3'];
/** Navn på lanefargene, i samme rekkefølge som LANE_COLORS. */
const LANE_COLOR_NAMES = ['Hvit', 'Grå', 'Blå', 'Grønn', 'Oransje', 'Lilla', 'Turkis', 'Gul', 'Brun', 'Rød', 'Lyseblå', 'Melon', 'Rosa'];
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
const lines = (mm: number, unit: number) => Math.round((mm / unit) * 100) / 100;

/** Husker tekst og rotasjon før første endring, så de kan tilbakestilles. */
function keepOriginal(b: Box) {
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

export function createEditor(host: EditorHost, sheet: HTMLElement, panel: HTMLElement, toggle: HTMLButtonElement, tools: HTMLElement): Editor {
  let active = false;
  let selected: string | null = null;
  /** Valgt lane (klikk i lane-kolonnen). Bare én av boks og lane er valgt om gangen. */
  let selectedLane: string | null = null;
  /** Toppfeltet med overskrift og tekst til høyre er valgt. */
  let selectedHeader = false;
  /** Flere valgte bokser (Shift-klikk eller rektangel). Når den har to eller flere, er `selected` null. */
  let group: string[] = [];
  /** Valgt fag (klikk i legenden). */
  let selectedTrade: string | null = null;
  /** Nytt fag: navnefeltet i panelet får fokus én gang. */
  let focusTradeName = false;
  let past: PlanFile[] = [];
  let future: PlanFile[] = [];
  let dirty = false;
  /** Skriving i tekstfeltet samles til ett angre-steg per økt i feltet. */
  let typingSession = false;
  let svgNow: SVGSVGElement | null = null;
  let layoutNow: Layout | null = null;
  let redrawTimer = 0;
  /** Bokser som ble flyttet av siste omplassering, markert til den godtas eller angres. */
  let arrangeMoved = new Set<string>();
  const arrangeBar = document.querySelector<HTMLElement>('#arrange-bar');

  const undoBtn = tools.querySelector<HTMLButtonElement>('#undo')!;
  const redoBtn = tools.querySelector<HTMLButtonElement>('#redo')!;
  const resetAllBtn = tools.querySelector<HTMLButtonElement>('#reset-all')!;
  const marksBtn = tools.querySelector<HTMLButtonElement>('#show-marks');
  /** Blå prikk på bokser brukeren har endret. Kan skjules for å se planen slik den blir. */
  let showMarks = true;
  const criticalBtn = tools.querySelector<HTMLButtonElement>('#critical-mode');
  /** Kritisk linje: klikk på en boks tar den med i linjen eller ut av den. */
  let criticalMode = false;

  const syncTools = () => {
    toggle.setAttribute('aria-pressed', String(active));
    const label = toggle.querySelector('#edit-label');
    if (label) label.textContent = active ? 'Ferdig' : 'Rediger';
    toggle.title = active ? 'Avslutt redigering' : 'Velg bokser og endre tekst, farge, callout og rotasjon';
    tools.hidden = !active;
    undoBtn.disabled = !past.length;
    redoBtn.disabled = !future.length;
    const plan = host.getPlan();
    resetAllBtn.disabled = !plan || (!plan.plan.layout.tradeColors && !plan.plan.layout.laneTitleScale && !plan.plan.layout.legendItems && !plan.plan.layout.headerRightScale && !plan.plan.layout.legendScale && !plan.plan.layout.logoScale && !plan.lanes.some((l) => (isLaneEdited(l) && !l.manual) || l.boxes.some(isEdited)));
    sheet.classList.toggle('editing', active);
    criticalBtn?.setAttribute('aria-pressed', String(criticalMode));
    sheet.classList.toggle('critical-mode', active && criticalMode);
  };

  /** Tar vare på planen før en endring, så den kan angres. */
  const snapshot = () => {
    const plan = host.getPlan();
    if (!plan) return;
    // En ny endring godtar omplasseringen
    endArrange();
    past.push(structuredClone(plan));
    if (past.length > MAX_HISTORY) past.shift();
    future = [];
    dirty = true;
    // Datoen nederst på planen blir dagen den sist ble endret
    plan.plan.layout.editedAt = todayIso();
  };

  const change = (fn: (b: Box) => void, opts: { typing?: boolean; rebuild?: boolean } = {}) => {
    const plan = host.getPlan();
    const b = plan && selected ? findBox(plan, selected) : null;
    if (!b) return;
    if (!opts.typing || !typingSession) snapshot();
    if (opts.typing) typingSession = true;
    fn(b);
    // Under skriving tegnes planen litt etterpå, så store planer ikke henger etter tastetrykkene
    window.clearTimeout(redrawTimer);
    if (opts.typing) redrawTimer = window.setTimeout(() => host.redraw(), 120);
    else host.redraw();
    if (opts.rebuild !== false) buildPanel();
    syncTools();
  };

  const changeLane = (fn: (l: Lane) => void, opts: { typing?: boolean; rebuild?: boolean } = {}) => {
    const plan = host.getPlan();
    const l = plan && selectedLane ? findLane(plan, selectedLane) : null;
    if (!l) return;
    if (!opts.typing || !typingSession) snapshot();
    if (opts.typing) typingSession = true;
    fn(l);
    window.clearTimeout(redrawTimer);
    if (opts.typing) redrawTimer = window.setTimeout(() => host.redraw(), 120);
    else host.redraw();
    if (opts.rebuild !== false) buildPanel();
    syncTools();
  };

  /** Endring som ikke gjelder bare valgt boks (dra, lanehøyde). */
  const commit = (fn: (plan: PlanFile) => void) => {
    const plan = host.getPlan();
    if (!plan) return;
    snapshot();
    typingSession = false;
    fn(plan);
    host.redraw();
    buildPanel();
    syncTools();
  };

  /** Gjør boksen til overskriftsboks: fast plass, og litt høyere så det er plass til bokser inne i den. */
  const setHeader = (id: string, on: boolean) => {
    const L = layoutNow;
    const it = L?.items.find((i) => i.id === id);
    const ln = it && laneAt(it.y);
    commit((pl) => {
      const b = findBox(pl, id);
      if (!b) return;
      if (!on) {
        delete b.header;
        return;
      }
      b.header = true;
      delete b.spanTo;
      if (L && it?.kind === 'box' && ln) {
        if (b.top === undefined) b.top = lines(it.y - ln.top, L.unit);
        b.height = Math.max(b.height ?? 0, lines(it.h, L.unit) + 2);
      }
    });
  };

  /** Synlige lanes fra boksens egen og nedover. */
  const lanesFrom = (pl: PlanFile, id: string) => {
    const vis = pl.lanes.filter((l) => l.shown && !l.hidden);
    const at = vis.findIndex((l) => l.boxes.some((x) => x.id === id));
    return at < 0 ? [] : vis.slice(at);
  };
  /** Gjør boksen til Multi Lane-boks: den går ned til bunnen av lanen under (eller sin egen, når den er nederst). */
  const setSpan = (id: string, on: boolean | string, end?: number) => {
    commit((pl) => {
      const b = findBox(pl, id);
      if (!b) return;
      if (end === undefined) delete b.spanEnd;
      else b.spanEnd = end;
      delete b.compactSpanEnd;
      if (on === false) {
        delete b.spanTo;
        return;
      }
      const below = lanesFrom(pl, id);
      b.spanTo = typeof on === 'string' ? on : (below[1] ?? below[0])?.id;
      if (b.spanTo === undefined) delete b.spanTo;
      delete b.header;
      delete b.height;
    });
  };

  const addLane = (afterId: string | null) => {
    let made: Lane | null = null;
    commit((pl) => (made = newLane(pl, afterId)));
    if (made) {
      selectLane((made as Lane).id);
      const inp = panel.querySelector<HTMLTextAreaElement>('#lane-name');
      inp?.focus();
      inp?.select();
    }
  };
  /** Ny lane rett over lanen: etter lanen foran den i rekkefølgen, eller først. */
  const addLaneAbove = (id: string) => {
    const lanes = host.getPlan()?.lanes ?? [];
    const i = lanes.findIndex((l) => l.id === id);
    addLane(i > 0 ? lanes[i - 1].id : null);
  };
  const removeLaneById = (id: string) => {
    const plan = host.getPlan();
    // Siste synlige lane kan ikke skjules
    if (!plan || plan.lanes.filter((l) => l.shown && !l.hidden).length <= 1) return;
    if (selectedLane === id) selectedLane = null;
    commit((pl) => removeLane(pl, id));
    overlay();
  };
  /** Flytter lanen ett hakk opp eller ned blant lanene som vises. */
  const stepLane = (id: string, dir: -1 | 1) =>
    commit((pl) => {
      const vis = pl.lanes.filter((l) => l.shown && !l.hidden);
      const i = vis.findIndex((l) => l.id === id);
      const other = vis[i + dir];
      if (i < 0 || !other) return;
      const j = pl.lanes.indexOf(other);
      moveLane(pl, id, j);
    });

  /** Bokser kopiert med Ctrl+C. Ligger bare i minnet så lenge siden er åpen. */
  let clipboard: { box: Box; lane: string }[] = [];
  const copyToClipboard = () => {
    const plan = host.getPlan();
    if (!plan) return false;
    const ids = group.length ? group : selected ? [selected] : [];
    clipboard = ids.flatMap((id) => {
      const b = findBox(plan, id);
      const l = laneOf(plan, id);
      return b && l ? [{ box: structuredClone(b), lane: l.id }] : [];
    });
    return clipboard.length > 0;
  };
  const pasteFromClipboard = () => {
    const plan = host.getPlan();
    if (!plan || !clipboard.length) return;
    // Valgt lane, eller lanen til valgt boks. Ellers lanen boksene ble kopiert fra.
    const target = selectedLane ?? (selected ? laneOf(plan, selected)?.id ?? null : null);
    let made: Box[] = [];
    commit((pl) => (made = pasteBoxes(pl, clipboard, target)));
    if (made.length === 1) select(made[0].id);
    else if (made.length > 1) {
      selected = null;
      selectedLane = null;
      group = made.map((b) => b.id);
      buildPanel();
      overlay();
    }
  };
  const copySelected = () => {
    if (!selected) return;
    let made: Box | null = null;
    const id = selected;
    commit((pl) => (made = copyBox(pl, id)));
    if (made) select((made as Box).id);
  };
  const removeGroup = () => {
    const ids = group;
    group = [];
    commit((pl) => ids.forEach((id) => removeBox(pl, id)));
    overlay();
  };
  const removeSelected = () => {
    if (!selected) return;
    const id = selected;
    selected = null;
    commit((pl) => removeBox(pl, id));
    overlay();
  };

  const restore = (from: PlanFile[], to: PlanFile[]) => {
    const plan = host.getPlan();
    const prev = from.pop();
    if (!plan || !prev) return;
    endArrange();
    to.push(structuredClone(plan));
    host.setPlan(prev);
    dirty = true;
    typingSession = false;
    if (selected && !findBox(prev, selected)) selected = null;
    if (selectedLane && !findLane(prev, selectedLane)) selectedLane = null;
    group = group.filter((id) => findBox(prev, id));
    host.redraw();
    buildPanel();
    syncTools();
  };
  const undo = () => restore(past, future);
  const redo = () => restore(future, past);

  // ---- Panelet ----
  /** Tittel, en linje under (datoer, fag) og lukkeknapp. */
  const panelHead = (title: string, sub?: string, onClose: () => void = () => select(null), closeLabel = 'Lukk') => {
    const h = el('div', { class: 'panel-head' });
    const t = el('div', { class: 'panel-title' });
    t.append(el('h2', {}, title));
    if (sub) t.append(el('p', { class: 'panel-sub' }, sub));
    const close = el('button', { type: 'button', class: 'icon', title: `${closeLabel} (Esc)`, 'aria-label': closeLabel });
    close.append(icon('close', 'pico'));
    close.addEventListener('click', onClose);
    h.append(t, close);
    panel.append(h);
  };
  /** Del av panelet med egen overskrift. */
  const section = (title: string) => {
    const s = el('section', { class: 'psec', 'aria-label': title });
    s.append(el('h3', {}, title));
    panel.append(s);
    return s;
  };
  /** Valg på én linje: navnet til venstre, knappene til høyre. */
  const segmented = <T extends string | number>(label: string, value: T, options: ([T, string] | [T, string, IconName])[], onPick: (v: T) => void) => {
    const wrap = el('div', { class: 'prop prop-inline' });
    wrap.append(el('span', { class: 'prop-label' }, label));
    const g = el('div', { class: 'group', role: 'group', 'aria-label': label });
    for (const [v, text, ico] of options) {
      const b = el('button', { type: 'button', 'aria-pressed': String(v === value) });
      if (ico) b.append(icon(ico, 'pico'));
      b.append(text);
      b.addEventListener('click', () => onPick(v));
      g.append(b);
    }
    wrap.append(g);
    return wrap;
  };
  /** Av/på-bryter med navnet til venstre. */
  const switchRow = (label: string, on: boolean, onChange: (v: boolean) => void, title?: string) => {
    const w = el('label', { class: 'pswitch' });
    if (title) w.title = title;
    const inp = el('input', { type: 'checkbox', role: 'switch' }) as HTMLInputElement;
    inp.checked = on;
    inp.addEventListener('change', () => onChange(inp.checked));
    w.append(el('span', {}, label), inp);
    return w;
  };
  /** Knapp med ikon foran teksten. */
  const btn = (text: string, ico: IconName | null, onClick: () => void, title?: string, cls = 'button') => {
    const b = el('button', { type: 'button', class: cls });
    if (title) b.title = title;
    if (ico) b.append(icon(ico, 'pico'));
    b.append(text);
    b.addEventListener('click', onClick);
    return b;
  };
  /** Fargeruter. Like farger vises bare én gang. */
  const swatches = (current: string | null, list: Swatch[], onPick: (fill: string) => void) => {
    const sw = el('div', { class: 'swatches' });
    const seen = new Set<string>();
    for (const [fill, name, num] of list) {
      const key = fill.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const label = num === undefined ? name : `${num} ${name}`;
      const s = el('button', { type: 'button', class: 'swatch', title: label, 'aria-label': label, 'aria-pressed': String(current === key) });
      s.style.background = fill;
      if (num !== undefined) {
        // Samme nummer som fargen har i fargevalget i Project
        s.textContent = String(num);
        s.style.color = autoTextColor(key);
      }
      s.addEventListener('click', () => onPick(key));
      sw.append(s);
    }
    return sw;
  };
  /** Egen farge, og eventuelt en knapp tilbake til fargen den ellers ville hatt. */
  type Back = { text: string; disabled: boolean; onClick: () => void; title?: string };
  const colorRow = (value: string, onPick: (fill: string) => void, back?: Back | Back[]) => {
    const row = el('div', { class: 'row color-row' });
    const lab = el('label', { class: 'custom-color' });
    const inp = el('input', { type: 'color' }) as HTMLInputElement;
    inp.value = value.toLowerCase();
    inp.addEventListener('change', () => onPick(inp.value.toUpperCase()));
    lab.append(inp, 'Egen farge');
    row.append(lab);
    for (const x of back ? [back].flat() : []) {
      const b = btn(x.text, null, x.onClick, x.title, 'button small');
      b.disabled = x.disabled;
      row.append(b);
    }
    return row;
  };
  /** Linje som sier at noe er låst, med knapp for å løse det opp. Vises bare når det gjelder. */
  const lockedRow = (text: string, button: string, title: string, onClick: () => void) => {
    const r = el('div', { class: 'row locked-row' });
    r.append(el('span', {}, text), btn(button, null, onClick, title, 'button small'));
    return r;
  };
  /**
   * Tekststørrelse for boksen, i halve punkter. Lagres i forhold til planens tekst, så boksen
   * følger med når planen krymper eller vokser. Aldri under halvparten eller over det dobbelte.
   */
  const textSizeRow = (b: Box, planPt: number) =>
    sizeStepper(b.textScale, planPt, (s) =>
      change((x) => {
        if (s === undefined) delete x.textScale;
        else x.textScale = s;
      }),
    );
  /** − / + i halve punkter. set får forholdet til planens tekst, eller undefined for standardstørrelsen. */
  /** def: standardstørrelsen i forhold til planens tekst. Velges den, lagres ingen egen størrelse. */
  const sizeStepper = (
    scaleNow: number | undefined,
    planPt: number,
    set: (s: number | undefined) => void,
    o: { note?: string; def?: number; resetLabel?: string; resetTitle?: string; std?: string; unit?: string; step?: number; what?: string } = {},
  ) => {
    const { note = 'Egen størrelse', def = 1, resetLabel = 'Som planen', resetTitle = 'Samme tekststørrelse som resten av planen', unit = 'pt', step = 0.5, what = 'tekst' } = o;
    const cur = planPt * (scaleNow ?? def);
    const lo = planPt * MIN_TEXT_SCALE;
    const hi = planPt * MAX_TEXT_SCALE;
    const fmt = (v: number) => v.toLocaleString('nb-NO', { maximumFractionDigits: 2 });
    const setPt = (pt: number) => {
      const s = Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, pt / planPt));
      set(Math.abs(s - def) < 1e-3 ? undefined : Math.round(s * 10000) / 10000);
    };
    const wrap = el('div', { class: 'prop prop-inline' });
    wrap.append(el('span', { class: 'prop-label' }, 'Størrelse'));
    const g = el('div', { class: 'group stepper', role: 'group', 'aria-label': what === 'tekst' ? 'Tekststørrelse' : 'Størrelse' });
    const down = el('button', { type: 'button', 'aria-label': `Mindre ${what}`, title: `Mindre ${what}` }, '−') as HTMLButtonElement;
    const up = el('button', { type: 'button', 'aria-label': `Større ${what}`, title: `Større ${what}` }, '+') as HTMLButtonElement;
    const val = el('output', { class: 'step-val', 'aria-live': 'polite' }, `${fmt(cur)} ${unit}`);
    // Neste hele steg opp eller ned (halve punkter for tekst), så størrelsene blir runde tall
    down.disabled = cur <= lo + 1e-3;
    up.disabled = cur >= hi - 1e-3;
    // Planens størrelse er også et stopp, så teksten kan gjøres like stor som i resten av planen
    const downTo = Math.max(lo, Math.ceil(cur / step - 1e-3) * step - step);
    const upTo = Math.min(hi, Math.floor(cur / step + 1e-3) * step + step);
    down.addEventListener('click', () => setPt(planPt < cur - 1e-3 && planPt > downTo + 1e-3 ? planPt : downTo));
    up.addEventListener('click', () => setPt(planPt > cur + 1e-3 && planPt < upTo - 1e-3 ? planPt : upTo));
    g.append(down, val, up);
    wrap.append(g);
    const out: HTMLElement[] = [wrap];
    if (scaleNow) {
      const std = o.std ?? (def === 1 ? `planen har ${fmt(planPt)} pt` : `standard er ${fmt(planPt * def)} pt`);
      out.push(lockedRow(`${note}, ${std}`, resetLabel, resetTitle, () => set(undefined)));
    }
    return out;
  };
  /**
   * Største bredde på callouten, − / + i halve cm. Planens bredde er standard og et stopp på veien.
   * Har de valgte boksene ulik bredde, står det «Ulike», og stegene går fra planens bredde.
   */
  const calloutWidthRows = (sel: Box[], planCm: number, set: (cm: number | undefined) => void): HTMLElement[] => {
    const LO = 1;
    const HI = 15;
    const STEP = 0.5;
    const fmt = (v: number) => `${v.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} cm`;
    const own = sel.map((x) => x.calloutWidthCm);
    const mixed = own.some((v) => v !== own[0]);
    const cur = mixed ? planCm : (own[0] ?? planCm);
    const setCm = (cm: number) => {
      const v = Math.min(HI, Math.max(LO, Math.round(cm / STEP) * STEP));
      set(Math.abs(v - planCm) < 1e-3 ? undefined : v);
    };
    const wrap = el('div', { class: 'prop prop-inline' });
    wrap.title = 'Hvor bred callouten kan bli på arket før teksten brytes';
    wrap.append(el('span', { class: 'prop-label' }, 'Bredde'));
    const g = el('div', { class: 'group stepper', role: 'group', 'aria-label': 'Bredde på callout' });
    const down = el('button', { type: 'button', 'aria-label': 'Smalere callout', title: 'Smalere callout' }, '−') as HTMLButtonElement;
    const up = el('button', { type: 'button', 'aria-label': 'Bredere callout', title: 'Bredere callout' }, '+') as HTMLButtonElement;
    const val = el('output', { class: 'step-val', 'aria-live': 'polite' }, mixed ? 'Ulike' : fmt(cur));
    const downTo = Math.max(LO, Math.ceil(cur / STEP - 1e-3) * STEP - STEP);
    const upTo = Math.min(HI, Math.floor(cur / STEP + 1e-3) * STEP + STEP);
    down.disabled = !mixed && cur <= LO + 1e-3;
    up.disabled = !mixed && cur >= HI - 1e-3;
    // Planens bredde er et stopp, så boksen kan settes tilbake til den med knappene
    down.addEventListener('click', () => setCm(mixed ? planCm - STEP : planCm < cur - 1e-3 && planCm > downTo + 1e-3 ? planCm : downTo));
    up.addEventListener('click', () => setCm(mixed ? planCm + STEP : planCm > cur + 1e-3 && planCm < upTo - 1e-3 ? planCm : upTo));
    g.append(down, val, up);
    wrap.append(g);
    const out: HTMLElement[] = [wrap];
    if (own.some((v) => v !== undefined))
      out.push(lockedRow(`${sel.length > 1 ? 'Noen har egen' : 'Egen'} bredde, planen har ${fmt(planCm)}`, 'Som planen', 'Samme callout-bredde som resten av planen', () => set(undefined)));
    return out;
  };
  /** Tekstfelt der | gir linjeskift. Ett angre-steg per skriveøkt. */
  const textField = (id: string, label: string, value: string, rows: string, onInput: (v: string) => void) => {
    const ta = el('textarea', { id, rows, spellcheck: 'true', 'aria-label': label }) as HTMLTextAreaElement;
    ta.value = value;
    ta.addEventListener('focus', () => (typingSession = false));
    ta.addEventListener('input', () => onInput(ta.value));
    ta.addEventListener('blur', () => {
      typingSession = false;
      syncTools();
    });
    return ta;
  };
  const textColorKey = (c?: string) => (c === '#000000' ? 'black' : c === '#FFFFFF' ? 'white' : 'auto');
  const TEXT_COLORS: ['auto' | 'black' | 'white', string][] = [['auto', 'Auto'], ['black', 'Svart'], ['white', 'Hvit']];
  const fmtDate = (d: string) => d.split('-').reverse().join('.');
  const tradeName = (t: string) => (t === '(none)' ? 'Uten fag' : t);
  /**
   * Fargeruter for bokser: de faste boksfargene, så fagfargene i planen som ikke er blant dem.
   * De faste fargene står der selv om planen ikke bruker dem.
   */
  const planSwatches = (plan: PlanFile): Swatch[] => [
    ...BOX_PALETTE,
    ...tradeColors(plan).filter((c) => c.fill).map((c): [string, string] => [c.fill!, tradeName(c.name)]),
  ];
  const NEW_TRADE = '\u0000nytt';
  /**
   * Nedtrekksliste med alle fag, «Uten fag» og «Nytt fag …» nederst.
   * current null: boksene har ulike fag.
   */
  const tradeSelect = (plan: PlanFile, current: string | null, onPick: (name: string) => void, onNew: () => void) => {
    // Seksjonen heter «Fag», så listen står alene uten eget navn foran
    const wrap = el('div', { class: 'prop' });
    const sel = el('select', { id: 'box-trade', 'aria-label': 'Fag' }) as HTMLSelectElement;
    const opt = (value: string, text: string) => {
      const o = el('option', { value }, text) as HTMLOptionElement;
      sel.append(o);
      return o;
    };
    if (current === null) opt('', 'Ulike fag').disabled = true;
    // Fagene fra Project og fagene laget i appen i hver sin gruppe, så det er tydelig hvilke som følger Project
    const groupOf = (label: string, names: string[]) => {
      if (!names.length) return;
      const og = el('optgroup', { label }) as HTMLOptGroupElement;
      for (const n of names) og.append(el('option', { value: n }, n));
      sel.append(og);
    };
    const list = tradeColors(plan).map((c) => c.name).filter((n) => n !== NO_TRADE);
    groupOf('Fra Project', list.filter((n) => !isAppTrade(plan, n)));
    groupOf('Laget i appen', list.filter((n) => isAppTrade(plan, n)));
    opt(NO_TRADE, 'Uten fag');
    opt(NEW_TRADE, 'Nytt fag …');
    sel.value = current ?? '';
    sel.addEventListener('change', () => {
      if (sel.value === NEW_TRADE) onNew();
      else onPick(sel.value);
    });
    wrap.append(sel);
    return wrap;
  };
  /** Nytt fag til boksene (kan være ingen). Panelet viser faget, med navnefeltet klart til skriving. */
  const createTrade = (ids: string[]) => {
    let name = '';
    commit((pl) => (name = addTrade(pl, ids)));
    if (!name) return;
    focusTradeName = true;
    selectTrade(name);
  };

  /** Overskrift og tekst øverst til høyre. Lagres i planen og beholdes ved oppdatering fra Project. */
  const changeHeader = (fn: (lay: PlanFile['plan']['layout']) => void, typing: boolean) => {
    const plan = host.getPlan();
    if (!plan) return;
    if (!typing || !typingSession) snapshot();
    if (typing) typingSession = true;
    fn(plan.plan.layout);
    window.clearTimeout(redrawTimer);
    if (typing) redrawTimer = window.setTimeout(() => host.redraw(), 120);
    else {
      host.redraw();
      buildPanel();
    }
    syncTools();
  };

  const buildHeaderPanel = (plan: PlanFile) => {
    panelHead('Topptekst', 'Beholdes når du oppdaterer fra Project');
    const lay = plan.plan.layout;
    const s1 = section('Overskrift');
    s1.append(textField('header-title', 'Overskrift', lay.title ?? plan.plan.title, '2', (v) => changeHeader((l) => (l.title = v), true)));
    s1.append(el('p', { class: 'hint' }, 'Midt øverst på arket.'));
    if (layoutNow) {
      // Overskriften har fast størrelse i punkter, som i Innstillinger
      const titlePt = layoutNow.title.size / PT_TO_MM;
      s1.append(
        ...sizeStepper(Math.abs(titlePt - DEFAULT_TITLE_PT) < 1e-3 ? undefined : titlePt / DEFAULT_TITLE_PT, DEFAULT_TITLE_PT, (s) => {
          host.setTitleSize(s === undefined ? DEFAULT_TITLE_PT : Math.round(DEFAULT_TITLE_PT * s * 2) / 2);
          buildPanel();
        }, { std: `standard er ${DEFAULT_TITLE_PT} pt`, resetLabel: 'Standard', resetTitle: `Standardstørrelsen, ${DEFAULT_TITLE_PT} pt` }),
      );
    }
    if (lay.title !== undefined && lay.title !== plan.plan.title)
      s1.append(btn('Bruk navnet fra Project', null, () => changeHeader((l) => delete l.title, false), undefined, 'linkish'));
    const s2 = section('Tekst til høyre');
    s2.append(
      textField('header-right', 'Tekst til høyre', lay.headerRight ?? '', '3', (v) =>
        changeHeader((l) => {
          if (v.trim()) l.headerRight = v;
          else delete l.headerRight;
        }, true),
      ),
    );
    s2.append(el('p', { class: 'hint' }, 'Høyrejustert øverst til høyre, for eksempel prosjektnummer eller revisjon. Skriv | for linjeskift.'));
    if (layoutNow && lay.headerRight?.trim()) {
      s2.append(
        ...sizeStepper(lay.headerRightScale, layoutNow.headerRightBasePt, (s) =>
          changeHeader((l) => {
            if (s === undefined) delete l.headerRightScale;
            else l.headerRightScale = s;
          }, false), { std: `standard er ${layoutNow.headerRightBasePt.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} pt, 0,6 × overskriften`, resetLabel: 'Standard', resetTitle: 'Standardstørrelsen, i forhold til overskriften' }),
      );
    }
      if (lay.logo) {
      // Logoen har egen størrelse, uavhengig av overskriften
      const s3 = section('Logo');
      s3.append(
        ...sizeStepper(lay.logoScale, 100, (v) =>
          changeHeader((l) => {
            if (v === undefined) delete l.logoScale;
            else l.logoScale = v;
          }, false), { unit: '%', step: 10, what: 'logo', note: 'Egen størrelse', std: 'standard er 100 %', resetLabel: 'Standard', resetTitle: 'Standardstørrelsen på logoen' }),
        el('p', { class: 'hint' }, 'Øverst til venstre. Bytt eller fjern logoen i Innstillinger.'),
      );
    }
};

  const buildLanePanel = (plan: PlanFile, l: Lane) => {
    panelHead('Lane', l.manual ? 'Laget i appen, følger ikke Project' : undefined);

    const sn = section('Navn');
    sn.append(
      textField('lane-name', 'Navn', l.name, '2', (v) =>
        changeLane((x) => {
          keepLaneOriginal(x);
          x.name = v;
        }, { typing: true, rebuild: false }),
      ),
      el('p', { class: 'hint' }, 'Skriv | for linjeskift.'),
    );
    // Lane-titlene har én felles størrelse, så korte navn ikke blir større enn lange
    if (layoutNow) {
      sn.append(
        ...sizeStepper(plan.plan.layout.laneTitleScale, layoutNow.textSizePt, (s) =>
          commit((pl) => {
            if (s === undefined) delete pl.plan.layout.laneTitleScale;
            else pl.plan.layout.laneTitleScale = s;
          }), {
          note: 'Egen størrelse for alle lanes',
          def: defaultLaneTitleScale(layoutNow.textSizePt),
          resetLabel: 'Standard',
          resetTitle: 'Litt større enn teksten i boksene',
        }),
        el('p', { class: 'hint' }, 'Størrelsen gjelder navnene på alle lanes, så de er like store. Som standard er de litt større enn teksten i boksene.'),
      );
    }

    const sc = section('Farge');
    const now = (l.fill ?? '#FFFFFF').toUpperCase();
    const setFill = (f: string) =>
      changeLane((x) => {
        keepLaneOriginal(x);
        x.fill = f;
      });
    sc.append(
      swatches(now, [
        ...LANE_PALETTE,
        ...plan.lanes.filter((x) => x.fill).map((x): [string, string] => [x.fill!, 'Brukt i planen']),
      ], setFill),
    );
    sc.append(
      colorRow(now, setFill, l.original
        ? {
            text: 'Fargen fra Project',
            disabled: (l.original.fill ?? '').toUpperCase() === (l.fill ?? '').toUpperCase(),
            onClick: () => changeLane((x) => (x.fill = x.original ? x.original.fill : x.fill)),
          }
        : undefined),
    );

    const sp = section('Plass');
    if (layoutNow?.compact) sp.append(el('p', { class: 'hint' }, 'Kompakt: lanen er så lav som innholdet. Fast høyde gjelder i «Fyll hele arket».'));
    else sp.append(
      segmented('Høyde', l.height ? 'fixed' : 'auto', [['auto', 'Automatisk'], ['fixed', 'Fast']], (v) => {
        const ln = layoutNow?.lanes.find((x) => x.id === l.id);
        const unit = layoutNow?.unit;
        changeLane((x) => {
          if (v === 'auto') delete x.height;
          else if (ln && unit) x.height = lines(ln.y1 - ln.y0, unit);
        });
      }),
    );
    const vis = plan.lanes.filter((x) => x.shown && !x.hidden);
    const pos = vis.findIndex((x) => x.id === l.id);
    const ow = el('div', { class: 'prop prop-inline' });
    ow.append(el('span', { class: 'prop-label' }, 'Rekkefølge'));
    const og = el('div', { class: 'group', role: 'group', 'aria-label': 'Rekkefølge' });
    const up = btn('Opp', 'up', () => stepLane(l.id, -1), 'Flytt lanen ett hakk opp', '');
    up.disabled = pos <= 0;
    const down = btn('Ned', 'down', () => stepLane(l.id, 1), 'Flytt lanen ett hakk ned', '');
    down.disabled = pos < 0 || pos >= vis.length - 1;
    og.append(up, down);
    ow.append(og);
    sp.append(ow, el('p', { class: 'hint' }, layoutNow?.compact ? 'Du kan også dra lane-navnet opp eller ned.' : 'Du kan også dra lane-navnet opp eller ned, eller dra i nederste kant av lanen for å endre høyden.'));

    const foot = el('div', { class: 'panel-foot' });
    const del = btn(l.manual ? 'Slett' : 'Skjul', l.manual ? 'trash' : 'hide', () => removeLaneById(l.id),
      l.manual ? 'Slett lanen. Egne bokser i den slettes, bokser fra Project flyttes tilbake. (Delete)' : 'Skjul lanen. Høyreklikk et lane-navn for å vise den igjen. (Delete)');
    del.disabled = vis.length <= 1 && pos >= 0;
    const reset = btn('Tilbakestill', 'undo', () => changeLane((x) => resetLane(x)), 'Navn og farge fra Project, og automatisk høyde', 'button push');
    reset.disabled = l.manual || !isLaneEdited(l);
    foot.append(btn('Ny lane', 'laneAdd', () => addLane(l.id), 'Ny lane rett under denne'), del, reset);
    panel.append(foot);
  };

  const setCritical = (ids: string[], on: boolean) =>
    commit((pl) => ids.forEach((id) => {
      const x = findBox(pl, id);
      if (!x) return;
      if (on) x.critical = true;
      else delete x.critical;
    }));

  const CRITICAL_COLORS: [string, string][] = [['#E00000', 'Rød'], ['#FF6600', 'Oransje'], ['#C000C0', 'Lilla'], ['#0050D0', 'Blå'], ['#000000', 'Svart']];
  const buildCriticalPanel = (plan: PlanFile) => {
    const marked = plan.lanes.flatMap((l) => l.boxes.filter((x) => x.critical));
    panelHead('Kritisk linje', marked.length ? `${marked.length} ${marked.length === 1 ? 'boks' : 'bokser'} i linjen` : 'Ingen bokser ennå', () => setCriticalMode(false), 'Ferdig');
    panel.append(el('p', { class: 'panel-note' }, marked.length
      ? 'Klikk en boks for å ta den med eller ut. Linjen følger datoene, så rekkefølgen du klikker i spiller ingen rolle.'
      : 'Klikk boksene som ligger på den kritiske linjen. Linjen tegnes gjennom dem i datorekkefølge og går utenom teksten.'));
    const style = plan.plan.layout.criticalLine ?? CRITICAL_DEFAULT;
    const setStyle = (v: Partial<typeof style>) => commit((pl) => (pl.plan.layout.criticalLine = { ...(pl.plan.layout.criticalLine ?? CRITICAL_DEFAULT), ...v }));

    const s = section('Utseende');
    const ww = el('div', { class: 'prop prop-inline' });
    const wl = el('label', { class: 'prop-label', for: 'critical-width' }, 'Tykkelse');
    const wv = el('span', { class: 'range-value' }, `${style.width.toFixed(1).replace('.', ',')} mm`);
    const wr = el('div', { class: 'row' });
    const range = el('input', { type: 'range', id: 'critical-width', min: '0.2', max: '3', step: '0.1', value: String(style.width) }) as HTMLInputElement;
    // Ett angre-steg per dra i glideren; linjen tegnes på nytt mens du drar
    let sliding = false;
    range.addEventListener('input', () => {
      const pl = host.getPlan();
      if (!pl) return;
      if (!sliding) snapshot();
      sliding = true;
      pl.plan.layout.criticalLine = { ...(pl.plan.layout.criticalLine ?? CRITICAL_DEFAULT), width: Number(range.value) };
      wv.textContent = `${Number(range.value).toFixed(1).replace('.', ',')} mm`;
      host.redraw();
    });
    range.addEventListener('change', () => {
      sliding = false;
      syncTools();
    });
    wr.append(range, wv);
    ww.append(wl, wr);
    s.append(ww);
    const cw = el('div', { class: 'prop prop-inline' });
    cw.append(el('span', { class: 'prop-label' }, 'Farge'), swatches(style.color.toUpperCase(), CRITICAL_COLORS, (c) => setStyle({ color: c })));
    s.append(cw);
    s.append(segmented('Strek', style.dash ?? 'solid', [['solid', 'Hel'], ['dashed', 'Stiplet'], ['dotted', 'Prikket']], (v) => setStyle({ dash: v })));

    const foot = el('div', { class: 'panel-foot' });
    const clear = btn('Fjern linjen', 'trash', () => setCritical(marked.map((x) => x.id), false), 'Tar alle boksene ut av linjen', 'button push');
    clear.disabled = !marked.length;
    foot.append(btn('Ferdig', 'check', () => setCriticalMode(false), undefined, 'button primary'), clear);
    panel.append(foot);
  };

  const setCriticalMode = (on: boolean) => {
    criticalMode = on;
    selected = null;
    selectedLane = null;
    selectedHeader = false;
    selectedTrade = null;
    group = [];
    buildPanel();
    overlay();
    syncTools();
  };

  const buildGroupPanel = (plan: PlanFile) => {
    const boxes = group.map((id) => findBox(plan, id)).filter((x): x is Box => !!x);
    const plain = boxes.filter((x) => !x.resolved?.isMilestone);
    const ms = boxes.length - plain.length;
    panelHead(`${boxes.length} valgt`, ms ? `${plain.length} bokser og ${ms} milepæler` : 'Endringene gjelder alle');
    if (ms) panel.append(el('p', { class: 'panel-note' }, 'Farger og callout gjelder bare boksene.'));
    const all = (fn: (x: Box) => void, onlyBoxes = true) =>
      commit((pl) => group.forEach((id) => {
        const x = findBox(pl, id);
        if (x && !(onlyBoxes && x.resolved?.isMilestone)) fn(x);
      }));
    const same = <T,>(get: (x: Box) => T) => (plain.length && plain.every((x) => get(x) === get(plain[0])) ? get(plain[0]) : null);

    if (plain.length) {
      const sf = section('Fag');
      const ids = plain.map((x) => x.id);
      sf.append(
        tradeSelect(plan, same((x) => boxTrade(x) ?? NO_TRADE), (t) => commit((pl) => setBoxTrade(pl, ids, t)), () => createTrade(ids)),
      );
      if (plain.some((x) => x.trade !== undefined && !x.manual))
        sf.append(lockedRow('Noen har fag valgt i appen', 'Fag fra Project', 'Gir boksene faget de har i Project', () => all((x) => { if (!x.manual) delete x.trade; })));
    }

    const sc = section('Farge');
    const cur = same((x) => (x.fill ?? '').toUpperCase());
    const fromProject = plain.filter((x) => !x.manual);
    sc.append(
      swatches(cur, planSwatches(plan), (f) => all((x) => (x.fill = f))),
      colorRow(cur || '#FFFFFF', (f) => all((x) => (x.fill = f)), [
        { text: 'Fagets farge', title: 'Fjerner egen farge, så boksene får fargen til faget de har nå', disabled: !plain.some((x) => x.fill), onClick: () => all((x) => delete x.fill) },
        ...(fromProject.length
          ? [{
              text: 'Fargen fra Project',
              title: 'Fargen boksene har i Project, uansett fag og fagfarger valgt i appen',
              disabled: fromProject.every((x) => currentFill(plan, x) === projectFill(plan, x)),
              onClick: () => all((x) => setProjectColor(plan, x)),
            }]
          : []),
      ]),
      segmented('Tekstfarge', same((x) => textColorKey(x.textColor)) ?? '', TEXT_COLORS, (v) =>
        all((x) => {
          if (v === 'auto') delete x.textColor;
          else x.textColor = v === 'black' ? '#000000' : '#FFFFFF';
        })),
    );

    const so = section('Callout');
    so.append(
      segmented('Vis', same((x) => x.callout ?? 'auto') ?? '', [['auto', 'Auto'], ['on', 'På'], ['off', 'Av']], (v) =>
        all((x) => {
          if (v === 'auto') delete x.callout;
          else x.callout = v as 'on' | 'off';
        })),
      segmented('Side', same((x) => x.calloutSide ?? 'auto') ?? '', [['auto', 'Auto'], ['left', 'Venstre'], ['right', 'Høyre']], (v) =>
        all((x) => {
          if (v === 'auto') delete x.calloutSide;
          else x.calloutSide = v as 'left' | 'right';
        })),
      ...calloutWidthRows(plain, plan.plan.layout.calloutMaxWidthCm, (cm) =>
        all((x) => {
          if (cm === undefined) delete x.calloutWidthCm;
          else x.calloutWidthCm = cm;
        })),
    );

    const sp = section('Plassering');
    const inLine = boxes.every((x) => x.critical);
    sp.append(switchRow('Med i kritisk linje', inLine, (v) => setCritical(boxes.map((x) => x.id), v), 'Den kritiske linjen trekkes gjennom de merkede boksene'));
    if (plain.some((x) => x.textScale)) sp.append(lockedRow('Noen har egen tekststørrelse', 'Som planen', 'Samme tekststørrelse som resten av planen', () => all((x) => delete x.textScale)));
    if (plain.some((x) => x.height)) sp.append(lockedRow('Noen har fast høyde', 'Standard høyde', 'Så høye som teksten krever', () => all((x) => delete x.height)));
    if (boxes.some(pinned)) sp.append(lockedRow('Noen har fast plass', 'Løsne', 'La appen velge plassen i lanen igjen', () => all(unpinBox, false)));

    const foot = el('div', { class: 'panel-foot' });
    const reset = btn('Tilbakestill', 'undo', () => commit((pl) => group.forEach((id) => resetBoxInPlan(pl, id))), 'Fjerner det du har endret på de valgte', 'button push');
    reset.disabled = !boxes.some(isEdited);
    foot.append(btn('Skjul/slett', 'hide', () => removeGroup(), 'Skjuler bokser fra Project og sletter bokser laget i appen (Delete)'), reset);
    panel.append(foot);
  };

  /** Endrer fargen for et helt fag. undefined fjerner fargen fra appen. */
  const setTradeColor = (trade: string, v: { fill: string; text?: string } | undefined) =>
    commit((pl) => {
      const all = { ...pl.plan.layout.tradeColors };
      if (v) all[trade] = v;
      else delete all[trade];
      if (Object.keys(all).length) pl.plan.layout.tradeColors = all;
      else delete pl.plan.layout.tradeColors;
    });

  /** Oppføring i forklaringen: skjult eller egen tekst. Tomt valg fjernes, så filen holdes ren. */
  const setLegendItem = (key: string, patch: { hidden?: boolean; text?: string }, typing = false) => {
    const plan = host.getPlan();
    if (!plan) return;
    if (!typing || !typingSession) snapshot();
    if (typing) typingSession = true;
    const all = { ...plan.plan.layout.legendItems };
    const v = { ...all[key], ...patch };
    if (!v.hidden) delete v.hidden;
    if (!v.text?.trim()) delete v.text;
    if (Object.keys(v).length) all[key] = v;
    else delete all[key];
    if (Object.keys(all).length) plan.plan.layout.legendItems = all;
    else delete plan.plan.layout.legendItems;
    window.clearTimeout(redrawTimer);
    if (typing) redrawTimer = window.setTimeout(() => host.redraw(), 120);
    else {
      host.redraw();
      buildPanel();
    }
    syncTools();
  };
  const legendName = (key: string) => (key === FERIE_KEY ? 'Ferie' : tradeName(key));
  /** Vis eller skjul i forklaringen, og teksten som står der. */
  const legendSection = (plan: PlanFile, key: string, ownText = true) => {
    const item = plan.plan.layout.legendItems?.[key] ?? {};
    const s = section('I forklaringen');
    const inp = el('input', { type: 'text', id: 'legend-text', 'aria-label': 'Tekst i forklaringen', placeholder: legendName(key), value: item.text ?? '' }) as HTMLInputElement;
    inp.addEventListener('focus', () => (typingSession = false));
    inp.addEventListener('input', () => setLegendItem(key, { text: inp.value }, true));
    inp.addEventListener('blur', () => {
      typingSession = false;
      syncTools();
    });
    const lab = el('label', { class: 'prop', for: 'legend-text' });
    lab.append(el('span', { class: 'prop-label' }, 'Tekst'), inp);
    s.append(switchRow('Vis i forklaringen', !item.hidden, (v) => setLegendItem(key, { hidden: !v })));
    // Et fag laget i appen står med navnet sitt, som endres over, så det trenger ingen egen tekst
    if (ownText || item.text)
      s.append(lab, el('p', { class: 'hint' }, key === FERIE_KEY ? 'Tom tekst gir «Ferie».' : 'Tom tekst gir fagnavnet. Endrer bare forklaringen, ikke faget i Project. Beholdes når du oppdaterer fra Project.'));
    // Forklaringen har én felles størrelse, som lane-navnene
    if (layoutNow) {
      const base = layoutNow.legendBasePt;
      s.append(
        ...sizeStepper(plan.plan.layout.legendScale, base, (v) =>
          commit((pl) => {
            if (v === undefined) delete pl.plan.layout.legendScale;
            else pl.plan.layout.legendScale = v;
          }), {
          note: 'Egen størrelse for hele forklaringen',
          std: `standard er ${base.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} pt`,
          resetLabel: 'Standard',
          resetTitle: 'Standardstørrelsen for forklaringen',
        }),
        el('p', { class: 'hint' }, 'Størrelsen gjelder hele forklaringen og datoen nederst, så alt er like stort. Blir den for bred, går den over flere rader.'),
      );
    }
  };

  const buildTradePanel = (plan: PlanFile, trade: string) => {
    const app = isAppTrade(plan, trade);
    const own = plan.plan.layout.tradeColors?.[trade];
    const fill = tradeFill(plan, trade);
    const ids = plan.lanes.flatMap((l) => l.boxes.filter((b) => boxTrade(b) === trade && !b.resolved?.isMilestone && b.shown && !b.hidden).map((b) => b.id));
    const count = tradeCount(plan, trade);
    const own1 = plan.lanes.reduce((n, l) => n + l.boxes.filter((b) => boxTrade(b) === trade && b.fill).length, 0);
    panelHead(tradeName(trade), `${app ? 'Fag laget i appen' : 'Fag'} · ${count} ${count === 1 ? 'boks' : 'bokser'}`);
    if (own1) panel.append(el('p', { class: 'panel-note' }, `${own1} av boksene har egen farge og endres ikke.`));

    if (app) {
      // Navnet på et fag fra appen kan endres. Boksene, fargen og forklaringen følger med.
      const sn = section('Navn');
      const inp = el('input', { type: 'text', id: 'trade-name', 'aria-label': 'Navn på faget', value: trade, spellcheck: 'true' }) as HTMLInputElement;
      const msg = el('p', { class: 'hint field-error', role: 'alert' });
      msg.hidden = true;
      const save = () => {
        const v = inp.value.trim();
        if (v === trade) return;
        const problem = tradeNameProblem(plan, trade, v);
        if (problem) {
          msg.textContent = problem;
          msg.hidden = false;
          inp.setAttribute('aria-invalid', 'true');
          return;
        }
        commit((pl) => renameTrade(pl, trade, v));
        selectTrade(v);
      };
      inp.addEventListener('input', () => {
        msg.hidden = true;
        inp.removeAttribute('aria-invalid');
      });
      inp.addEventListener('change', save);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          inp.blur();
        }
        if (e.key === 'Escape') {
          inp.value = trade;
          msg.hidden = true;
          inp.blur();
        }
      });
      sn.append(inp, msg);
      if (focusTradeName) {
        focusTradeName = false;
        requestAnimationFrame(() => {
          inp.focus();
          inp.select();
        });
      }
    }

    const s = section('Farge for hele faget');
    const keepText = own?.text ? { text: own.text } : {};
    s.append(
      swatches(fill, [
        ...BOX_PALETTE,
        ...tradeColors(plan).filter((c) => c.fill && c.name !== trade).map((c): [string, string] => [c.fill!, tradeName(c.name)]),
      ], (f) => setTradeColor(trade, { fill: f, ...keepText })),
      colorRow(fill, (f) => setTradeColor(trade, { fill: f, ...keepText }), app ? undefined : { text: 'Fargen fra Project', disabled: !own, onClick: () => setTradeColor(trade, undefined) }),
      segmented('Tekstfarge', textColorKey(own?.text), TEXT_COLORS, (v) =>
        setTradeColor(trade, { fill, ...(v === 'auto' ? {} : { text: v === 'black' ? '#000000' : '#FFFFFF' }) }),
      ),
      el('p', { class: 'hint' }, app
        ? 'Gjelder alle bokser i faget som ikke har egen farge, og forklaringen nederst. Faget følger med når du oppdaterer fra Project.'
        : 'Gjelder alle bokser i faget som ikke har egen farge, og forklaringen nederst. Følger med når du oppdaterer fra Project.'),
    );

    const sb = section('Bokser');
    const pick = btn(`Velg boksene i faget`, null, () => setGroup(ids), 'Velger alle synlige bokser i faget, så du kan gi dem et annet fag eller endre dem samlet', 'button');
    pick.disabled = !ids.length;
    sb.append(pick);
    sb.append(el('p', { class: 'hint' }, count
      ? 'Da kan du gi dem et annet fag samlet.'
      : 'Ingen bokser har faget ennå, så det står ikke i forklaringen. Velg bokser og velg faget under Fag i panelet.'));

    legendSection(plan, trade, !app);

    if (app) {
      const foot = el('div', { class: 'panel-foot' });
      foot.append(btn('Slett faget', 'trash', () => {
        commit((pl) => deleteTrade(pl, trade));
        select(null);
      }, count ? `Boksene i faget får faget fra Project igjen (${count})` : 'Sletter faget', 'button push'));
      panel.append(foot);
    }
  };

  const buildPanel = () => {
    const plan = host.getPlan();
    const b = active && plan && selected ? findBox(plan, selected) : null;
    // Panelet står åpent hele tiden i redigering, så arket ikke skifter størrelse når du velger
    panel.hidden = !active || !plan;
    panel.replaceChildren();
    if (!plan || !active) return;
    if (criticalMode) return buildCriticalPanel(plan);
    if (!b && group.length > 1) return buildGroupPanel(plan);
    if (!b && selectedHeader) return buildHeaderPanel(plan);
    const lane = !b && selectedLane ? findLane(plan, selectedLane) : null;
    if (lane) return buildLanePanel(plan, lane);
    if (!b && selectedTrade === FERIE_KEY) {
      panelHead('Ferie', 'Forklaringen nederst');
      return legendSection(plan, FERIE_KEY);
    }
    if (!b && selectedTrade && tradeColors(plan).some((c) => c.name === selectedTrade)) return buildTradePanel(plan, selectedTrade);
    if (!b) {
      panel.append(el('h2', { class: 'panel-empty-title' }, 'Rediger'));
      panel.append(el('p', { class: 'panel-note' }, 'Klikk noe på arket for å endre det.'));
      const groups: [string, string[]][] = [
        ['Bokser', [
          'Klikk en boks for å velge den. Dobbeltklikk for å skrive.',
          'Dra en boks opp eller ned for å gi den fast plass i lanen, eller til en annen lane for å flytte den dit.',
          'Dra i den blå streken under valgt boks for å endre høyden. Bunnen snapper til kanten av andre bokser, så de kan stilles på linje (hold Alt for å dra fritt).',
          'Shift-klikk for å velge flere bokser, eller hold Shift og dra et rektangel.',
          'Omplasser i verktøylinjen pakker lanene på nytt, f.eks. etter at du har endret høyder. Angre om du ikke liker forslaget.',
        ]],
        ['Lanes', [
          'Klikk et lane-navn for å endre navn og farge. Dra navnet opp eller ned for ny rekkefølge.',
          'Dra i nederste kant av en lane for å gi den fast høyde.',
          'Høyreklikk et lane-navn for ny lane og skjulte lanes. Høyreklikk tomt sted i en lane for ny boks og skjulte bokser.',
        ]],
        ['Arket', [
          'Klikk et fag i forklaringen nederst for å endre fargen på alle boksene i faget, eller teksten i forklaringen. Høyreklikk for nytt fag, eller for å gi valgte bokser faget.',
          'Klikk overskriften for å endre den eller skrive en tekst øverst til høyre.',
        ]],
      ];
      for (const [title, tips] of groups) {
        const s = section(title);
        const ul = el('ul', { class: 'tips' });
        tips.forEach((t) => ul.append(el('li', {}, t)));
        s.append(ul);
        if (title === 'Arket') s.append(btn('Nytt fag', 'plus', () => createTrade([]), 'Lager et nytt fag. Navn og farge velger du i panelet.', 'button small'));
      }
      // Skjulte oppføringer står ikke i forklaringen, så de vises igjen herfra
      const hiddenLeg = Object.entries(plan.plan.layout.legendItems ?? {}).filter(([, v]) => v.hidden);
      if (hiddenLeg.length) {
        const sh = section('Skjult i forklaringen');
        for (const [key, v] of hiddenLeg) sh.append(lockedRow(v.text?.trim() || legendName(key), 'Vis', 'Vis oppføringen i forklaringen igjen', () => setLegendItem(key, { hidden: false })));
      }
      const keys = section('Hurtigtaster');
      const dl = el('dl', { class: 'keys' });
      for (const [k, t] of [['Ctrl+Z', 'Angre'], ['Ctrl+Y', 'Gjør om'], ['Ctrl+D', 'Dupliser boks'], ['Ctrl+C', 'Kopier boks'], ['Ctrl+V', 'Lim inn'], ['Delete', 'Skjul boks'], ['Esc', 'Fjern valget']]) {
        const kbd = el('kbd', {}, k);
        const dt = el('dt', {});
        dt.append(kbd);
        dl.append(dt, el('dd', {}, t));
      }
      keys.append(dl);
      return;
    }
    const ms = !!b.resolved?.isMilestone;
    const r = b.resolved;
    const when = r ? (ms || r.start === r.finish ? fmtDate(r.start) : `${fmtDate(r.start)} – ${fmtDate(r.finish)}`) : '';
    const sub = b.manual ? 'Laget i appen, følger ikke Project' : when;
    panelHead(ms ? 'Milepæl' : 'Boks', sub || undefined);
    if (b.manual && r) {
      // Boks laget i appen: datoene velges her. En milepæl har én dato.
      const sd = section(ms ? 'Dato' : 'Datoer');
      const row = el('div', { class: 'row dates' });
      const mk = (key: 'start' | 'finish', label: string) => {
        const lab = el('label', {}, label);
        const inp = el('input', { type: 'date', value: r[key], min: plan.plan.calendar.start, max: plan.plan.calendar.end }) as HTMLInputElement;
        inp.addEventListener('change', () => {
          const v = inp.value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
          change((x) => {
            if (!x.resolved) return;
            if (ms) {
              x.resolved.start = v;
              x.resolved.finish = v;
              return;
            }
            x.resolved[key] = v;
            if (x.resolved.start > x.resolved.finish) x.resolved[key === 'start' ? 'finish' : 'start'] = v;
          });
        });
        lab.append(inp);
        row.append(lab);
      };
      if (ms) mk('start', 'Dato');
      else {
        mk('start', 'Fra');
        mk('finish', 'Til');
      }
      sd.append(row);
    }

    const st = section('Tekst');
    st.append(
      textField('box-text', 'Tekst', b.text, '3', (v) =>
        change((x) => {
          keepOriginal(x);
          x.text = v;
        }, { typing: true, rebuild: false }),
      ),
      el('p', { class: 'hint' }, 'Skriv | for linjeskift og /| for en loddrett strek.'),
    );
    if (!ms && layoutNow) st.append(...textSizeRow(b, layoutNow.textSizePt));
    if (ms) {
      // Utseende fra appen går foran det som er valgt i Project
      const base = b.milestone ?? { symbol: 'diamond', color: 'blue', showDate: true, verticalLine: false };
      const stl = { ...base, ...b.milestoneStyle };
      type MsKey = 'symbol' | 'color' | 'verticalLine' | 'showDate';
      const setMs = (k: MsKey, v: unknown) =>
        change((x) => {
          const m: Record<string, unknown> = { ...x.milestoneStyle };
          if ((base as Record<string, unknown>)[k] === v) delete m[k];
          else m[k] = v;
          if (Object.keys(m).length) x.milestoneStyle = m as Box['milestoneStyle'];
          else delete x.milestoneStyle;
        });
      const su = section('Utseende');
      const names: Record<string, string> = { red: 'Rød', yellow: 'Gul', green: 'Grønn', blue: 'Blå', orange: 'Oransje', black: 'Svart' };
      const entries = Object.entries(MILESTONE_COLORS);
      const cw = el('div', { class: 'prop prop-inline' });
      cw.append(
        el('span', { class: 'prop-label' }, 'Farge'),
        swatches(MILESTONE_COLORS[stl.color as keyof typeof MILESTONE_COLORS]?.fill.toUpperCase() ?? null, entries.map(([k, c]): [string, string] => [c.fill, names[k]]), (f) => {
          const k = entries.find(([, c]) => c.fill.toUpperCase() === f)?.[0];
          if (k) setMs('color', k);
        }),
      );
      su.append(
        segmented('Symbol', stl.symbol, [['diamond', 'Ruter', 'diamond'], ['flag', 'Flagg', 'flag']], (v) => setMs('symbol', v)),
        cw,
        switchRow('Vis dato', stl.showDate, (v) => setMs('showDate', v)),
        switchRow('Loddrett linje', stl.verticalLine, (v) => setMs('verticalLine', v), 'Strek fra milepælen ned gjennom planen'),
      );
      if (b.milestoneStyle) su.append(btn('Bruk utseendet fra Project', null, () => change((x) => delete x.milestoneStyle), undefined, 'linkish'));
    } else {
      // Fag: valgt i appen går foran faget fra Project
      const trade = boxTrade(b) ?? NO_TRADE;
      const sg = section('Fag');
      sg.append(tradeSelect(plan, trade, (t) => commit((pl) => setBoxTrade(pl, [b.id], t)), () => createTrade([b.id])));
      if (b.trade !== undefined && !b.manual && r)
        sg.append(lockedRow(`Project har «${tradeName(r.trade)}»`, 'Fag fra Project', 'Gir boksen faget den har i Project', () => change((x) => delete x.trade)));
      if (tradeColors(plan).some((c) => c.name === trade))
        sg.append(btn(`Endre faget «${tradeName(trade)}»`, null, () => selectTrade(trade), 'Farge og navn for hele faget, og teksten i forklaringen', 'linkish'));

      // Bakgrunnsfarge: de faste boksfargene og fagfargene i planen, pluss egen farge.
      const sc = section('Farge');
      const pf = projectFill(plan, b);
      const nowFill = currentFill(plan, b);
      sc.append(
        swatches((b.fill ?? '').toUpperCase(), planSwatches(plan), (f) => change((x) => (x.fill = f))),
        colorRow(nowFill, (f) => change((x) => (x.fill = f)), [
          { text: 'Fagets farge', title: `Fjerner egen farge, så boksen får fargen til «${tradeName(trade)}»`, disabled: !b.fill, onClick: () => change((x) => delete x.fill) },
          ...(pf ? [{ text: 'Fargen fra Project', title: 'Fargen boksen har i Project, uansett fag og fagfarger valgt i appen', disabled: nowFill === pf, onClick: () => change((x) => setProjectColor(plan, x)) }] : []),
        ]),
        segmented('Tekstfarge', textColorKey(b.textColor), TEXT_COLORS, (v) =>
          change((x) => {
            if (v === 'auto') delete x.textColor;
            else x.textColor = v === 'black' ? '#000000' : '#FFFFFF';
          }),
        ),
      );

      const so = section('Callout');
      so.append(
        segmented('Vis', b.callout ?? 'auto', [['auto', 'Auto'], ['on', 'På'], ['off', 'Av']], (v) =>
          change((x) => {
            if (v === 'auto') delete x.callout;
            else x.callout = v;
          }),
        ),
        segmented('Side', b.calloutSide ?? 'auto', [['auto', 'Auto'], ['left', 'Venstre'], ['right', 'Høyre']], (v) =>
          change((x) => {
            if (v === 'auto') delete x.calloutSide;
            else x.calloutSide = v;
          }),
        ),
        ...calloutWidthRows([b], plan.plan.layout.calloutMaxWidthCm, (cm) =>
          change((x) => {
            if (cm === undefined) delete x.calloutWidthCm;
            else x.calloutWidthCm = cm;
          }),
        ),
      );
      if (b.rotation !== 0) so.append(el('p', { class: 'hint' }, 'Rotert tekst får ikke callout.'));

      const sf = section('Form');
      sf.append(
        segmented('Type', b.spanTo !== undefined ? 'span' : b.header ? 'header' : 'normal', [['normal', 'Vanlig'], ['header', 'Overskrift'], ['span', 'Multi Lane']], (v) => {
          if (v === 'span') return setSpan(b.id, true);
          if (b.spanTo !== undefined) setSpan(b.id, false);
          if (v === 'header' || b.header) setHeader(b.id, v === 'header');
        }),
      );
      // Tre valg trenger hele bredden, så navnet står over knappene
      sf.lastElementChild!.classList.replace('prop-inline', 'prop');
      if (b.header || b.spanTo !== undefined)
        sf.append(
          switchRow('Fet skrift', !!b.bold, (v) =>
            change((x) => {
              if (v) x.bold = true;
              else delete x.bold;
            }),
          ),
        );
      if (b.header) sf.append(el('p', { class: 'hint' }, 'Teksten står øverst. Dra andre bokser inn i den; de flyttes med når du flytter overskriftsboksen.'));
      if (b.spanTo !== undefined && plan) {
        const wrap = el('label', { class: 'prop prop-inline' });
        wrap.append(el('span', { class: 'prop-label' }, 'Ned til'));
        const sel = el('select', { id: 'span-to', 'aria-label': 'Boksen går ned til bunnen av denne lanen' }) as HTMLSelectElement;
        for (const l of lanesFrom(plan, b.id)) {
          const o = el('option', { value: l.id }, plain(l.name) || 'Uten navn') as HTMLOptionElement;
          o.selected = l.id === b.spanTo;
          sel.append(o);
        }
        sel.addEventListener('change', () => setSpan(b.id, sel.value));
        wrap.append(sel);
        sf.append(
          wrap,
          segmented('Tekst', b.textMiddle ? 'middle' : 'top', [['top', 'Øverst'], ['middle', 'I midten']], (v) =>
            change((x) => {
              if (v === 'middle') x.textMiddle = true;
              else delete x.textMiddle;
            }),
          ),
        );
        if (b.spanEnd !== undefined) sf.append(lockedRow('Egen høyde, slutter inne i lanen', 'Fyll lanen', 'La boksen gå helt ned til bunnen av lanen', () => setSpan(b.id, b.spanTo!)));
        sf.append(el('p', { class: 'hint' }, 'Boksen går ned i lanene under uten å gjøre noen lane høyere. Den ligger bak de andre boksene, så de kan stå inni. Dra i den blå streken nederst for å endre høyden; den snapper til bunnen av hver lane.'));
      }
      sf.append(
        segmented<Rotation>('Rotasjon', b.rotation, [[0, 'Ingen'], [90, '90°'], [-90, '−90°']], (v) =>
          change((x) => {
            keepOriginal(x);
            x.rotation = v;
          }),
        ),
      );
    }

    const sp = section('Plassering');
    sp.append(switchRow('Med i kritisk linje', !!b.critical, (v) => setCritical([b.id], v), 'Den kritiske linjen trekkes gjennom de merkede boksene'));
    if (!ms && b.height) sp.append(lockedRow('Fast høyde', 'Standard høyde', 'Så høy som teksten krever', () => change((x) => delete x.height)));
    if (pinned(b)) sp.append(lockedRow('Fast plass i lanen', 'Løsne', 'La appen velge plassen i lanen igjen', () => change(unpinBox)));
    sp.append(el('p', { class: 'hint' }, ms ? 'Dra milepælen opp eller ned for å gi den fast plass.' : 'Dra boksen opp eller ned for å gi den fast plass. Dra i den blå streken nederst for å endre høyden. Kantene snapper til andre bokser; hold Alt for å dra fritt.'));

    const foot = el('div', { class: 'panel-foot' });
    const reset = btn('Tilbakestill', 'undo', () => commit((pl) => resetBoxInPlan(pl, b.id)), 'Fjerner det du har endret, så appens forslag gjelder igjen', 'button push');
    reset.disabled = !isEdited(b);
    foot.append(
      btn('Dupliser', 'copy', () => copySelected(), 'Lag en kopi rett under (Ctrl+D). Ctrl+C og Ctrl+V kopierer til en annen lane.'),
      btn(b.manual ? 'Slett' : 'Skjul', b.manual ? 'trash' : 'hide', () => removeSelected(), b.manual ? 'Slett boksen (Delete)' : 'Skjul boksen. Høyreklikk lanen for å vise den igjen. (Delete)'),
      reset,
    );
    panel.append(foot);
  };

  // ---- Markeringer i tegningen (kommer ikke med i PDF eller utskrift) ----
  const overlay = () => {
    if (!svgNow || !layoutNow) return;
    svgNow.querySelector('g.edit-overlay.edit-marks')?.remove();
    if (!active) return;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'edit-overlay edit-marks');
    g.setAttribute('pointer-events', 'none');
    const plan = host.getPlan();
    for (const it of layoutNow.items) {
      const b = plan ? findBox(plan, it.id) : null;
      const r = bounds(it);
      if (it.id === selected || group.includes(it.id)) {
        const rect = document.createElementNS(NS, 'rect');
        const pad = 0.6;
        for (const [k, v] of Object.entries({ x: r.x0 - pad, y: r.y0 - pad, width: r.x1 - r.x0 + 2 * pad, height: r.y1 - r.y0 + 2 * pad, fill: 'none', stroke: ACCENT, 'stroke-width': 0.5, rx: 0.6 }))
          rect.setAttribute(k, String(v));
        g.append(rect);
      }
      if (criticalMode && b?.critical) {
        const rect = document.createElementNS(NS, 'rect');
        for (const [k, v] of Object.entries({ x: r.x0 - 0.5, y: r.y0 - 0.5, width: r.x1 - r.x0 + 1, height: r.y1 - r.y0 + 1, fill: '#E00000', 'fill-opacity': 0.08, stroke: '#E00000', 'stroke-width': 0.4, 'stroke-dasharray': '1 0.6', rx: 0.5 }))
          rect.setAttribute(k, String(v));
        g.append(rect);
      }
      if (arrangeMoved.has(it.id)) {
        const rect = document.createElementNS(NS, 'rect');
        for (const [k, v] of Object.entries({ x: r.x0 - 0.4, y: r.y0 - 0.4, width: r.x1 - r.x0 + 0.8, height: r.y1 - r.y0 + 0.8, fill: ACCENT, 'fill-opacity': 0.1, stroke: ACCENT, 'stroke-width': 0.4, 'stroke-dasharray': '1 0.6', rx: 0.5 }))
          rect.setAttribute(k, String(v));
        g.append(rect);
      }
      if (showMarks && b && isEdited(b)) {
        const c = document.createElementNS(NS, 'circle');
        // Prikken står i boksens øvre høyre hjørne, også når teksten står i callout ved siden av
        const at = it.kind === 'box' ? { cx: it.x1, cy: it.y } : { cx: r.x1, cy: r.y0 };
        for (const [k, v] of Object.entries({ ...at, r: 0.9, fill: ACCENT, stroke: '#FFFFFF', 'stroke-width': 0.3 })) c.setAttribute(k, String(v));
        g.append(c);
      }
    }
    // Håndtak: nederste kant av valgt boks og av hver lane. Strekbredden er i skjermpunkter, så de er like lette å treffe uansett zoom.
    const line = (x1: number, x2: number, y: number, attrs: Record<string, string | number>) => {
      const l = document.createElementNS(NS, 'line');
      for (const [k, v] of Object.entries({ x1, x2, y1: y, y2: y, 'vector-effect': 'non-scaling-stroke', ...attrs })) l.setAttribute(k, String(v));
      g.append(l);
      return l;
    };
    const L = layoutNow;
    const le = selectedTrade ? L.legend.find((x) => x.trade === selectedTrade) : null;
    if (selectedHeader) {
      const rect = document.createElementNS(NS, 'rect');
      for (const [k, v] of Object.entries({ x: 1, y: 1, width: L.width - 2, height: L.headerBottom - 1.5, fill: 'none', stroke: ACCENT, 'stroke-width': 0.5, rx: 0.8 })) rect.setAttribute(k, String(v));
      g.append(rect);
    }
    if (le) {
      const rect = document.createElementNS(NS, 'rect');
      for (const [k, v] of Object.entries({ x: le.x - 0.8, y: le.y - 0.8, width: le.w + 1.6, height: le.h + 1.6, fill: 'none', stroke: ACCENT, 'stroke-width': 0.5, rx: 0.5 })) rect.setAttribute(k, String(v));
      g.append(rect);
    }
    for (const ln of L.lanes) {
      const pl = plan ? findLane(plan, ln.id) : null;
      if (ln.id === selectedLane) {
        const rect = document.createElementNS(NS, 'rect');
        for (const [k, v] of Object.entries({ x: L.laneTitleX + 0.3, y: ln.y0 + 0.3, width: L.plot.x0 - L.laneTitleX - 0.6, height: ln.y1 - ln.y0 - 0.6, fill: 'none', stroke: ACCENT, 'stroke-width': 0.6 }))
          rect.setAttribute(k, String(v));
        g.append(rect);
      }
      if (showMarks && pl && (pl.original || pl.manual)) {
        const c = document.createElementNS(NS, 'circle');
        for (const [k, v] of Object.entries({ cx: L.plot.x0 - 1.4, cy: ln.y0 + 1.4, r: 0.9, fill: ACCENT, stroke: '#FFFFFF', 'stroke-width': 0.3 })) c.setAttribute(k, String(v));
        g.append(c);
      }
    }
    for (const ln of layoutNow.lanes) {
      if (ln.manual) line(layoutNow.laneTitleX, layoutNow.plot.x0, ln.y1, { stroke: ACCENT, 'stroke-width': 3 });
      // Kompakt ser bort fra fast lanehøyde, så kanten kan ikke dras der
      if (!layoutNow.compact) line(layoutNow.laneTitleX, layoutNow.plot.x0, ln.y1, { class: 'edit-handle lane-edge', 'data-lane': ln.id, stroke: 'transparent', 'stroke-width': 8, 'pointer-events': 'stroke' });
    }
    const sel = layoutNow.items.find((i) => i.id === selected);
    // Ikke i kritisk linje-modus: der skal et klikk like under boksen treffe naboen
    if (sel?.kind === 'box' && !criticalMode) {
      const w = sel.x1 - sel.x0;
      line(sel.x0 + w * 0.25, sel.x1 - w * 0.25, sel.y + sel.h, { stroke: ACCENT, 'stroke-width': 3, 'stroke-linecap': 'round' });
      line(sel.x0, sel.x1, sel.y + sel.h, { class: 'edit-handle box-handle', stroke: 'transparent', 'stroke-width': 7, 'pointer-events': 'stroke' });
    }
    svgNow.append(g);
  };

  // ---- Dra: høyde på boks, plass i lanen og høyde på lane ----
  const toMm = (clientX: number, clientY: number) => {
    const m = svgNow?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const laneAt = (y: number): LaneLayout | undefined => layoutNow?.lanes.find((l) => y >= l.y0 - 1e-6 && y < l.y1 + 1e-6);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  interface Drag {
    startY: number;
    startClient: number;
    moved: boolean;
    move(dy: number): void;
    /** Dra som også følger musen sidelengs (rektangelvalg). Får punktet i mm. */
    moveXY?(x: number, y: number): void;
    startClientX?: number;
    end(): void;
  }
  let drag: Drag | null = null;
  let suppressClick = false;

  const ghostLayer = () => {
    svgNow?.querySelector('g.edit-ghost')?.remove();
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'edit-overlay edit-ghost');
    g.setAttribute('pointer-events', 'none');
    svgNow?.append(g);
    return g;
  };
  const shape = <K extends 'rect' | 'line'>(g: SVGGElement, tag: K, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    g.append(e);
    return e;
  };
  const set = (e: Element, attrs: Record<string, string | number>) => Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));

  /** Alt holdt nede under dra: ingen snapping. */
  let snapOff = false;
  /**
   * Snapping mot kanten av andre bokser når høyde eller plass dras, så bunner og topper kan
   * stilles på linje uten øyemål. En stiplet hjelpelinje viser kanten, og boksen den hører til
   * rammes inn. Gjelder bokser i hele planen, også i andre lanes.
   */
  const snapper = (g: SVGGElement, skip: Set<string>) => {
    const L = layoutNow!;
    const edges = L.items.filter((o): o is BoxItem => o.kind === 'box' && !skip.has(o.id)).flatMap((o) => [
      { y: o.y, o },
      { y: o.y + o.h, o },
    ]);
    const guide = shape(g, 'line', { x1: L.laneTitleX, x2: L.plot.x1, y1: 0, y2: 0, stroke: ACCENT, 'stroke-width': 1.5, 'stroke-dasharray': '5 3', 'vector-effect': 'non-scaling-stroke', visibility: 'hidden' });
    const mark = shape(g, 'rect', { fill: 'none', stroke: ACCENT, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', visibility: 'hidden' });
    // Omtrent seks skjermpunkter, uansett zoom
    const tol = () => {
      const a = toMm(0, 0);
      const b = toMm(0, 6);
      return Math.abs(b.y - a.y) || 1;
    };
    const hide = () => {
      set(guide, { visibility: 'hidden' });
      set(mark, { visibility: 'hidden' });
    };
    return {
      /** Finner kanten nærmest en av de dragne kantene (ys). Gir hvor langt den må flyttes, eller null. */
      find(ys: number[]): { d: number; y: number; o: BoxItem } | null {
        if (snapOff) return null;
        const t = tol();
        let best: { d: number; y: number; o: BoxItem } | null = null;
        for (const y of ys)
          for (const e of edges) {
            const d = e.y - y;
            if (Math.abs(d) <= t && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, y: e.y, o: e.o };
          }
        return best;
      },
      show(hit: { y: number; o: BoxItem } | null) {
        if (!hit) return hide();
        set(guide, { y1: hit.y, y2: hit.y, visibility: 'visible' });
        set(mark, { x: hit.o.x0, y: hit.o.y, width: hit.o.x1 - hit.o.x0, height: hit.o.h, visibility: 'visible' });
      },
    };
  };

  /**
   * Multi Lane-boks: bunnen dras fritt nedover lanene, i trinn på en kvart tekstlinje. Den snapper til
   * bunnen av hver lane (og til kantene på andre bokser), så den lett fyller en lane helt.
   */
  const startSpanResize = (it: BoxItem): Drag | null => {
    const L = layoutNow;
    const home = laneAt(it.y);
    if (!L || !home) return null;
    const unit = L.unit;
    const pad = home.top - home.y0;
    const below = L.lanes.slice(L.lanes.indexOf(home));
    const minBottom = it.y + (it.minH ?? unit);
    const maxBottom = below[below.length - 1].y1 - pad;
    const g = ghostLayer();
    const r = shape(g, 'rect', { x: it.x0, y: it.y, width: it.x1 - it.x0, height: it.h, fill: ACCENT, 'fill-opacity': 0.15, stroke: ACCENT, 'stroke-width': 0.4, 'stroke-dasharray': '1 0.6' });
    // Snapping til lanebunnen vises annerledes enn snapping til bokser: lanen tones, og en heltrukken
    // strek legger seg på skillelinjen mellom lanene
    const tint = shape(g, 'rect', { x: L.laneTitleX, y: 0, width: L.plot.x1 - L.laneTitleX, height: 0, fill: ACCENT, 'fill-opacity': 0.08, visibility: 'hidden' });
    const line = shape(g, 'line', { x1: L.laneTitleX, x2: L.plot.x1, y1: 0, y2: 0, stroke: ACCENT, 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke', visibility: 'hidden' });
    const snap = snapper(g, new Set([it.id]));
    // Lanebunnene trekker litt sterkere enn kantene på andre bokser: omtrent ti skjermpunkter
    const laneTol = () => Math.abs(toMm(0, 10).y - toMm(0, 0).y) || 1.5;
    let bottom = it.y + it.h;
    let filled: LaneLayout | null = null;
    return {
      startY: it.y + it.h,
      startClient: 0,
      moved: false,
      move(dy) {
        const want = clamp(it.y + it.h + dy, minBottom, maxBottom);
        filled = null;
        snap.show(null);
        const t = laneTol();
        const near = snapOff ? undefined : below.filter((l) => l.y1 - pad >= minBottom - 1e-6).find((l) => Math.abs(l.y1 - pad - want) <= t);
        if (near) {
          filled = near;
          bottom = near.y1 - pad;
        } else {
          // Kanter like ved en lanebunn (som toppen av boksene i lanen under) snapper ikke, så de ikke forveksles
          const found = snap.find([want]);
          const hit = found && below.some((l) => Math.abs(found.y - (l.y1 - pad)) < 2 * t) ? null : found;
          bottom = hit ? clamp(want + hit.d, minBottom, maxBottom) : clamp(it.y + Math.round((want - it.y) / (unit / 4)) * (unit / 4), minBottom, maxBottom);
          if (hit && Math.abs(bottom - hit.y) < 1e-6) snap.show(hit);
        }
        set(line, { y1: filled?.y1 ?? 0, y2: filled?.y1 ?? 0, visibility: filled ? 'visible' : 'hidden' });
        set(tint, filled ? { y: filled.y0, height: filled.y1 - filled.y0, visibility: 'visible' } : { visibility: 'hidden' });
        set(r, { height: bottom - it.y });
      },
      end() {
        g.remove();
        if (Math.abs(bottom - (it.y + it.h)) < 1e-6) return;
        const lane = filled ?? below.find((l) => bottom <= l.y1 - pad + 1e-6) ?? below[below.length - 1];
        const end = Math.max(0, lines(bottom - lane.top, unit));
        // Kompakt i samme lane: bunnen lagres bare for Kompakt, så «Fyll hele arket» er som før
        if (L.compact && lane.id === findBox(host.getPlan()!, it.id)?.spanTo)
          return commit((pl) => {
            const b = findBox(pl, it.id);
            if (b) b.compactSpanEnd = end;
          });
        if (filled) return setSpan(it.id, filled.id);
        setSpan(it.id, lane.id, end);
      },
    };
  };

  const startBoxResize = (it: BoxItem): Drag | null => {
    if (it.span) return startSpanResize(it);
    const lane = laneAt(it.y);
    if (!lane || !layoutNow) return null;
    const unit = layoutNow.unit;
    const pad = lane.top - lane.y0;
    const minH = it.minH ?? it.h;
    const maxH = Math.max(minH, lane.y1 - pad - it.y);
    const g = ghostLayer();
    const r = shape(g, 'rect', { x: it.x0, y: it.y, width: it.x1 - it.x0, height: it.h, fill: ACCENT, 'fill-opacity': 0.15, stroke: ACCENT, 'stroke-width': 0.4, 'stroke-dasharray': '1 0.6' });
    const snap = snapper(g, new Set([it.id]));
    let h = it.h;
    return {
      startY: it.y + it.h,
      startClient: 0,
      moved: false,
      move(dy) {
        // Bunnen snapper til kanten av en annen boks, ellers trinn på en kvart tekstlinje
        const hit = snap.find([it.y + it.h + dy]);
        const want = hit ? it.y + it.h + dy + hit.d - it.y : Math.round((it.h + dy) / (unit / 4)) * (unit / 4);
        h = clamp(want, minH, maxH);
        snap.show(hit && Math.abs(h - want) < 1e-6 ? hit : null);
        set(r, { height: h });
      },
      end() {
        g.remove();
        if (Math.abs(h - it.h) < 1e-6) return;
        commit((plan) => {
          const b = findBox(plan, it.id);
          if (!b) return;
          if (h <= minH + 1e-6) delete b.height;
          else b.height = lines(h, unit);
          // Høyden alene fester ikke boksen: appen finner plassen i lanen som før
        });
      },
    };
  };

  const startMove = (it: Item): Drag | null => {
    if (!layoutNow) return null;
    const r = bounds(it);
    const home = laneAt(r.y0);
    if (!home) return null;
    const L = layoutNow;
    const unit = L.unit;
    // Multi Lane-boks: i lanen tar den bare plass til teksten øverst, så det er den som flyttes innenfor lanen
    const span = it.kind === 'box' && !!it.span;
    const fh = span ? Math.min((it as BoxItem).minH ?? r.y1 - r.y0, r.y1 - r.y0) : r.y1 - r.y0;
    let lane = home;
    let g: SVGGElement | null = null;
    let rect: SVGRectElement | null = null;
    let target: SVGRectElement | null = null;
    let y = r.y0;
    let snap: ReturnType<typeof snapper> | null = null;
    const kidItems = () =>
      it.kind === 'box' && it.header && !it.span
        ? L.items.filter((o) => inHeaderBox(it, o))
        : [];
    const kidsOf = () => kidItems().map((o) => o.id);
    // Kanten som snapper: selve boksen, ikke callouten
    const bh = it.kind === 'box' ? it.h : fh;
    return {
      startY: r.y0,
      startClient: 0,
      moved: false,
      move(dy) {
        if (!g) {
          g = ghostLayer();
          // Lanen boksen havner i, markert svakt
          target = shape(g, 'rect', { x: L.laneTitleX, y: home.y0, width: L.plot.x1 - L.laneTitleX, height: home.y1 - home.y0, fill: ACCENT, 'fill-opacity': 0.06 });
          rect = shape(g, 'rect', { x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0, fill: ACCENT, 'fill-opacity': 0.15, stroke: ACCENT, 'stroke-width': 0.4, 'stroke-dasharray': '1 0.6' });
        }
        // Boksen kan dras til en annen lane; midten av boksen bestemmer hvilken
        const first = L.lanes[0];
        const last = L.lanes[L.lanes.length - 1];
        lane = laneAt(clamp(r.y0 + dy + fh / 2, first.y0, last.y1 - 1e-3)) ?? home;
        const pad = lane.top - lane.y0;
        const maxY = Math.max(lane.top, lane.y1 - pad - fh);
        // Topp eller bunn snapper til kanten av en annen boks, ellers trinn på en kvart tekstlinje
        if (!snap) snap = snapper(g!, new Set([it.id, ...kidsOf()]));
        const top = r.y0 + dy;
        const hit = it.kind === 'box' ? snap.find(span ? [top] : [top, top + bh]) : null;
        const want = hit ? top + hit.d : lane.top + Math.round((top - lane.top) / (unit / 4)) * (unit / 4);
        // I samme lane står bunnen av en Multi Lane-boks fast, så toppen kan flyttes ned uten at bunnen følger
        y = clamp(want, lane.top, span && lane === home ? Math.min(maxY, r.y1 - fh) : maxY);
        snap.show(hit && Math.abs(y - want) < 1e-6 ? hit : null);
        set(rect!, span && lane === home ? { y, height: r.y1 - y } : { y, height: r.y1 - r.y0 });
        set(target!, { y: lane.y0, height: lane.y1 - lane.y0, 'fill-opacity': lane === home ? 0 : 0.06 });
      },
      end() {
        g?.remove();
        if (Math.abs(y - r.y0) < 1e-6 && lane === home) return;
        selected = it.id;
        // En overskriftsboks tar med seg boksene som ligger inne i den
        const kids = kidItems().map((o) => ({ id: o.id, dy: bounds(o).y0 - r.y0 }));
        commit((plan) => {
          for (const m of [{ id: it.id, dy: 0 }, ...kids]) {
            if (lane !== home) moveBox(plan, m.id, lane.id);
            const b = findBox(plan, m.id);
            // I Kompakt lagres plassen bare for Kompakt, så «Fyll hele arket» er som før.
            // Til en annen lane gjelder plassen begge, den gamle hører til forrige lane.
            if (b) {
              const at = lines(y + m.dy - lane.top, unit);
              if (!L.compact || lane !== home) b.top = at;
              if (L.compact) b.compactTop = at;
              else if (lane !== home) delete b.compactTop;
            }
            // Multi Lane-boks i en annen lane: den går like mange lanes ned som før
            if (b && span && lane !== home && b.spanTo !== undefined) {
              const from = L.lanes.findIndex((l) => l.id === b.spanTo);
              const shift = L.lanes.indexOf(lane) - L.lanes.indexOf(home);
              if (from >= 0) b.spanTo = L.lanes[clamp(from + shift, L.lanes.indexOf(lane), L.lanes.length - 1)].id;
            }
          }
        });
      },
    };
  };

  const startLaneResize = (ln: LaneLayout): Drag | null => {
    if (!layoutNow) return null;
    const unit = layoutNow.unit;
    const L = layoutNow;
    const g = ghostLayer();
    const lineAttrs = { x1: L.laneTitleX, x2: L.plot.x1, 'vector-effect': 'non-scaling-stroke' };
    const ghost = shape(g, 'line', { ...lineAttrs, y1: ln.y1, y2: ln.y1, stroke: ACCENT, 'stroke-width': 2 });
    // Rød stiplet strek: lanen kan ikke bli lavere enn innholdet
    const floor = shape(g, 'line', { ...lineAttrs, y1: ln.y0 + ln.minH, y2: ln.y0 + ln.minH, stroke: '#D0021B', 'stroke-width': 2, 'stroke-dasharray': '6 4', visibility: 'hidden' });
    const startH = ln.y1 - ln.y0;
    let h = startH;
    return {
      startY: ln.y1,
      startClient: 0,
      moved: false,
      move(dy) {
        const raw = Math.round((startH + dy) / (unit / 4)) * (unit / 4);
        h = Math.max(ln.minH, raw);
        set(ghost, { y1: ln.y0 + h, y2: ln.y0 + h });
        set(floor, { visibility: raw < ln.minH ? 'visible' : 'hidden' });
      },
      end() {
        g.remove();
        if (Math.abs(h - startH) < 1e-6 && ln.manual) return;
        commit((plan) => {
          const lane = findLane(plan, ln.id);
          if (lane) lane.height = lines(h, unit);
        });
      },
    };
  };

  /** Dra lane-navnet opp eller ned for å endre rekkefølgen. */
  const startLaneMove = (ln: LaneLayout): Drag | null => {
    if (!layoutNow) return null;
    const L = layoutNow;
    const others = L.lanes.filter((x) => x !== ln);
    let g: SVGGElement | null = null;
    let rect: SVGRectElement | null = null;
    let mark: SVGLineElement | null = null;
    let k = L.lanes.indexOf(ln);
    const h = ln.y1 - ln.y0;
    return {
      startY: ln.y0,
      startClient: 0,
      moved: false,
      move(dy) {
        if (!g) {
          g = ghostLayer();
          rect = shape(g, 'rect', { x: L.laneTitleX, y: ln.y0, width: L.plot.x0 - L.laneTitleX, height: h, fill: ACCENT, 'fill-opacity': 0.15, stroke: ACCENT, 'stroke-width': 0.4, 'stroke-dasharray': '1 0.6' });
          mark = shape(g, 'line', { x1: L.laneTitleX, x2: L.plot.x1, y1: 0, y2: 0, stroke: ACCENT, 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke' });
        }
        const mid = ln.y0 + dy + h / 2;
        // Ny plass: foran den første lanen som har midten sin under midten av den som dras
        k = others.findIndex((o) => (o.y0 + o.y1) / 2 > mid);
        if (k < 0) k = others.length;
        const at = k < others.length ? others[k].y0 : others[others.length - 1]?.y1 ?? ln.y1;
        set(rect!, { y: clamp(ln.y0 + dy, L.lanes[0].y0, L.lanes[L.lanes.length - 1].y1 - h) });
        set(mark!, { y1: at, y2: at });
      },
      end() {
        g?.remove();
        if (k === L.lanes.indexOf(ln)) return;
        const before = others[k]?.id;
        const last = others[others.length - 1]?.id;
        selectedLane = ln.id;
        selected = null;
        commit((plan) => {
          const i = plan.lanes.findIndex((x) => x.id === ln.id);
          if (i < 0) return;
          const [lane] = plan.lanes.splice(i, 1);
          const j = before ? plan.lanes.findIndex((x) => x.id === before) : plan.lanes.findIndex((x) => x.id === last) + 1;
          plan.lanes.splice(Math.max(0, j), 0, lane);
        });
      },
    };
  };

  const select = (id: string | null) => {
    selected = id;
    group = [];
    selectedLane = null;
    selectedHeader = false;
    selectedTrade = null;
    typingSession = false;
    buildPanel();
    overlay();
  };

  const selectTrade = (t: string) => {
    group = [];
    selected = null;
    selectedLane = null;
    selectedHeader = false;
    selectedTrade = t;
    typingSession = false;
    buildPanel();
    overlay();
  };
  const selectLane = (id: string | null) => {
    group = [];
    selected = null;
    selectedTrade = null;
    selectedLane = id;
    selectedHeader = false;
    typingSession = false;
    buildPanel();
    overlay();
  };

  const selectHeader = () => {
    group = [];
    selected = null;
    selectedLane = null;
    selectedTrade = null;
    selectedHeader = true;
    typingSession = false;
    buildPanel();
    overlay();
  };
  /** Klikk i toppfeltet over kalenderen (overskrift, logo og tekst til høyre). */
  const inHeader = (e: MouseEvent) => {
    if (!active || !layoutNow) return false;
    const p = toMm(e.clientX, e.clientY);
    return p.y < layoutNow.headerBottom && p.x >= 0 && p.x <= layoutNow.width;
  };

  /** Shift-klikk: legg til eller ta bort en boks fra valget. */
  const toggleInGroup = (id: string) => {
    const cur = group.length ? [...group] : selected ? [selected] : [];
    const i = cur.indexOf(id);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(id);
    selectedLane = null;
    selectedHeader = false;
    selectedTrade = null;
    typingSession = false;
    if (cur.length > 1) {
      group = cur;
      selected = null;
    } else {
      group = [];
      selected = cur[0] ?? null;
    }
    buildPanel();
    overlay();
  };
  const setGroup = (ids: string[]) => {
    if (ids.length <= 1) return select(ids[0] ?? null);
    group = ids;
    selected = null;
    selectedLane = null;
    selectedHeader = false;
    selectedTrade = null;
    buildPanel();
    overlay();
  };

  /** Shift + dra på tom plass: velg alle bokser rektangelet berører. */
  const startMarquee = (x: number, y: number): Drag | null => {
    if (!layoutNow) return null;
    const L = layoutNow;
    let g: SVGGElement | null = null;
    let rect: SVGRectElement | null = null;
    let x1 = x;
    let y1 = y;
    const box = () => ({ x0: Math.min(x, x1), x1: Math.max(x, x1), y0: Math.min(y, y1), y1: Math.max(y, y1) });
    return {
      startY: y,
      startClient: 0,
      moved: false,
      move() {},
      moveXY(px, py) {
        x1 = px;
        y1 = py;
        if (!g) {
          g = ghostLayer();
          rect = shape(g, 'rect', { fill: ACCENT, 'fill-opacity': 0.08, stroke: ACCENT, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '4 3' });
        }
        const b = box();
        set(rect!, { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0 });
      },
      end() {
        g?.remove();
        const b = box();
        const hit = L.items.filter((it) => {
          const r = bounds(it);
          return r.x1 >= b.x0 && r.x0 <= b.x1 && r.y1 >= b.y0 && r.y0 <= b.y1;
        }).map((it) => it.id);
        const base = group.length ? group : selected ? [selected] : [];
        setGroup([...new Set([...base, ...hit])]);
      },
    };
  };

  // ---- Hendelser ----
  const itemOf = (e: Event) => (active ? ((e.target as Element | null)?.closest?.('g[data-id]') as SVGGElement | null) : null);
  /** Lanen hvis hendelsen er i lane-kolonnen (navnet), ellers ingenting. */
  const titleLaneOf = (e: MouseEvent): LaneLayout | null => {
    if (!active || !layoutNow || (e.target as Element | null)?.closest?.('.edit-handle')) return null;
    const p = toMm(e.clientX, e.clientY);
    if (p.x < layoutNow.laneTitleX || p.x >= layoutNow.plot.x0) return null;
    return laneAt(p.y) ?? null;
  };
  /** Boksen under markøren, funnet ut fra plasseringen og ikke bare elementet under markøren:
   *  callout-teksten til en boks kan ligge over naboen, grepene på valgt boks likeså, og et klikk
   *  like ved kanten skal også treffe. Først en boks markøren er inne i (den minste, når bokser
   *  ligger inne i en overskriftsboks), så teksten eller callouten du pekte på, og til sist den
   *  nærmeste innenfor slingringsmonnet, der valgt boks vinner. */
  const boxAt = (e: MouseEvent): string | null => {
    if (!active || !layoutNow) return null;
    const p = toMm(e.clientX, e.clientY);
    const boxes = layoutNow.items.filter((it): it is BoxItem => it.kind === 'box');
    let inside: BoxItem | null = null;
    for (const it of boxes)
      if (p.x >= it.x0 && p.x <= it.x1 && p.y >= it.y && p.y <= it.y + it.h && (!inside || (it.x1 - it.x0) * it.h < (inside.x1 - inside.x0) * inside.h)) inside = it;
    if (inside) return inside.id;
    const g = itemOf(e);
    if (g) return g.getAttribute('data-id');
    const slack = 8 / (svgNow?.getScreenCTM()?.a || 4);
    let best = Infinity;
    let hit: string | null = null;
    for (const it of boxes) {
      const d = Math.hypot(Math.max(it.x0 - p.x, 0, p.x - it.x1), Math.max(it.y - p.y, 0, p.y - (it.y + it.h)));
      if (d > slack) continue;
      const score = it.id === selected ? -1 : d * 1e6 + (it.x1 - it.x0) * it.h;
      if (score < best) [best, hit] = [score, it.id];
    }
    return hit;
  };
  sheet.addEventListener('click', (e) => {
    if (!active) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const g = itemOf(e);
    if (criticalMode) {
      const id = boxAt(e);
      const b = id ? findBox(host.getPlan()!, id) : null;
      if (b) setCritical([b.id], !b.critical);
      return;
    }
    const tradeG = (e.target as Element | null)?.closest?.('g[data-trade]');
    if (tradeG) return selectTrade(tradeG.getAttribute('data-trade')!);
    const legG = (e.target as Element | null)?.closest?.('g[data-legend]');
    if (legG) return selectTrade(legG.getAttribute('data-legend')!);
    if (!g && inHeader(e)) return selectHeader();
    const id = g ? boxAt(e) : null;
    if (id && (e.shiftKey || e.ctrlKey || e.metaKey)) return toggleInGroup(id);
    const ln = id ? null : titleLaneOf(e);
    if (ln) selectLane(ln.id);
    else if (!(e.shiftKey && !id)) select(id);
  });
  sheet.addEventListener('dblclick', (e) => {
    const g = itemOf(e);
    if (!g && inHeader(e)) {
      selectHeader();
      const ta = panel.querySelector<HTMLTextAreaElement>('#header-title');
      ta?.focus();
      ta?.select();
      return;
    }
    const ln = g ? null : titleLaneOf(e);
    if (ln) {
      selectLane(ln.id);
      const inp = panel.querySelector<HTMLTextAreaElement>('#lane-name');
      inp?.focus();
      inp?.select();
      return;
    }
    if (!g) return;
    select(g.getAttribute('data-id'));
    const ta = panel.querySelector<HTMLTextAreaElement>('#box-text');
    ta?.focus();
    ta?.select();
  });
  sheet.addEventListener('pointerdown', (e) => {
    if (!active || e.button !== 0 || !layoutNow || criticalMode) return;
    const t = e.target as Element;
    let d: Drag | null = null;
    if (t.closest('.box-handle')) {
      const it = layoutNow.items.find((i) => i.id === selected);
      if (it?.kind === 'box') d = startBoxResize(it);
    } else if (t.closest('.lane-edge')) {
      const ln = layoutNow.lanes.find((l) => l.id === t.closest('.lane-edge')!.getAttribute('data-lane'));
      if (ln) d = startLaneResize(ln);
    } else {
      const g = itemOf(e);
      const it = g && layoutNow.items.find((i) => i.id === g.getAttribute('data-id'));
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // Shift-klikk velger flere; Shift + dra på tom plass velger med rektangel.
        // Nettleseren skal ikke merke tekst i tegningen.
        e.preventDefault();
        if (!it && e.shiftKey && !titleLaneOf(e)) {
          const p = toMm(e.clientX, e.clientY);
          d = startMarquee(p.x, p.y);
        }
      } else if (it) d = startMove(it);
      else {
        const ln = titleLaneOf(e);
        if (ln) d = startLaneMove(ln);
      }
    }
    if (!d) return;
    e.preventDefault();
    d.startClient = e.clientY;
    d.startClientX = e.clientX;
    if (!d.moveXY) d.startY = toMm(e.clientX, e.clientY).y;
    drag = d;
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // Flytting starter først etter noen punkter, så et vanlig klikk bare velger
    if (!drag.moved && Math.abs(e.clientY - drag.startClient) < 4 && Math.abs(e.clientX - (drag.startClientX ?? e.clientX)) < 4) return;
    drag.moved = true;
    snapOff = e.altKey;
    const p = toMm(e.clientX, e.clientY);
    if (drag.moveXY) drag.moveXY(p.x, p.y);
    else drag.move(p.y - drag.startY);
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) {
      // Klikket som kommer rett etter at knappen slippes, skal ikke velge noe annet
      suppressClick = true;
      window.setTimeout(() => (suppressClick = false), 0);
      d.end();
    } else svgNow?.querySelector('g.edit-ghost')?.remove();
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // Høyreklikkmenyen følger det du høyreklikket: lane-navnet gir lanevalg, en boks gir
  // boksvalg, og tomt sted i lanen gir ny boks og skjulte bokser.
  const ctx = createCtxMenu();
  const plain = (s: string) => s.replace(/\/?\|/g, ' ').replace(/^\*/, '').trim();
  sheet.addEventListener('contextmenu', (e) => {
    if (!active || !layoutNow) return;
    const plan = host.getPlan();
    const p = toMm(e.clientX, e.clientY);
    const L = layoutNow;
    // Høyreklikk i forklaringen: skjul oppføringen eller endre den
    const legHit = (e.target as Element | null)?.closest?.('g[data-trade], g[data-legend]');
    if (plan && legHit) {
      e.preventDefault();
      const key = legHit.getAttribute('data-trade') ?? legHit.getAttribute('data-legend')!;
      const isTrade = key !== FERIE_KEY;
      // Valgte bokser (ikke milepæler) kan få faget herfra
      const ids = (group.length ? group : selected ? [selected] : []).filter((id) => {
        const x = findBox(plan, id);
        return x && !x.resolved?.isMilestone;
      });
      const n = ids.length;
      ctx.open(e.clientX, e.clientY, legendName(key), [
        ...(isTrade && n
          ? [{
              items: [{
                label: n === 1 ? 'Gi valgt boks dette faget' : `Gi ${n} valgte bokser dette faget`,
                icon: 'tag' as const,
                hint: 'Boksene får fargen til faget, med mindre de har egen farge.',
                disabled: ids.every((id) => boxTrade(findBox(plan, id)!) === key),
                onSelect: () => commit((pl) => setBoxTrade(pl, ids, key)),
              }],
            }]
          : []),
        {
          items: [
            { label: isTrade ? 'Endre tekst og farge' : 'Endre tekst', icon: 'pencil', kbd: 'Klikk', hint: 'Åpner oppføringen i panelet til høyre.', onSelect: () => selectTrade(key) },
            { label: 'Skjul i forklaringen', icon: 'hide', hint: 'Boksene beholder fargen. Vis den igjen fra panelet når ingenting er valgt.', onSelect: () => setLegendItem(key, { hidden: true }) },
          ],
        },
        {
          items: [
            {
              label: n ? 'Nytt fag til valgte' : 'Nytt fag',
              icon: 'plus',
              hint: n ? `Lager et nytt fag og gir det til ${n === 1 ? 'valgt boks' : `de ${n} valgte boksene`}. Navn og farge velger du i panelet.` : 'Lager et nytt fag. Navn og farge velger du i panelet, og bokser får faget fra boksens panel.',
              onSelect: () => createTrade(ids),
            },
          ],
        },
      ], 'Forklaring');
      return;
    }
    if (plan && inHeader(e)) {
      e.preventDefault();
      ctx.open(e.clientX, e.clientY, 'Topptekst', [
        { items: [{ label: 'Endre overskrift og tekst til høyre', icon: 'pencil', kbd: 'Dobbeltklikk', hint: 'Åpner toppteksten i panelet til høyre.', onSelect: () => selectHeader() }] },
      ]);
      return;
    }
    if (!plan || p.x < L.laneTitleX || p.x > L.plot.x1) return;
    const ln = laneAt(p.y);
    const lane = ln && findLane(plan, ln.id);
    if (!ln || !lane) return;
    e.preventDefault();
    const hitId = boxAt(e);
    const box = hitId ? findBox(plan, hitId) : null;
    const onTitle = p.x < L.plot.x0;
    if (onTitle) {
      const hiddenLanes = plan.lanes.filter((x) => x.shown && x.hidden);
      ctx.open(e.clientX, e.clientY, plain(lane.name), [
        ...(L.compact ? [] : [{
          heading: 'Høyde',
          items: [
            { label: 'Automatisk', radio: true, checked: !lane.height, hint: 'Så høy som innholdet krever, og fyller ledig plass.', onSelect: () => commit((pl) => delete findLane(pl, ln.id)!.height) },
            { label: 'Fast', radio: true, checked: !!lane.height, hint: 'Beholder høyden. Dra i nederste kant av lane-navnet for å endre den.', onSelect: () => commit((pl) => (findLane(pl, ln.id)!.height = lines(ln.y1 - ln.y0, L.unit))) },
          ],
        }]),
        {
          items: [
            { label: 'Endre navn og farge', icon: 'pencil', kbd: 'Dobbeltklikk', hint: 'Åpner lanen i panelet til høyre.', onSelect: () => selectLane(ln.id) },
            { label: 'Ny lane over', icon: 'laneAddAbove', hint: 'Lanen lages i appen og følger ikke Project.', onSelect: () => addLaneAbove(ln.id) },
            { label: 'Ny lane under', icon: 'laneAdd', hint: 'Lanen lages i appen og følger ikke Project.', onSelect: () => addLane(ln.id) },
          ],
        },
        {
          items: [
            lane.manual
              ? { label: 'Slett lane', icon: 'trash', danger: true, kbd: 'Delete', hint: 'Lanen er laget i appen og blir borte. Angre med Ctrl+Z.', disabled: L.lanes.length <= 1, onSelect: () => removeLaneById(ln.id) }
              : { label: 'Skjul lane', icon: 'hide', kbd: 'Delete', hint: 'Lanen skjules. Vis den igjen fra denne menyen.', disabled: L.lanes.length <= 1, onSelect: () => removeLaneById(ln.id) },
          ],
        },
        {
          heading: hiddenLanes.length ? 'Skjulte lanes' : undefined,
          items: hiddenLanes.map((hl) => ({ label: plain(hl.name), icon: 'show' as const, hint: 'Vis lanen igjen på samme plass.', onSelect: () => commit((pl) => delete findLane(pl, hl.id)!.hidden) })),
        },
      ], 'Lane');
    } else if (box) {
      const id = box.id;
      const ms = !!box.resolved?.isMilestone;
      const dates = box.resolved ? (ms ? fmtDate(box.resolved.start) : `${fmtDate(box.resolved.start)} – ${fmtDate(box.resolved.finish)}`) : '';
      ctx.open(e.clientX, e.clientY, plain(box.text) || (ms ? 'Milepæl' : 'Boks'), [
        {
          items: ms
            ? []
            : [
                { label: 'Overskriftsboks', icon: 'header', checked: !!box.header, hint: 'Teksten øverst, og andre bokser kan ligge inne i boksen.', onSelect: () => setHeader(id, !box.header) },
                { label: 'Multi Lane-boks', icon: 'span', checked: box.spanTo !== undefined, hint: 'Går ned over lanen under uten å gjøre lanene høyere. Velg hvor langt i panelet, eller dra i streken nederst.', onSelect: () => setSpan(id, box.spanTo === undefined) },
              ],
        },
        {
          items: [
            { label: 'Dupliser', icon: 'copy', kbd: 'Ctrl+D', hint: 'Lager en kopi rett under. Kopien følger ikke Project.', onSelect: () => { selected = id; copySelected(); } },
            { label: 'Kopier', icon: 'copy', kbd: 'Ctrl+C', hint: 'Lim inn i en annen lane med Ctrl+V eller høyreklikk der.', onSelect: () => { if (!group.includes(id)) { group = []; selected = id; } copyToClipboard(); } },
            ...(ms ? [] : [{ label: 'Standard høyde', icon: 'height' as const, hint: box.height ? 'Så høy som teksten krever.' : 'Boksen har allerede standard høyde.', disabled: !box.height, onSelect: () => commit((pl) => delete findBox(pl, id)!.height) }]),
            { label: 'Løsne', icon: 'pin', hint: !pinned(box) ? 'Boksen er ikke festet. Den festes når du drar den opp eller ned.' : 'Appen velger plassen i lanen igjen.', disabled: !pinned(box), onSelect: () => commit((pl) => unpinBox(findBox(pl, id)!)) },
          ],
        },
        {
          items: [
            box.manual
              ? { label: 'Slett', icon: 'trash', danger: true, kbd: 'Delete', hint: 'Boksen er laget i appen og blir borte. Angre med Ctrl+Z.', onSelect: () => { selected = id; removeSelected(); } }
              : { label: 'Skjul', icon: 'hide', kbd: 'Delete', hint: 'Vis den igjen ved å høyreklikke på et tomt sted i lanen.', onSelect: () => { selected = id; removeSelected(); } },
          ],
        },
      ], dates);
    } else {
      // Ny boks der du høyreklikket, en måned lang (to uker i ukesvisning)
      const start = L.dateAt(Math.max(p.x, L.plot.x0));
      const days = plan.plan.calendar.mode === 'week' ? 13 : 29;
      const finishT = new Date(`${start}T00:00:00Z`);
      finishT.setUTCDate(finishT.getUTCDate() + days);
      const finish = [finishT.toISOString().slice(0, 10), plan.plan.calendar.end].sort()[0];
      const hiddenBoxes = lane.boxes.filter((b) => b.hidden);
      ctx.open(e.clientX, e.clientY, plain(lane.name), [
        {
          items: [
            {
              label: `Ny boks fra ${fmtDate(start)}`,
              icon: 'plus',
              hint: 'Boksen lages i appen og følger ikke Project.',
              onSelect: () => {
                let made: Box | null = null;
                commit((pl) => {
                  made = newBox(pl, ln.id, start, finish);
                  if (made) made.top = lines(Math.max(0, p.y - ln.top), L.unit);
                });
                if (made) select((made as Box).id);
              },
            },
            ...(clipboard.length
              ? [{
                  label: clipboard.length === 1 ? 'Lim inn her' : `Lim inn ${clipboard.length} bokser her`,
                  icon: 'copy' as const,
                  kbd: 'Ctrl+V',
                  hint: 'Kopien har samme datoer og tekst, og følger ikke Project.',
                  onSelect: () => {
                    let made: Box[] = [];
                    commit((pl) => {
                      made = pasteBoxes(pl, clipboard, ln.id);
                      // Én boks havner der du høyreklikket
                      if (made.length === 1) made[0].top = lines(Math.max(0, p.y - ln.top), L.unit);
                    });
                    if (made.length === 1) select(made[0].id);
                  },
                }]
              : []),
          ],
        },
        {
          heading: hiddenBoxes.length ? 'Skjulte bokser' : undefined,
          items: hiddenBoxes.map((hb) => ({ label: plain(hb.text) || '(uten tekst)', icon: 'show' as const, hint: 'Vis boksen igjen på samme plass.', onSelect: () => commit((pl) => delete findBox(pl, hb.id)!.hidden) })),
        },
      ], 'Lane');
    }
  });

  toggle.addEventListener('click', () => {
    active = !active;
    if (!active) {
      endArrange();
      criticalMode = false;
      selected = null;
      selectedLane = null;
      selectedHeader = false;
      group = [];
    }
    buildPanel();
    overlay();
    syncTools();
  });
  criticalBtn?.addEventListener('click', () => setCriticalMode(!criticalMode));
  marksBtn?.addEventListener('click', () => {
    showMarks = !showMarks;
    marksBtn.setAttribute('aria-pressed', String(showMarks));
    overlay();
  });
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  resetAllBtn.addEventListener('click', () => {
    const plan = host.getPlan();
    if (!plan) return;
    snapshot();
    const ids = plan.lanes.flatMap((l) => l.boxes.map((b) => b.id));
    ids.forEach((id) => resetBoxInPlan(plan, id));
    plan.lanes.forEach((l) => resetLane(l));
    delete plan.plan.layout.tradeColors;
    delete plan.plan.layout.laneTitleScale;
    delete plan.plan.layout.legendItems;
    delete plan.plan.layout.headerRightScale;
    delete plan.plan.layout.legendScale;
    delete plan.plan.layout.logoScale;
    host.redraw();
    buildPanel();
    syncTools();
  });
  // ---- Omplasser ----
  const arrangeMenu = document.querySelector<HTMLElement>('#menu-arrange');
  const arrangeUnpin = document.querySelector<HTMLInputElement>('#arrange-unpin');

  /** Lanene omplasseringen gjelder, og hvilke bokser som kan løsnes (null = alle i lanene).
      titles: tekstknappene gjelder også lane-navnene (hele planen, eller når et lane-navn er valgt). */
  const arrangeScope = (plan: PlanFile): { laneIds: string[]; boxIds: Set<string> | null; text: string; whole?: boolean; titles?: boolean } => {
    const shownLanes = plan.lanes.filter((l) => l.shown && !l.hidden);
    if (group.length > 1) {
      const lanes = shownLanes.filter((l) => l.boxes.some((b) => group.includes(b.id)));
      return { laneIds: lanes.map((l) => l.id), boxIds: new Set(group), text: `Gjelder ${lanes.length === 1 ? 'lanen' : `de ${lanes.length} lanene`} med de ${group.length} valgte boksene. Bare de valgte løsnes.` };
    }
    const lane = selectedLane ? findLane(plan, selectedLane) : selected ? laneOf(plan, selected) : null;
    // Lane-navnene har én felles størrelse, så med et lane-navn valgt gjelder tekstknappene alle navnene
    if (lane && selectedLane)
      return { laneIds: [lane.id], boxIds: null, text: `Gjelder lanen «${lane.name.replace(/\|/g, ' ')}». Tekstknappene gjelder også navnene på alle lanes.`, titles: true };
    if (lane) return { laneIds: [lane.id], boxIds: null, text: `Gjelder lanen «${lane.name.replace(/\|/g, ' ')}».` };
    return { laneIds: shownLanes.map((l) => l.id), boxIds: null, text: 'Gjelder hele planen. Velg en lane eller bokser først for at det bare skal gjelde dem.', whole: true, titles: true };
  };

  function endArrange() {
    if (arrangeBar) arrangeBar.hidden = true;
    if (!arrangeMoved.size) return;
    arrangeMoved = new Set();
    overlay();
  }

  const showArrangeBar = (text: string, canUndo: boolean) => {
    if (!arrangeBar) return;
    arrangeBar.querySelector('.arrange-text')!.textContent = text;
    arrangeBar.querySelector<HTMLButtonElement>('#arrange-keep')!.textContent = canUndo ? 'Behold' : 'Lukk';
    arrangeBar.querySelector<HTMLButtonElement>('#arrange-undo')!.hidden = !canUndo;
    arrangeBar.hidden = false;
  };

  /** Plass i lanen, i tekstlinjer, så før og etter kan sammenlignes selv om teksten har endret størrelse. */
  const placeOf = (L: Layout) => {
    const out = new Map<string, { lane: string; y: number; side: string }>();
    for (const it of L.items) {
      const r = bounds(it);
      const ln = L.lanes.find((l) => r.y0 >= l.y0 - 1e-6 && r.y0 < l.y1 + 1e-6);
      // Callout eller milepælstekst på den andre siden regnes også som flyttet
      const side = it.kind === 'box' ? (it.callout ? (it.callout.box.x < it.x0 ? 'v' : 'h') : '') : it.labelBox.x < it.x ? 'v' : 'h';
      if (ln) out.set(it.id, { lane: ln.id, y: (r.y0 - ln.top) / L.unit, side });
    }
    return out;
  };
  // Litt slingringsmonn: teksten kan bli større etter omplassering og bryte annerledes
  const samePlace = (a: { lane: string; y: number; side: string } | undefined, b: { lane: string; y: number; side: string }) =>
    !!a && a.lane === b.lane && a.side === b.side && Math.abs(a.y - b.y) < 0.5;
  const contentLines = (L: Layout, ids: Set<string>) => L.lanes.filter((l) => ids.has(l.id)).reduce((s, l) => s + l.minH / L.unit, 0);

  const arrange = (mode: 'tight' | 'chrono') => {
    const plan = host.getPlan();
    const before = layoutNow;
    if (!plan || !before) return;
    endArrange();
    const { laneIds, boxIds } = arrangeScope(plan);
    const next = structuredClone(plan);
    const unpin = !!arrangeUnpin?.checked;
    // Overskriftsbokser flyttes med boksene som ligger inni dem
    const groups = new Map<string, { id: string; dy: number }[]>();
    if (unpin)
      for (const id of laneIds) {
        const l = findLane(next, id);
        for (const b of l?.boxes ?? []) {
          if (!b.header || (boxIds && !boxIds.has(b.id))) continue;
          const it = before.items.find((x) => x.id === b.id);
          if (!it) continue;
          const r = bounds(it);
          const kids = l!.boxes
            .filter((k) => k.id !== b.id)
            .map((k) => before.items.find((x) => x.id === k.id))
            .filter((o): o is Item => !!o)
            .filter((o) => inHeaderBox(it, o))
            .map((o) => ({ id: o.id, dy: lines(bounds(o).y0 - r.y0, before.unit) }));
          groups.set(b.id, kids);
        }
      }
    // En overskriftsboks inne i en annen følger den ytterste
    for (const kids of [...groups.values()]) for (const k of kids) groups.delete(k.id);
    const inGroup = new Set([...groups.keys(), ...[...groups.values()].flat().map((k) => k.id)]);
    for (const id of laneIds) {
      const l = findLane(next, id);
      if (!l) continue;
      delete l.order;
      if (unpin) for (const b of l.boxes) if (inGroup.has(b.id) || (!b.header && (!boxIds || boxIds.has(b.id)))) unpinBox(b);
    }
    if (mode === 'tight' || groups.size) {
      const res = host.arrange(next, laneIds, { mode, groups });
      for (const [id, order] of res.orders) {
        const l = findLane(next, id);
        if (l && order) l.order = order;
      }
      for (const [id, top] of res.pins) {
        const b = findBox(next, id);
        if (b) b.top = top;
      }
    }
    if (JSON.stringify(next) === JSON.stringify(plan)) {
      showArrangeBar(mode === 'tight' ? 'Fant ingen tettere plassering. Alt står som før.' : 'Boksene ligger allerede tidligst først.', false);
      return;
    }
    snapshot();
    typingSession = false;
    host.setPlan(next);
    host.redraw();
    const after = layoutNow!;
    const p0 = placeOf(before);
    const p1 = placeOf(after);
    const ids = new Set(laneIds);
    const laneOfItem = new Map(next.lanes.flatMap((l) => l.boxes.map((b) => [b.id, l.id] as const)));
    arrangeMoved = new Set([...p1].filter(([id, pos]) => ids.has(laneOfItem.get(id) ?? '') && !samePlace(p0.get(id), pos)).map(([id]) => id));
    const saved = contentLines(before, ids) - contentLines(after, ids);
    const n = arrangeMoved.size;
    const moved = n ? `${n} ${n === 1 ? 'boks' : 'bokser'} flyttet` : 'Ingen bokser flyttet';
    const lower = saved > 0.05 ? `, ${saved.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} ${saved < 1.05 && saved > 0.95 ? 'linje' : 'linjer'} lavere` : '';
    const grew = after.textSizePt > before.textSizePt + 1e-6 ? `. Teksten ble ${after.textSizePt.toLocaleString('nb-NO')} pt` : '';
    showArrangeBar(`${moved}${lower}${grew}.`, true);
    overlay();
    buildPanel();
    syncTools();
  };

  // ---- Størst mulig tekst ----
  const ptText = (v: number) => `${v.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} pt`;
  const fitText = (reset: boolean) => {
    const plan = host.getPlan();
    if (!plan || !layoutNow) return;
    endArrange();
    const s = arrangeScope(plan);
    const scope: FitTextScope = { laneIds: s.laneIds, boxIds: s.boxIds, laneTitles: !!s.titles };
    const res = reset ? null : host.fitText(plan, scope);
    const next = res ? res.plan : resetTextSizes(plan, scope);
    if (JSON.stringify(next) === JSON.stringify(plan)) {
      showArrangeBar(reset ? 'Teksten har allerede standard størrelse.' : 'Fant ikke plass til større tekst. Gjør boksene høyere eller bredere først.', false);
      return;
    }
    snapshot();
    typingSession = false;
    host.setPlan(next);
    host.redraw();
    if (res) {
      const n = res.grown;
      const boxes = n ? `${n} ${n === 1 ? 'boks' : 'bokser'} fikk større tekst, opptil ${ptText(res.maxPt)}` : 'Ingen bokser hadde plass til større tekst';
      const lanes = res.laneTitlePt && res.laneTitlePt > res.planPt + 1e-6 ? `. Lane-titlene er ${ptText(res.laneTitlePt)}` : '';
      showArrangeBar(`${boxes}${lanes}. Resten av planen har ${ptText(res.planPt)}.`, true);
    } else showArrangeBar('Teksten har standard størrelse igjen: boksene som planen, lane-navnene litt større.', true);
    buildPanel();
    syncTools();
  };
  document.querySelector('#fit-text')?.addEventListener('click', () => fitText(false));
  document.querySelector('#fit-text-reset')?.addEventListener('click', () => fitText(true));

  arrangeMenu?.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState !== 'open') return;
    const plan = host.getPlan();
    const scope = document.querySelector('#arrange-scope');
    if (plan && scope) scope.textContent = arrangeScope(plan).text;
  });
  document.querySelector('#arrange-tight')?.addEventListener('click', () => arrange('tight'));
  document.querySelector('#arrange-chrono')?.addEventListener('click', () => arrange('chrono'));
  arrangeBar?.querySelector('#arrange-keep')?.addEventListener('click', () => endArrange());
  arrangeBar?.querySelector('#arrange-undo')?.addEventListener('click', () => undo());

  document.addEventListener('keydown', (e) => {
    if (!active) return;
    const t = e.target as HTMLElement;
    const inField = t.matches?.('input, textarea, select');
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (inField) t.blur();
      else if (criticalMode) setCriticalMode(false);
      else select(null);
      return;
    }
    if (!inField && !mod && (e.key === 'Delete' || e.key === 'Backspace') && (selected || selectedLane || group.length)) {
      e.preventDefault();
      if (group.length) removeGroup();
      else if (selected) removeSelected();
      else if (selectedLane) removeLaneById(selectedLane);
      return;
    }
    if (inField || !mod) return;
    const k = e.key.toLowerCase();
    if (k === 'd' && selected) {
      e.preventDefault();
      copySelected();
      return;
    }
    // Kopier og lim inn, også mellom lanes og mellom planer som åpnes etter hverandre
    if (k === 'c' && (selected || group.length) && !window.getSelection()?.toString()) {
      if (copyToClipboard()) e.preventDefault();
      return;
    }
    if (k === 'v' && clipboard.length) {
      e.preventDefault();
      pasteFromClipboard();
      return;
    }
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });

  syncTools();
  return {
    afterDraw(svg, layout) {
      svgNow = svg;
      layoutNow = layout;
      if (selected && !layout.items.some((i) => i.id === selected)) {
        // Boksen tegnes ikke lenger (f.eks. skjult), men kan fortsatt redigeres i panelet
      }
      overlay();
    },
    reset() {
      endArrange();
      past = [];
      future = [];
      dirty = false;
      selected = null;
      selectedLane = null;
      selectedHeader = false;
      group = [];
      buildPanel();
      syncTools();
    },
    owns: (e) => !!itemOf(e) || (active && e instanceof MouseEvent && e.shiftKey) || (active && !!(e.target as Element | null)?.closest?.('g[data-trade], g[data-legend]')) || (active && !!(e.target as Element | null)?.closest?.('.edit-handle')) || (e instanceof MouseEvent && (!!titleLaneOf(e) || inHeader(e))),
    get active() {
      return active;
    },
    get dirty() {
      return dirty;
    },
    markSaved() {
      dirty = false;
    },
    focusBox(id) {
      if (!active) toggle.click();
      select(id);
    },
    replacePlan(p) {
      snapshot();
      host.setPlan(p);
      selected = null;
      selectedLane = null;
      selectedHeader = false;
      group = [];
      typingSession = false;
      host.redraw();
      buildPanel();
      syncTools();
    },
  };
}
