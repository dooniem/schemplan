// Redigering i tegningen: velg en boks, endre den i panelet, angre og gjør om.
// Endringene skrives rett inn i planen (som valgfrie felt på boksen), så de følger med i arbeidsfilen.
import { effectiveRange } from './layout/range';
import { withBreakMarks } from './breakmarks';
import { fieldColors, textColorRows } from './textcolorui';
import { remapRuns } from './format/textcolor';
import { autoTextColor } from './layout/color';
import { baseMilestoneRotation, milestoneRotation } from './layout/milestone';
import type { Box, Lane, PlanFile, Rotation, TextAlign } from './format/types';
import { MILESTONE_COLORS, type ArrangeOptions, type ArrangeResult, type BoxItem, type Item, type LaneLayout, type Layout } from './layout/layout';
import { paintCriticalOnly, shownItems } from './criticalonly';
import type { FitTextResult, FitTextScope } from './layout/fittext';
import { DEFAULT_TITLE_PT, defaultLaneTitleScale, FERIE_KEY, MAX_BOX_TEXT_SCALE, MAX_TEXT_SCALE, MIN_TEXT_SCALE } from './layout/layout';
import { PT_TO_MM } from './layout/text';
import { todayIso } from './layout/lookahead';
import { createCtxMenu, icon, type CtxGroup, type CtxItem, type IconName } from './ctxmenu';
import type { PlanImage } from './format/types';
import { type AreaEdge, createAreaEdit } from './areaedit';
import { createLaneWidthEdit } from './lanewidthui';
import { createArrangeUi } from './arrangeui';
import { createPushHint, pieceHeight, pieceRect, pinAt, pinOffset, pushDown, settle } from './pushmove';
import { applyFollows, canFollow, followersOf, setFollow, type Edge } from './links';
import { mergedInto, mergeLanes, mergeTargets, splitLane } from './lanemerge';
import { contentWords, createLanePick, laneName } from './lanepick';
import { canTakeHeight, createHeightCopy, resultWords, sameHeight } from './heightcopy';
import { createImageEdit } from './imageedit';
import { createTradeUi } from './tradeui';
import { createCriticalUi } from './criticalui';
import { transparencyRow, type TransparencyKit } from './transparencyui';
import { tintStrengthRow, type TintStrengthKit } from './lanetintui';
import { hatchSection, type HatchKit } from './hatchui';
import { canBeTransparent } from './layout/transparency';
import { alignOf } from './layout/textalign';
import { allFront, FRONT_HINT, frontMenuItem, setFront } from './frontui';
import { inLine, styleOf } from './criticallines';
import { datesMenuItem, datesRows } from './boxdatesui';
import { setBoxDates } from './layout/boxdates';
import { foldSection, type Fold } from './panelfold';
import { calloutFold, formFold, lineFold, placeFold } from './panelsummary';

/** Hvordan høyde og plass endres med musen. */
const PLACE_HINT = 'Dra boksen opp eller ned for å gi den fast plass, og dra i den blå streken nederst for å endre høyden. Kantene snapper til andre bokser; hold Alt for å dra fritt. Hold Ctrl mens du drar for å skyve boksene under ned.';
import { customMarkSection, markScaleRow, marksMenuItems, marksSection, pickMarkImage, removeCustomMark, setMarks, type CustomActions } from './marksui';
import { MARK_KEYS, MARK_NAMES, markName, markOfKey, type MarkKind } from './layout/marks';
import { dissolveLaneGroup, findGroup, groupLanes, groupOfLane, groupTargets, growLaneGroup, removeFromLaneGroup, settleLaneGroups } from './lanegroup';
import { buildLaneGroupPanel, laneGroupItems, laneGroupMenu, type GroupKit } from './lanegroupui';
import { imageFiles } from './imagefile';
import { addDaysIso, bounds, BOX_PALETTE, copyBox, daysBetween, findBox, findLane, inHeaderBox, isEdited, isLaneEdited, keepLaneOriginal, keepOriginal, LANE_PALETTE, laneOf, lines, moveBox, moveLane, newBox, newLane, newMilestone, pasteBoxes, pinned, removeBox, removeLane, resetBoxInPlan, resetLane, snapshotOf, type Swatch, unpinBox } from './editmodel';
import { plainText } from './format/text';
import { formatLong } from './layout/dates';
import { addTrade, boxTrade, currentFill, isAppTrade, NO_TRADE, projectFill, setBoxTrade, setProjectColor, tradeColors } from './trades';

/** En dragning i tegningen, fra knappen trykkes ned til den slippes. */
export interface Drag {
  startY: number;
  startClient: number;
  moved: boolean;
  /** dx er bare med for dra som kan gå sidelengs (egne bokser). */
  move(dy: number, dx: number): void;
  startX?: number;
  /** Dra som også følger musen sidelengs (rektangelvalg). Får punktet i mm. */
  moveXY?(x: number, y: number): void;
  startClientX?: number;
  end(): void;
  /** Tegner dragningen på nytt der den står, f.eks. når Ctrl trykkes eller slippes. */
  again?(): void;
}
/** Fargeprøving: se editor.trial. */
export type Trial = { key: string; run: (fn: () => void, live?: boolean) => void; pick: (fill: string, live?: boolean) => void };
/** Knapp tilbake til fargen noe ellers ville hatt. */
export type Back = { text: string; disabled: boolean; onClick: () => void; title?: string };

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
  /** Planen slik den tegnes nå, for en annen versjon av planen. */
  layoutOf(p: PlanFile): Layout;
  /** Overskriftens størrelse i punkter (et valg i appen, som i Innstillinger). */
  setTitleSize(pt: number): void;
  /** Valgene i Innstillinger som ikke ligger i planen, så de kan angres sammen med den. */
  getSettings(): unknown;
  /** Viser en feilmelding i appen (ikke i nettleserens varselboks). */
  notify(message: string): void;
  setSettings(s: unknown): void;
  /** Lagrer en PDF for deling med bare boksene i `keep` (filteret for kritisk linje). */
  saveCriticalPdf(keep: Set<string>, btn: HTMLButtonElement): void;
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
  /**
   * Tar vare på planen og innstillingene før en endring utenfor redigeringen, så den kan angres.
   * Samme nøkkel flere ganger på rad (skriving i ett felt) blir ett angre-steg.
   */
  record(key?: string): void;
  /** Boksene som vises med «Vis bare kritiske aktiviteter», eller null når filteret er av. */
  criticalView(): Set<string> | null;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};


export function createEditor(host: EditorHost, sheet: HTMLElement, panel: HTMLElement, toggle: HTMLButtonElement, tools: HTMLElement): Editor {
  let active = false;
  let selected: string | null = null;
  /** Valgt lane (klikk i lane-kolonnen). Bare én av boks og lane er valgt om gangen. */
  let selectedLane: string | null = null;
  /** Toppfeltet med overskrift og tekst til høyre er valgt. */
  let selectedHeader = false;
  /** Valgt gruppe av lanes (klikk på baren). */
  let selectedLaneGroup: string | null = null;
  /** Flere valgte bokser (Shift-klikk eller rektangel). Når den har to eller flere, er `selected` null. */
  let group: string[] = [];
  /** Valgt fag (klikk i legenden). */
  let selectedTrade: string | null = null;
  /** Nytt fag: navnefeltet i panelet får fokus én gang. */
  let focusTradeName = false;
  /** Angre-historikken: planen og innstillingene slik de var før hver endring. */
  type Step = { plan: PlanFile; settings: unknown };
  let past: Step[] = [];
  let future: Step[] = [];
  /** Feltet i Innstillinger som sist ble endret, så skriving der blir ett angre-steg. */
  let recordKey: string | null = null;
  let dirty = false;
  /** Skriving i tekstfeltet samles til ett angre-steg per økt i feltet. */
  let typingSession = false;
  /** Piltastene: trykk etter hverandre på det samme blir ett angre-steg, som skriving. */
  let nudge: { key: string; step: number } | null = null;
  /** Teller angrestegene, så vi vet om noe annet er gjort siden fargeprøvingen startet. */
  let stepCount = 0;
  /**
   * Fargeprøving: fargene du prøver for samme boks, lane eller fag blir ett angresteg til du
   * beholder dem eller gjør noe annet. Avbryt går tilbake til fargen før du begynte.
   */
  let colorTrial: { key: string; step: number; from: string } | null = null;
  /** Neste endring legges i samme angresteg som fargeprøvingen. */
  let mergeStep = false;
  /** Panelet bygges ikke på nytt mens fargevelgeren er åpen, ellers lukkes den. */
  let holdPanel = false;
  let svgNow: SVGSVGElement | null = null;
  let layoutNow: Layout | null = null;
  /** Kalenderens omfang slik det tegnes, med start og slutt valgt i appen. */
  const calRange = (plan: PlanFile) => effectiveRange(plan, layoutNow?.calendarMode ?? plan.plan.calendar.mode);
  let redrawTimer = 0;
  /** Omplasser og «Størst mulig tekst», med linjen der endringen beholdes eller angres. */
  const arrangeUi = createArrangeUi({
    getPlan: () => host.getPlan(),
    setPlan: (p) => host.setPlan(p),
    redraw: () => host.redraw(),
    layout: () => layoutNow,
    selection: () => ({ group, selected, selectedLane }),
    arrange: (p, laneIds, how) => host.arrange(p, laneIds, how),
    fitText: (p, scope) => host.fitText(p, scope),
    beginStep: () => {
      snapshot();
      typingSession = false;
    },
    undo: () => undo(),
    overlay: () => overlay(),
    refresh: () => {
      buildPanel();
      syncTools();
    },
  });
  const endArrange = () => arrangeUi.end();
  const showArrangeBar = (text: string, canUndo: boolean) => arrangeUi.show(text, canUndo);

  const undoBtn = tools.querySelector<HTMLButtonElement>('#undo')!;
  const redoBtn = tools.querySelector<HTMLButtonElement>('#redo')!;
  const resetAllBtn = tools.querySelector<HTMLButtonElement>('#reset-all')!;
  const marksBtn = tools.querySelector<HTMLButtonElement>('#show-marks');
  /** Blå prikk på bokser brukeren har endret. Kan skjules for å se planen slik den blir. */
  let showMarks = true;
  const criticalBtn = tools.querySelector<HTMLButtonElement>('#critical-mode');
  /** Velg boksen en egen boks skal følge: neste klikk på en boks lager koblingen. */
  let followPick: { id: string; edge: Edge } | null = null;
  const followBar = document.querySelector<HTMLElement>('#follow-bar');
  /** «Slå sammen med …»: neste klikk på en lane slår den valgte lanen sammen med den. */
  const laneMergeBar = document.querySelector<HTMLElement>('#lanemerge-bar');
  const lanePick = laneMergeBar && createLanePick({
    bar: laneMergeBar,
    accent: ACCENT,
    getPlan: () => host.getPlan(),
    onMerge: (from, to) => mergeLaneInto(from, to),
    onGroup: (from, to) => groupWith(from, to),
    onChange: () => {
      overlay();
      syncTools();
    },
  });

  /** «Gi andre bokser samme høyde»: neste klikk på en boks gir den høyden. */
  const heightBar = document.querySelector<HTMLElement>('#heightcopy-bar');
  const heightCopy = heightBar && createHeightCopy({
    bar: heightBar,
    accent: ACCENT,
    getPlan: () => host.getPlan(),
    layout: () => layoutNow,
    commit: (fn, key) => commit(fn, key),
    onChange: () => {
      overlay();
      syncTools();
    },
  });

  const syncTools = () => {
    toggle.setAttribute('aria-pressed', String(active));
    const label = toggle.querySelector('#edit-label');
    if (label) label.textContent = active ? 'Ferdig' : 'Rediger';
    toggle.title = active ? 'Avslutt redigering' : 'Velg bokser og endre tekst, farge, callout og rotasjon';
    tools.hidden = !active;
    undoBtn.disabled = !past.length;
    redoBtn.disabled = !future.length;
    const plan = host.getPlan();
    resetAllBtn.disabled = !plan || (!plan.plan.layout.tradeColors && !plan.plan.layout.innerEdge && !plan.plan.layout.laneTitleScale && !plan.plan.layout.laneTitleWidth && !plan.plan.layout.legendItems && !plan.plan.layout.headerRightScale && !plan.plan.layout.legendScale && !plan.plan.layout.logoScale && !plan.plan.layout.markScale && !plan.lanes.some((l) => (isLaneEdited(l) && !l.manual) || l.boxes.some(isEdited)));
    sheet.classList.toggle('editing', active);
    criticalBtn?.setAttribute('aria-pressed', String(critical.mode));
    sheet.classList.toggle('critical-mode', active && critical.mode);
    sheet.classList.toggle('follow-mode', active && (!!followPick || !!lanePick?.from || !!heightCopy?.from));
  };

  /** Tar vare på planen før en endring, så den kan angres. */
  const snapshot = () => {
    const plan = host.getPlan();
    if (!plan || mergeStep) return;
    // En ny endring godtar omplasseringen
    endArrange();
    colorTrial = null;
    stepCount++;
    past.push({ plan: snapshotOf(plan), settings: host.getSettings() });
    if (past.length > MAX_HISTORY) past.shift();
    future = [];
    recordKey = null;
    dirty = true;
    // Datoen nederst på planen blir dagen den sist ble endret
    plan.plan.layout.editedAt = todayIso();
  };

  /** Ett angresteg per endring, men skriving i samme felt samles i ett steg. */
  const stepFor = (typing?: boolean) => {
    if (!typing || !typingSession) snapshot();
    if (typing) typingSession = true;
  };
  /** Tegner planen på nytt: straks, eller litt etter siste tastetrykk mens det skrives. */
  const redrawFor = (typing?: boolean) => {
    window.clearTimeout(redrawTimer);
    if (typing) redrawTimer = window.setTimeout(() => host.redraw(), 120);
    else host.redraw();
  };

  const change = (fn: (b: Box) => void, opts: { typing?: boolean; rebuild?: boolean } = {}) => {
    const plan = host.getPlan();
    const b = plan && selected ? findBox(plan, selected) : null;
    if (!b) return;
    stepFor(opts.typing);
    fn(b);
    applyFollows(plan!);
    // Under skriving tegnes planen litt etterpå, så store planer ikke henger etter tastetrykkene
    redrawFor(opts.typing);
    if (opts.rebuild !== false) buildPanel();
    syncTools();
  };

  const changeLane = (fn: (l: Lane) => void, opts: { typing?: boolean; rebuild?: boolean } = {}) => {
    const plan = host.getPlan();
    const l = plan && selectedLane ? findLane(plan, selectedLane) : null;
    if (!l) return;
    stepFor(opts.typing);
    fn(l);
    redrawFor(opts.typing);
    if (opts.rebuild !== false) buildPanel();
    syncTools();
  };

  /** Endring som ikke gjelder bare valgt boks (dra, lanehøyde). */
  const commit = (fn: (plan: PlanFile) => void, nudgeKey?: string) => {
    const plan = host.getPlan();
    if (!plan) return;
    // Samme piltast-økt så lenge ingenting annet er endret imellom
    if (!nudgeKey || nudge?.key !== nudgeKey || nudge.step !== stepCount) {
      snapshot();
      nudge = nudgeKey ? { key: nudgeKey, step: stepCount } : null;
    }
    typingSession = false;
    fn(plan);
    applyFollows(plan);
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
    commit((pl) => {
      made = newLane(pl, afterId);
      settleLaneGroups(pl, made.id);
    });
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
  /** Starter «Slå sammen med …» for lanen. */
  const startLaneMerge = (id: string) => {
    endFollowPick();
    if (critical.mode) setCriticalMode(false);
    lanePick?.start(id);
  };
  /** Slår sammen lanene som ett angresteg, og merker boksene som ble flyttet til de godtas eller angres. */
  const mergeLaneInto = (from: string, to: string) => {
    const plan = host.getPlan();
    const fromLane = plan && findLane(plan, from);
    const toLane = plan && findLane(plan, to);
    if (!plan || !fromLane || !toLane) return;
    const words = contentWords(plan, from);
    // Festede bokser havner under det som står i lanen fra før
    const L = layoutNow;
    const ln = L?.lanes.find((x) => x.id === to);
    const ids = new Set(toLane.boxes.map((b) => b.id));
    const bottom = ln && L ? Math.max(ln.top, ...L.items.filter((it) => ids.has(it.id)).map((it) => bounds(it).y1)) : 0;
    const offset = ln && L ? Math.max(0, lines(bottom - ln.top, L.unit)) : 0;
    let moved: string[] = [];
    selected = null;
    group = [];
    selectedLane = to;
    commit((pl) => (moved = (mergeLanes(pl, from, to, offset) ?? []).map((b) => b.id)));
    arrangeUi.mark(moved);
    showArrangeBar(`${laneName(fromLane.name)} er slått sammen med ${laneName(toLane.name)}. ${words.charAt(0).toUpperCase() + words.slice(1)} flyttet.`, true);
    overlay();
  };
  /** Skiller ut igjen en lane som er slått sammen med en annen, som ett angresteg. */
  const splitLaneOut = (id: string) => {
    const plan = host.getPlan();
    const lane = plan && findLane(plan, id);
    const home = plan && lane?.mergedInto ? findLane(plan, lane.mergedInto) : null;
    if (!plan || !lane || !home) return;
    endArrange();
    let moved: string[] = [];
    selected = null;
    group = [];
    selectedLane = id;
    commit((pl) => (moved = (splitLane(pl, id) ?? []).map((b) => b.id)));
    arrangeUi.mark(moved);
    const n = moved.length;
    showArrangeBar(`${laneName(lane.name)} er skilt ut fra ${laneName(home.name)} igjen. ${n ? `${n} ${n === 1 ? 'boks' : 'bokser'} flyttet tilbake` : 'Ingen bokser flyttet'}.`, true);
    overlay();
  };
  /** Hjelpetekst for «Skill ut igjen». */
  const SPLIT_HINT = 'Lanen vises igjen der den sto, og boksene fra Project som kom derfra, flyttes tilbake.';
  // ---- Grupper av lanes ----
  /** Starter «Grupper med …» for lanen. */
  const startLaneGroup = (id: string) => {
    endFollowPick();
    if (critical.mode) setCriticalMode(false);
    lanePick?.start(id, 'group');
  };
  const groupWith = (from: string, to: string) => {
    let made: string | null = null;
    commit((pl) => (made = groupLanes(pl, from, to)?.id ?? null));
    if (made) selectLaneGroup(made);
  };
  const changeLaneGroup = (id: string, fn: (g: import('./format/types').LaneGroup) => void, opts: { typing?: boolean; rebuild?: boolean } = {}) => {
    const plan = host.getPlan();
    const g = plan && findGroup(plan, id);
    if (!g) return;
    stepFor(opts.typing);
    fn(g);
    redrawFor(opts.typing);
    if (opts.rebuild !== false) buildPanel();
    syncTools();
  };
  const dissolveGroup = (id: string) => {
    if (selectedLaneGroup === id) selectedLaneGroup = null;
    commit((pl) => dissolveLaneGroup(pl, id));
    overlay();
  };
  const groupKit = (): GroupKit => ({
    el,
    panel,
    panelHead: (t, sub) => panelHead(t, sub),
    section,
    textField,
    btn,
    switchRow,
    lockedRow,
    barWidth: (id) => {
      const gb = layoutNow?.laneGroups.find((x) => x.id === id);
      return gb ? { w: gb.x1 - gb.x0, auto: gb.autoW } : null;
    },
    swatches,
    colorRow: (v, t) => colorRow(v, t),
    trial,
    change: changeLaneGroup,
    commit,
    grow: (id, dir) => commit((pl) => growLaneGroup(pl, id, dir)),
    dissolve: dissolveGroup,
    ungroupLane: (laneId) => commit((pl) => removeFromLaneGroup(pl, laneId)),
    pick: startLaneGroup,
    selectGroup: (id) => selectLaneGroup(id),
    selectLane: (id) => selectLane(id),
  });

  /** Flytter lanen ett hakk opp eller ned blant lanene som vises. */
  const stepLane = (id: string, dir: -1 | 1) =>
    commit((pl) => {
      const vis = pl.lanes.filter((l) => l.shown && !l.hidden);
      const i = vis.findIndex((l) => l.id === id);
      const other = vis[i + dir];
      if (i < 0 || !other) return;
      const j = pl.lanes.indexOf(other);
      moveLane(pl, id, j);
      settleLaneGroups(pl, id);
    });

  /** Bokser kopiert med Ctrl+C. Ligger bare i minnet så lenge siden er åpen. */
  let clipboard: { box: Box; lane: string; symbol?: PlanImage; followText?: string }[] = [];
  /** Bildet som er symbol for milepælen, så kopien får det samme. */
  const symbolOf = (plan: PlanFile, id: string) => {
    const im = (plan.plan.layout.images ?? []).find((x) => x.milestone?.id === id);
    return im ? structuredClone(im) : undefined;
  };
  /** Gir kopierte milepæler det samme symbolet som milepælen de er kopiert fra. */
  const addSymbols = (pl: PlanFile, pairs: [PlanImage | undefined, Box][]) => {
    for (const [src, b] of pairs) {
      if (!src?.milestone) continue;
      (pl.plan.layout.images ??= []).push({ ...structuredClone(src), id: imageId(), milestone: { ...src.milestone, id: b.id } });
    }
  };
  const copyToClipboard = () => {
    const plan = host.getPlan();
    if (!plan) return false;
    const ids = group.length ? group : selected ? [selected] : [];
    clipboard = ids.flatMap((id) => {
      const b = findBox(plan, id);
      const l = laneOf(plan, id);
      // Teksten til boksen den følger, så koblingen ikke treffer en annen boks med samme id i en annen plan
      const followText = b?.follows ? findBox(plan, b.follows.box)?.text : undefined;
      return b && l ? [{ box: structuredClone(b), lane: l.id, symbol: symbolOf(plan, id), followText }] : [];
    });
    return clipboard.length > 0;
  };
  const pasteFromClipboard = () => {
    const plan = host.getPlan();
    if (!plan || !clipboard.length) return;
    // Valgt lane, eller lanen til valgt boks. Ellers lanen boksene ble kopiert fra.
    const target = selectedLane ?? (selected ? laneOf(plan, selected)?.id ?? null : null);
    let made: Box[] = [];
    commit((pl) => {
      made = pasteBoxes(pl, clipboard, target);
      addSymbols(pl, made.map((b, i) => [clipboard[i].symbol, b]));
    });
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
    commit((pl) => {
      const sym = symbolOf(pl, id);
      made = copyBox(pl, id);
      if (made) addSymbols(pl, [[sym, made]]);
    });
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

  const restore = (from: Step[], to: Step[]) => {
    const plan = host.getPlan();
    const step = from.pop();
    if (!plan || !step) return;
    endArrange();
    heightCopy?.end();
    to.push({ plan: snapshotOf(plan), settings: host.getSettings() });
    const prev = step.plan;
    host.setPlan(prev);
    host.setSettings(step.settings);
    dirty = true;
    typingSession = false;
    recordKey = null;
    nudge = null;
    colorTrial = null;
    if (selected && !findBox(prev, selected)) selected = null;
    if (selectedLane && !findLane(prev, selectedLane)) selectedLane = null;
    if (selectedLaneGroup && !findGroup(prev, selectedLaneGroup)) selectedLaneGroup = null;
    group = group.filter((id) => findBox(prev, id));
    if (images.selected && !findImage(prev, images.selected)) clearImage();
    host.redraw();
    buildPanel();
    syncTools();
  };
  const undo = () => restore(past, future);
  const redo = () => restore(future, past);

  /** Fargeprøvingen gjelder fortsatt: ingenting annet er endret siden den startet. */
  const trialOn = (key?: string) => !!colorTrial && colorTrial.step === stepCount && (key === undefined || colorTrial.key === key);
  /** Går tilbake til fargen før prøvingen, uten å legge prøvingen i «Gjør om». */
  const cancelTrial = () => {
    if (!trialOn()) return;
    colorTrial = null;
    undo();
    future.pop();
    syncTools();
  };
  const keepTrial = () => {
    colorTrial = null;
    buildPanel();
  };
  /**
   * Fargevalg for én ting (key). Alle farger som prøves etter hverandre blir ett angresteg.
   * live: fargevelgeren er fortsatt åpen, så bare planen tegnes på nytt.
   */
  const trial = (key: string, now: string, set: (fill: string) => void): Trial => {
    const run = (fn: () => void, live = false) => {
      const same = trialOn(key);
      const before = stepCount;
      mergeStep = same;
      holdPanel = live;
      try {
        fn();
      } finally {
        mergeStep = false;
        holdPanel = false;
      }
      if (!same && stepCount !== before) colorTrial = { key, step: stepCount, from: now };
      if (!live) buildPanel();
    };
    return { key, run, pick: (fill, live) => run(() => set(fill), live) };
  };

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
  /** Del av panelet med egen overskrift. Med fold kan delen foldes sammen til én linje med oppsummering. */
  const section = (title: string, fold?: Fold) => {
    if (fold) {
      const { root, body } = foldSection(title, fold);
      panel.append(root);
      return body;
    }
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
  const swatches = (current: string | null, list: Swatch[], t: Trial | ((fill: string) => void)) => {
    const sw = el('div', { class: 'swatches' });
    const seen = new Set<string>();
    for (const [fill, name, num] of list) {
      const key = fill.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const label = num === undefined ? name : `${num} ${name}`;
      const s = el('button', { type: 'button', class: 'swatch', title: label, 'aria-label': label, 'aria-pressed': String(current === key) });
      s.style.background = fill;
      s.dataset.color = key;
      if (num !== undefined) {
        // Samme nummer som fargen har i fargevalget i Project
        s.textContent = String(num);
        s.style.color = autoTextColor(key);
      }
      s.addEventListener('click', () => (typeof t === 'function' ? t(key) : t.pick(key)));
      sw.append(s);
    }
    return sw;
  };
  /** Egen farge, og eventuelt en knapp tilbake til fargen den ellers ville hatt. */
  const colorRow = (value: string, t: Trial, back?: Back | Back[]) => {
    const out = document.createDocumentFragment();
    const row = el('div', { class: 'row color-row' });
    const lab = el('label', { class: 'custom-color' });
    const inp = el('input', { type: 'color' }) as HTMLInputElement;
    inp.value = value.toLowerCase();
    // Fargen vises i planen mens du drar i fargevelgeren, høyst én gang per skjermbilde
    let raf = 0;
    inp.addEventListener('input', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        t.pick(inp.value.toUpperCase(), true);
      });
    });
    inp.addEventListener('change', () => {
      cancelAnimationFrame(raf);
      raf = 0;
      t.pick(inp.value.toUpperCase());
    });
    lab.append(inp, 'Egen farge');
    row.append(lab);
    for (const x of back ? [back].flat() : []) {
      const b = btn(x.text, null, () => t.run(x.onClick), x.title, 'button small');
      b.disabled = x.disabled;
      row.append(b);
    }
    out.append(row);
    if (trialOn(t.key)) {
      const bar = el('div', { class: 'row color-trial', role: 'group', 'aria-label': 'Prøver farger' });
      const from = colorTrial!.from;
      const undoB = btn('Avbryt', null, cancelTrial, 'Tilbake til fargen før du begynte å prøve (Esc)', 'button small');
      if (from) {
        const chip = el('span', { class: 'trial-chip', 'aria-hidden': 'true' });
        chip.style.background = from;
        undoB.prepend(chip);
      }
      bar.append(
        el('span', { class: 'trial-text' }, 'Prøver farger'),
        undoB,
        btn('Behold', null, keepTrial, 'Behold fargen (Enter)', 'button small primary'),
      );
      out.append(bar);
    }
    return out;
  };
  /** Linje som sier at noe er låst, med knapp for å løse det opp. Vises bare når det gjelder. */
  const lockedRow = (text: string, button: string, title: string, onClick: () => void) => {
    const r = el('div', { class: 'row locked-row' });
    r.append(el('span', {}, text), btn(button, null, onClick, title, 'button small'));
    return r;
  };
  /**
   * Tekststørrelse for boksen, i halve punkter. Lagres i forhold til planens tekst, så boksen
   * følger med når planen krymper eller vokser. Aldri under halvparten eller over det tredobbelte.
   */
  const textSizeRow = (b: Box, planPt: number) =>
    sizeStepper(b.textScale, planPt, (s) =>
      change((x) => {
        if (s === undefined) delete x.textScale;
        else x.textScale = s;
      }),
      { max: MAX_BOX_TEXT_SCALE },
    );
  /** − / + i halve punkter. set får forholdet til planens tekst, eller undefined for standardstørrelsen. */
  /** def: standardstørrelsen i forhold til planens tekst. Velges den, lagres ingen egen størrelse. */
  const sizeStepper = (
    scaleNow: number | undefined,
    planPt: number,
    set: (s: number | undefined) => void,
    o: { note?: string; def?: number; resetLabel?: string; resetTitle?: string; std?: string; unit?: string; step?: number; what?: string; max?: number } = {},
  ) => {
    const { note = 'Egen størrelse', def = 1, resetLabel = 'Som planen', resetTitle = 'Samme tekststørrelse som resten av planen', unit = 'pt', step = 0.5, what = 'tekst', max = MAX_TEXT_SCALE } = o;
    const cur = planPt * (scaleNow ?? def);
    const lo = planPt * MIN_TEXT_SCALE;
    const hi = planPt * max;
    const fmt = (v: number) => v.toLocaleString('nb-NO', { maximumFractionDigits: 2 });
    const setPt = (pt: number) => {
      const s = Math.min(max, Math.max(MIN_TEXT_SCALE, pt / planPt));
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
    // Planens størrelse er også et stopp, så teksten kan gjøres like stor som i resten av planen.
    // Forholdet lagres med fire desimaler, så 25 pt kan bli 25,001; slingringsmonnet må tåle det.
    const downTo = Math.max(lo, Math.ceil(cur / step - 0.02) * step - step);
    const upTo = Math.min(hi, Math.floor(cur / step + 0.02) * step + step);
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
  /**
   * Tekstfelt. Ett angre-steg per skriveøkt.
   * breaks: Enter og | gir linjeskift, og de tvungne linjeskiftene vises med merker i feltet.
   */
  const textField = (id: string, label: string, value: string, rows: string, onInput: (v: string) => void, breaks = false, colorsOf?: () => (string | undefined)[]): HTMLElement => {
    const ta = el('textarea', { id, rows, spellcheck: 'true', 'aria-label': label }) as HTMLTextAreaElement;
    ta.value = value;
    ta.addEventListener('focus', () => (typingSession = false));
    ta.addEventListener('input', () => onInput(ta.value));
    ta.addEventListener('blur', () => {
      typingSession = false;
      syncTools();
    });
    return breaks ? withBreakMarks(ta, colorsOf) : ta;
  };
  const textColorKey = (c?: string) => (c === '#000000' ? 'black' : c === '#FFFFFF' ? 'white' : 'auto');
  const TEXT_COLORS: ['auto' | 'black' | 'white', string][] = [['auto', 'Auto'], ['black', 'Svart'], ['white', 'Hvit']];
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
    stepFor(typing);
    fn(plan.plan.layout);
    redrawFor(typing);
    if (!typing) {
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
          snapshot();
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
        }, true), true,
      ),
    );
    s2.append(el('p', { class: 'hint' }, 'Høyrejustert øverst til høyre, for eksempel prosjektnummer eller revisjon. Enter eller | gir linjeskift.'));
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
        }, { typing: true, rebuild: false }), true,
      ),
      el('p', { class: 'hint' }, 'Enter eller | gir linjeskift.'),
      segmented('Tekstfarge', l.whiteText ? 'white' : 'black', [['black', 'Svart'], ['white', 'Hvit']], (v) =>
        changeLane((x) => {
          if (v === 'white') x.whiteText = true;
          else delete x.whiteText;
        }),
      ),
    );
    // Lane-titlene har én felles størrelse, så korte navn ikke blir større enn lange
    if (layoutNow) {
      const planPtNow = layoutNow.textSizePt;
      sn.append(
        ...sizeStepper(plan.plan.layout.laneTitleScale, layoutNow.textSizePt, (s) =>
          commit((pl) => {
            if (s === undefined) {
              delete pl.plan.layout.laneTitleScale;
              return;
            }
            // Størrelsen lagres i forhold til planens tekst. Når navnene blir mindre, kan planens tekst
            // vokse (og omvendt), så forholdet justeres til navnene får størrelsen som ble valgt.
            const target = s * planPtNow;
            let pt = planPtNow;
            for (let i = 0; i < 6; i++) {
              pl.plan.layout.laneTitleScale = Math.round(Math.min(MAX_BOX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, target / pt)) * 10000) / 10000;
              const next = host.layoutOf(pl).textSizePt;
              if (Math.abs(next - pt) < 1e-6) break;
              pt = next;
            }
          }), {
          note: 'Egen størrelse for alle lanes',
          def: defaultLaneTitleScale(layoutNow.textSizePt),
          resetLabel: 'Standard',
          resetTitle: 'Litt større enn teksten i boksene',
          max: MAX_BOX_TEXT_SCALE,
        }),
        el('p', { class: 'hint' }, 'Størrelsen gjelder navnene på alle lanes, så de er like store. Som standard er de litt større enn teksten i boksene.'),
        ...laneWidth.panelRows({ el, lockedRow }),
      );
    }
    // I en gruppe: loddrette navn gjelder alle lanene i gruppen, som i gruppepanelet
    const inGroup = groupOfLane(plan, l.id);
    if (inGroup) {
      sn.append(
        switchRow('Loddrette navn i gruppen', !!inGroup.rotateNames, (v) => changeLaneGroup(inGroup.id, (x) => {
          if (v) x.rotateNames = true;
          else delete x.rotateNames;
        }), 'Navnene på alle lanene i gruppen står loddrett, som teksten i baren. Lanene blir høye nok til navnene.'),
      );
    }

    const sc = section('Farge');
    const now = (l.fill ?? '#FFFFFF').toUpperCase();
    const setFill = (f: string) =>
      changeLane((x) => {
        keepLaneOriginal(x);
        x.fill = f;
      });
    const tl = trial(`lane:${l.id}`, now, setFill);
    sc.append(
      swatches(now, [
        ...LANE_PALETTE,
        ...plan.lanes.filter((x) => x.fill).map((x): [string, string] => [x.fill!, 'Brukt i planen']),
      ], tl),
    );
    sc.append(
      colorRow(now, tl, l.original
        ? {
            text: 'Fargen fra Project',
            disabled: (l.original.fill ?? '').toUpperCase() === (l.fill ?? '').toUpperCase(),
            onClick: () => changeLane((x) => (x.fill = x.original ? x.original.fill : x.fill)),
          }
        : undefined),
    );
    const bg = switchRow('Også bak boksene', !!l.tintBackground, (v) =>
      changeLane((x) => {
        if (v) x.tintBackground = true;
        else delete x.tintBackground;
      }), 'Lanefargen vises dempet bak boksene, i en lys og en mørk nyanse for annenhver måned eller uke');
    const noTint = !l.fill || l.fill.toUpperCase() === '#FFFFFF';
    bg.querySelector('input')!.disabled = noTint;
    sc.append(bg);
    if (l.tintBackground && !noTint) sc.append(tintStrengthRow(tintStrengthKit, l));
    if (noTint && l.tintBackground) sc.append(el('p', { class: 'hint' }, 'Hvit lane har ingen farge å vise bak boksene.'));

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
    const mw = el('div', { class: 'prop prop-inline' });
    const merge = btn('Med en annen lane …', null, () => startLaneMerge(l.id), 'Bokser og milepæler flyttes til lanen du velger, og denne lanen blir borte. Angre med Ctrl+Z.');
    merge.disabled = !mergeTargets(plan, l.id).length;
    mw.append(el('span', { class: 'prop-label' }, 'Slå sammen'), merge);
    // Lanes som er slått sammen hit, kan skilles ut igjen
    const split = mergedInto(plan, l.id).map((m) => {
      const w = el('div', { class: 'prop prop-inline' });
      w.append(el('span', { class: 'prop-label' }, 'Skill ut'), btn(laneName(m.name), null, () => splitLaneOut(m.id), `Skill ut igjen. ${SPLIT_HINT}`));
      return w;
    });
    // Gruppe: grupper med en annen lane, eller endre gruppen lanen er i
    const gw = el('div', { class: 'prop prop-inline' });
    const own = groupOfLane(plan, l.id);
    const gb = own
      ? btn('Endre gruppen', null, () => selectLaneGroup(own.id), 'Tekst, farge og lanene i gruppen')
      : btn('Med en annen lane …', null, () => startLaneGroup(l.id), 'Klikk lanen den skal grupperes med. Lanene imellom blir også med.');
    gb.disabled = !own && !groupTargets(plan, l.id).length;
    gw.append(el('span', { class: 'prop-label' }, 'Grupper'), gb);
    sp.append(ow, mw, ...split, gw, el('p', { class: 'hint' }, layoutNow?.compact ? 'Du kan også dra lane-navnet opp eller ned.' : 'Du kan også dra lane-navnet opp eller ned, eller dra i nederste kant av lanen for å endre høyden.'));

    const foot = el('div', { class: 'panel-foot' });
    const del = btn(l.manual ? 'Slett' : 'Skjul', l.manual ? 'trash' : 'hide', () => removeLaneById(l.id),
      l.manual ? 'Slett lanen. Egne bokser i den slettes, bokser fra Project flyttes tilbake. (Delete)' : 'Skjul lanen. Høyreklikk et lane-navn for å vise den igjen. (Delete)');
    del.disabled = vis.length <= 1 && pos >= 0;
    const reset = btn('Tilbakestill', 'undo', () => changeLane((x) => resetLane(x)), 'Navn og farge fra Project, svart tekst og automatisk høyde', 'button push');
    reset.disabled = l.manual || !isLaneEdited(l);
    foot.append(btn('Ny lane', 'laneAdd', () => addLane(l.id), 'Ny lane rett under denne'), del, reset);
    panel.append(foot);
  };

  // ---- Følg datoene til en annen boks ----
  const edgeWord = (edge: Edge) => (edge === 'start' ? 'startdatoen' : 'sluttdatoen');
  const boxName = (b: Box | null | undefined) => (b ? `«${plainText(b.text) || (b.resolved?.isMilestone ? 'Milepæl' : 'Boks')}»` : 'boksen');
  /** Starter valget av boksen som `id` skal følge. Neste klikk på en boks lager koblingen. */
  const startFollowPick = (id: string, edge: Edge) => {
    const plan = host.getPlan();
    if (!plan || !followBar) return;
    if (critical.mode) setCriticalMode(false);
    followPick = { id, edge };
    selected = id;
    group = [];
    followBar.querySelector('.follow-text')!.textContent = `Klikk boksen ${boxName(findBox(plan, id))} skal følge ${edgeWord(edge)} til.`;
    followBar.hidden = false;
    buildPanel();
    overlay();
    syncTools();
  };
  const endFollowPick = () => {
    if (!followPick) return;
    followPick = null;
    if (followBar) followBar.hidden = true;
    overlay();
    syncTools();
  };
  /** Klikk på en boks mens du velger: lager koblingen, eller sier hvorfor den ikke går. */
  const pickFollowTarget = (target: string | null) => {
    const plan = host.getPlan();
    if (!plan || !followPick || !target || !followBar) return;
    const { id, edge } = followPick;
    if (!canFollow(plan, id, target)) {
      const t = findBox(plan, target);
      followBar.querySelector('.follow-text')!.textContent =
        target === id ? 'Boksen kan ikke følge seg selv. Klikk en annen boks.' : !t?.resolved ? 'Den boksen har ingen datoer. Klikk en annen boks.' : `${boxName(t)} følger allerede denne boksen. Klikk en annen boks.`;
      return;
    }
    followPick = null;
    followBar.hidden = true;
    selected = id;
    commit((pl) => setFollow(pl, id, target, edge));
  };
  // ---- Samme høyde som en annen boks ----
  /** Høyreklikk-valgene for å gi andre bokser samme høyde som `id`. Med flere valgt også «de valgte». */
  const sameHeightItems = (id: string): CtxItem[] => {
    const plan = host.getPlan();
    if (!plan || !heightCopy || !canTakeHeight(findBox(plan, id))) return [];
    const others = group.includes(id) ? group.filter((x) => x !== id && canTakeHeight(findBox(plan, x))) : [];
    return [
      ...(others.length
        ? [{ label: 'Gi de valgte samme høyde', icon: 'sameHeight' as const, hint: `${others.length === 1 ? 'Den andre valgte boksen' : `De ${others.length} andre valgte boksene`} blir like høye som denne. Får ikke teksten plass, havner den i callout.`, onSelect: () => sameHeightAsSelected(id, others) }]
        : []),
      { label: 'Gi andre bokser samme høyde …', icon: 'sameHeight', hint: 'Klikk boksene som skal bli like høye som denne. Får ikke teksten plass, havner den i callout. Esc avslutter.', onSelect: () => startHeightCopy(id) },
    ];
  };
  const startHeightCopy = (id: string) => {
    endFollowPick();
    lanePick?.end();
    if (critical.mode) setCriticalMode(false);
    selected = id;
    group = [];
    buildPanel();
    heightCopy?.start(id);
  };
  /** Alle valgte bokser får samme høyde som `id`, i ett angresteg. */
  const sameHeightAsSelected = (id: string, ids: string[]) => {
    const L = layoutNow;
    if (!L) return;
    let r = { callout: 0, taller: 0 };
    commit((pl) => (r = sameHeight(pl, L, id, ids)));
    const words = resultWords(r);
    if (words) showArrangeBar(words, true);
  };
  /** Bytter mellom start og slutt på samme boks. */
  const setFollowEdge = (id: string, edge: Edge) => {
    const b = findBox(host.getPlan()!, id);
    const target = b?.follows?.box;
    if (!target) return startFollowPick(id, edge);
    commit((pl) => setFollow(pl, id, target, edge));
  };
  /** Høyreklikk på en egen boks: følg start eller slutt på en annen boks. */
  const followGroup = (plan: PlanFile, b: Box): CtxGroup => {
    const f = b.follows;
    const t = f ? findBox(plan, f.box) : null;
    const item = (edge: Edge): CtxItem => ({
      label: edge === 'start' ? 'Følg startdatoen til …' : 'Følg sluttdatoen til …',
      icon: 'link',
      checked: f?.edge === edge ? true : undefined,
      hint:
        f?.edge === edge
          ? `Følger ${edgeWord(edge)} til ${boxName(t)}. Velg igjen for å bytte boks.`
          : 'Klikk så boksen den skal følge. Når den boksen flytter seg, også ved oppdatering fra Project, flyttes denne like mange dager.',
      onSelect: () => startFollowPick(b.id, edge),
    });
    return {
      items: [
        item('start'),
        item('finish'),
        ...(f ? [{ label: 'Slutt å følge', icon: 'unlink' as const, hint: 'Boksen blir stående med datoene den har nå.', onSelect: () => stopFollowing(b.id) }] : []),
      ],
    };
  };
  const markKit = { section, switchRow, el };
  const hatchKit: HatchKit = { el, section, segmented, swatches, colorRow, trial };
  const transparencyKit: TransparencyKit = {
    el,
    snapshot,
    box: () => {
      const pl = host.getPlan();
      return pl && selected ? findBox(pl, selected) : null;
    },
    redraw: () => host.redraw(),
    syncTools,
  };
  const tintStrengthKit: TintStrengthKit = {
    el,
    snapshot,
    lane: () => {
      const pl = host.getPlan();
      return pl && selectedLane ? findLane(pl, selectedLane) : null;
    },
    redraw: () => host.redraw(),
    syncTools,
  };
  /** Størrelsen på alle ikonene for høylytt arbeid og nattarbeid. */
  const setMarkScale = (v: number | undefined) =>
    commit((pl) => {
      if (v === undefined) delete pl.plan.layout.markScale;
      else pl.plan.layout.markScale = v;
    });
  /** Eget merke fra panelet: last opp bildet og gi merket til boksene, eller åpne panelet for merket. */
  const customActions = (ids: string[]): CustomActions => ({
    add: async () => {
      const image = await pickMarkImage((m) => host.notify(m));
      if (!image) return;
      commit((pl) => {
        pl.plan.layout.customMark = { name: MARK_NAMES.custom, image };
        setMarks(pl, ids, 'custom', true);
      });
    },
    edit: () => selectTrade(MARK_KEYS.custom),
  });
  /** Boksene et valg i høyreklikkmenyen gjelder: alle valgte når boksen er blant dem, ellers bare den. */
  const marksTargets = (plan: PlanFile, id: string): Box[] =>
    (group.includes(id) ? group : [id]).map((x) => findBox(plan, x)).filter((x): x is Box => !!x && !x.resolved?.isMilestone);
  const stopFollowing = (id: string) => commit((pl) => delete findBox(pl, id)!.follows);

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

    const ownSize = boxes.some((x) => x.textScale);
    if (plain.length || ownSize) {
      const st = section('Tekst');
      if (plain.length) st.append(...datesRows(markKit, plan, plain, (v) => commit((pl) => setBoxDates(pl, plain.map((x) => x.id), v))));
      // Egen tekststørrelse gjelder både bokser og milepæler
      if (ownSize) st.append(lockedRow('Noen har egen tekststørrelse', 'Som planen', 'Samme tekststørrelse som resten av planen', () => all((x) => delete x.textScale, false)));
    }

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
    const tg = trial(`group:${group.join(',')}`, cur ?? '', (f) => all((x) => (x.fill = f)));
    sc.append(
      swatches(cur, planSwatches(plan), tg),
      colorRow(cur || '#FFFFFF', tg, [
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

    if (plain.length) hatchSection(hatchKit, plain, `group:${group.join(',')}`, same((x) => currentFill(plan, x)), all);

    const so = section('Callout', calloutFold(plain));
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

    if (plain.length) marksSection(markKit, plan, plain, (k, v) => commit((pl) => setMarks(pl, plain.map((x) => x.id), k, v)), setMarkScale, customActions(plain.map((x) => x.id)));

    section('Kritisk linje', lineFold(boxes)).append(critical.boxLineRow(plan, boxes));

    const sp = section('Høyde og plass', placeFold(boxes));
    if (plain.some((x) => x.height)) sp.append(lockedRow('Noen har fast høyde', 'Standard høyde', 'Så høye som teksten krever', () => all((x) => delete x.height)));
    if (boxes.some(pinned)) sp.append(lockedRow('Noen har fast plass', 'Løsne', 'La appen velge plassen i lanen igjen', () => all(unpinBox, false)));
    if (plain.length) sp.append(switchRow('Tegn fremst', allFront(plain), (v) => commit((pl) => setFront(pl, plain.map((x) => x.id), v)), FRONT_HINT));
    sp.append(el('p', { class: 'hint' }, PLACE_HINT));

    const foot = el('div', { class: 'panel-foot' });
    const reset = btn('Tilbakestill', 'undo', () => commit((pl) => group.forEach((id) => resetBoxInPlan(pl, id))), 'Fjerner det du har endret på de valgte', 'button push');
    reset.disabled = !boxes.some(isEdited);
    foot.append(btn('Skjul/slett', 'hide', () => removeGroup(), 'Skjuler bokser fra Project og sletter bokser laget i appen (Delete)'), reset);
    panel.append(foot);
  };

  // ---- Kritisk linje ----
  const critical = createCriticalUi({
    host,
    panel,
    active: () => active,
    layout: () => layoutNow,
    clearSelection: () => {
      selected = null;
      selectedLane = null;
      selectedHeader = false;
      selectedLaneGroup = null;
      clearImage();
      selectedTrade = null;
      group = [];
    },
    kit: { el, syncTools, snapshot, commit, panelHead, section, segmented, switchRow, btn, swatches, buildPanel: () => buildPanel(), overlay: () => overlay() },
  });
  const { setCritical, buildCriticalPanel } = critical;
  const setCriticalMode = (on: boolean) => critical.setMode(on);
  const criticalView = () => critical.view();

  // ---- Fag og forklaringen ----
  const { setLegendItem, legendName, legendSection, buildTradePanel } = createTradeUi({
    host,
    panel,
    layout: () => layoutNow,
    takeNameFocus: () => {
      const on = focusTradeName;
      focusTradeName = false;
      return on;
    },
    kit: {
      el, syncTools, commit, trial, panelHead, section, segmented, switchRow, btn, swatches, colorRow, sizeStepper, stepFor, redrawFor, textColorKey, TEXT_COLORS, tradeName,
      endTyping: () => (typingSession = false),
      select: (id) => select(id),
      selectTrade: (t) => selectTrade(t),
      setGroup: (ids) => setGroup(ids),
      buildPanel: () => buildPanel(),
    },
  });

  const buildPanel = () => {
    if (holdPanel) return;
    const plan = host.getPlan();
    const b = active && plan && selected ? findBox(plan, selected) : null;
    // Panelet står åpent hele tiden i redigering, så arket ikke skifter størrelse når du velger
    panel.hidden = !active || !plan;
    panel.replaceChildren();
    if (!plan || !active) return;
    if (critical.mode) return buildCriticalPanel(plan);
    const imSel = images.selected ? findImage(plan, images.selected) : null;
    if (imSel) return buildImagePanel(plan, imSel);
    if (!b && group.length > 1) return buildGroupPanel(plan);
    if (!b && selectedHeader) return buildHeaderPanel(plan);
    const lg = !b && selectedLaneGroup ? findGroup(plan, selectedLaneGroup) : null;
    if (lg) return buildLaneGroupPanel(groupKit(), plan, lg);
    const lane = !b && selectedLane ? findLane(plan, selectedLane) : null;
    if (lane) return buildLanePanel(plan, lane);
    if (!b && selectedTrade === FERIE_KEY) {
      panelHead('Ferie', 'Forklaringen nederst');
      return legendSection(plan, FERIE_KEY);
    }
    const markSel = !b && selectedTrade ? markOfKey(selectedTrade) : null;
    if (markSel === 'custom') {
      panelHead(markName('custom', plan.plan.layout.customMark?.name), 'Eget merke');
      customMarkSection(markKit, plan, {
        rename: (name) => commit((pl) => pl.plan.layout.customMark && (pl.plan.layout.customMark.name = name || MARK_NAMES.custom)),
        replace: async () => {
          const image = await pickMarkImage((m) => host.notify(m));
          if (image) commit((pl) => pl.plan.layout.customMark && (pl.plan.layout.customMark.image = image));
        },
        remove: () => {
          selectedTrade = null;
          commit(removeCustomMark);
        },
        button: btn,
      });
      section('Størrelse').append(markScaleRow(markKit, plan, setMarkScale));
      return;
    }
    if (markSel) {
      panelHead(MARK_NAMES[markSel], 'Forklaringen nederst');
      section('Ikonene').append(markScaleRow(markKit, plan, setMarkScale));
      return legendSection(plan, selectedTrade!);
    }
    if (!b && selectedTrade && tradeColors(plan).some((c) => c.name === selectedTrade)) return buildTradePanel(plan, selectedTrade);
    if (!b) {
      panel.append(el('h2', { class: 'panel-empty-title' }, 'Rediger'));
      panel.append(el('p', { class: 'panel-note' }, 'Klikk noe på arket for å endre det.'));
      const groups: [string, string[]][] = [
        ['Bokser', [
          'Klikk en boks for å velge den. Dobbeltklikk for å skrive.',
          'Dra en boks opp eller ned for å gi den fast plass i lanen, eller til en annen lane for å flytte den dit. Hold Ctrl mens du drar for å skyve boksene under ned, så de beholder formen.',
          'Dra i den blå streken under valgt boks for å endre høyden. Bunnen snapper til kanten av andre bokser, så de kan stilles på linje (hold Alt for å dra fritt).',
          'Høyreklikk en boks og velg «Gi andre bokser samme høyde …», og klikk boksene som skal bli like høye. Med flere bokser valgt: «Gi de valgte samme høyde». Får ikke teksten plass, havner den i callout.',
          'Shift-klikk for å velge flere bokser, eller hold Shift og dra et rektangel.',
          'Omplasser i verktøylinjen pakker lanene på nytt, f.eks. etter at du har endret høyder. Angre om du ikke liker forslaget.',
        ]],
        ['Lanes', [
          'Klikk et lane-navn for å endre navn og farge. Dra navnet opp eller ned for ny rekkefølge.',
          'Dra i nederste kant av en lane for å gi den fast høyde.',
          'Høyreklikk et lane-navn for ny lane, skjulte lanes og for å slå lanen sammen med en annen. Høyreklikk tomt sted i en lane for ny boks og skjulte bokser.',
          'Høyreklikk et lane-navn og velg «Grupper med …» for å samle lanes under en smal bar med tekst. Klikk baren for å endre tekst og farge, ta med flere lanes eller ta dem ut.',
          'Lanes: Egendefinert i Innstillinger gir en stiplet topp- og bunnkant du kan dra, f.eks. for å gi plass til et kart. Dra et hvitt punkt for å lage et knekkpunkt.',
        ]],
        ['Arket', [
          'Klikk et fag i forklaringen nederst for å endre fargen på alle boksene i faget, eller teksten i forklaringen. Høyreklikk for nytt fag, eller for å gi valgte bokser faget.',
          'Klikk overskriften for å endre den eller skrive en tekst øverst til høyre.',
        ]],
        ['Bilder', [
          'Høyreklikk hvor som helst på arket og velg «Sett inn bilde». Ctrl+V setter inn et bilde fra utklippstavlen, og du kan dra bildefiler inn på arket.',
          'Dra i hjørnene for å endre størrelsen og i den runde knotten for å rotere. Dobbeltklikk for å beskjære.',
          'Høyreklikk en milepæl for å bruke et bilde som symbol. Bildet følger milepælen, og drar du i bildet, flyttes milepælen. Hold Alt for å flytte bare bildet.',
        ]],
      ];
      for (const [title, tips] of groups) {
        const s = section(title);
        const ul = el('ul', { class: 'tips' });
        tips.forEach((t) => ul.append(el('li', {}, t)));
        s.append(ul);
        if (title === 'Arket') s.append(btn('Nytt fag', 'plus', () => createTrade([]), 'Lager et nytt fag. Navn og farge velger du i panelet.', 'button small'));
        if (title === 'Bilder') s.append(btn('Sett inn bilde …', 'image', () => pickImage(null), 'Velg en bildefil. Den settes inn midt i det du ser av arket.', 'button small'));
      }
      // Skjulte oppføringer står ikke i forklaringen, så de vises igjen herfra
      const hiddenLeg = Object.entries(plan.plan.layout.legendItems ?? {}).filter(([, v]) => v.hidden);
      if (hiddenLeg.length) {
        const sh = section('Skjult i forklaringen');
        for (const [key, v] of hiddenLeg) sh.append(lockedRow(v.text?.trim() || legendName(key), 'Vis', 'Vis oppføringen i forklaringen igjen', () => setLegendItem(key, { hidden: false })));
      }
      const keys = section('Hurtigtaster');
      const dl = el('dl', { class: 'keys' });
      for (const [k, t] of [['Ctrl+Z', 'Angre'], ['Ctrl+Y', 'Gjør om'], ['Ctrl+D', 'Dupliser boks'], ['Ctrl+C', 'Kopier boks'], ['Ctrl+V', 'Lim inn boks eller bilde'], ['Delete', 'Skjul boks'], ['Esc', 'Fjern valget']]) {
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
    const when = r ? (ms || r.start === r.finish ? formatLong(r.start) : `${formatLong(r.start)} – ${formatLong(r.finish)}`) : '';
    const sub = b.manual ? (b.follows ? `Laget i appen, følger ${boxName(findBox(plan, b.follows.box))}` : 'Laget i appen, følger ikke Project') : when;
    panelHead(ms ? 'Milepæl' : 'Boks', sub || undefined);
    if (b.manual && r) {
      // Boks laget i appen: datoene velges her. En milepæl har én dato.
      const sd = section(ms ? 'Dato' : 'Datoer');
      const row = el('div', { class: 'row dates' });
      const mk = (key: 'start' | 'finish', label: string) => {
        const lab = el('label', {}, label);
        const inp = el('input', { type: 'date', value: r[key], min: calRange(plan).start, max: calRange(plan).end }) as HTMLInputElement;
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
      // Følg en annen boks: velg start eller slutt, og klikk så boksen
      const f = b.follows;
      const picking = followPick?.id === b.id ? followPick.edge : null;
      sd.append(
        segmented<'none' | Edge>('Følger', picking ?? f?.edge ?? 'none', [['none', 'Ingen'], ['start', 'Start'], ['finish', 'Slutt']], (v) => {
          if (v === 'none') {
            endFollowPick();
            if (f) stopFollowing(b.id);
            else buildPanel();
          } else if (f) setFollowEdge(b.id, v);
          else startFollowPick(b.id, v);
        }),
      );
      if (picking) sd.append(el('p', { class: 'hint' }, `Klikk boksen den skal følge ${edgeWord(picking)} til. Esc avbryter.`));
      else if (f) {
        const t = findBox(plan, f.box);
        sd.append(el('p', { class: 'hint' }, `Flyttes like mange dager som ${edgeWord(f.edge)} til ${boxName(t)} flytter seg, også ved oppdatering fra Project.`));
        const acts = el('div', { class: 'row follow-acts' });
        acts.append(btn('Vis boksen', null, () => select(f.box), undefined, 'linkish'), btn('Velg en annen boks', null, () => startFollowPick(b.id, f.edge), undefined, 'linkish'));
        sd.append(acts);
      } else sd.append(el('p', { class: 'hint' }, 'Velg Start eller Slutt, og klikk så boksen den skal følge.'));
    } else if (r) {
      // Egne bokser som følger denne boksen
      const fs = followersOf(plan, b.id);
      if (fs.length) {
        const sf = section('Følges av');
        for (const x of fs) sf.append(lockedRow(`${boxName(x)}, ${edgeWord(x.follows!.edge)}`, 'Vis', 'Velg boksen', () => select(x.id)));
      }
    }

    const st = section('Tekst');
    const liveBox = () => {
      const pl = host.getPlan();
      return pl ? findBox(pl, b.id) : null;
    };
    const tf = textField('box-text', 'Tekst', b.text, '3', (v) =>
      change((x) => {
        keepOriginal(x);
        // Farget tekst følger med når teksten endres
        if (x.textColors) {
          const runs = remapRuns(x.textColors, x.text, v);
          if (runs.length) x.textColors = runs;
          else delete x.textColors;
        }
        x.text = v;
      }, { typing: true, rebuild: false }), true, () => fieldColors(liveBox()),
    );
    st.append(
      tf,
      el('p', { class: 'hint', title: 'Enter eller | gir linjeskift (vist med ↵), og /| gir en loddrett strek.' }, 'Enter gir linjeskift, /| en loddrett strek.'),
      ...textColorRows({ el, swatches, box: liveBox, change: (fn) => change(fn, { rebuild: false }) }, tf.querySelector('textarea')!),
    );
    if (!ms) st.append(...datesRows(markKit, plan, [b], (v) => commit((pl) => setBoxDates(pl, [b.id], v))));
    if (layoutNow) st.append(...textSizeRow(b, layoutNow.textSizePt));
    if (ms) {
      // Utseende fra appen går foran det som er valgt i Project
      const base = b.milestone ?? { symbol: 'diamond', color: 'blue', showDate: true, verticalLine: false };
      const stl = { ...base, ...b.milestoneStyle };
      type MsKey = 'symbol' | 'color' | 'verticalLine' | 'showDate' | 'rotation' | 'flagTurned' | 'diamondBelow';
      const fromProject: Record<string, unknown> = { ...base, rotation: baseMilestoneRotation(b), flagTurned: false, diamondBelow: false };
      const setMs = (k: MsKey, v: unknown) =>
        change((x) => {
          const m: Record<string, unknown> = { ...x.milestoneStyle };
          if (fromProject[k] === v) delete m[k];
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
      // Med bilde som symbol gjelder ikke valget av flagg, ruter og farge
      const img = images.symbolImageOf(plan, b.id);
      if (img) su.append(...images.milestoneSymbolRows(plan, b.id));
      else
        su.append(
          segmented('Symbol', stl.symbol, [['diamond', 'Ruter', 'diamond'], ['flag', 'Flagg', 'flag']], (v) => setMs('symbol', v)),
          cw,
          ...images.milestoneSymbolRows(plan, b.id),
        );
      su.append(
        switchRow('Vis dato', stl.showDate, (v) => setMs('showDate', v)),
        switchRow('Loddrett linje', stl.verticalLine, (v) => setMs('verticalLine', v), 'Strek fra milepælen ned gjennom planen'),
        segmented<Rotation>('Rotasjon', milestoneRotation(b), [[0, 'Ingen'], [90, '90°'], [-90, '−90°']], (v) => setMs('rotation', v)),
      );
      // Symbolet kan bare snus når teksten er rotert
      if (!img && milestoneRotation(b) !== 0)
        su.append(
          stl.symbol === 'flag'
            ? switchRow('Roter flagget', !!b.milestoneStyle?.flagTurned, (v) => setMs('flagTurned', v), 'Stangen øverst og flagget hengende ned, teksten under')
            : switchRow('Ruteren under teksten', !!b.milestoneStyle?.diamondBelow, (v) => setMs('diamondBelow', v), 'Teksten står over ruteren i stedet for under'),
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
      const tb = trial(`box:${b.id}`, nowFill, (f) => change((x) => (x.fill = f)));
      sc.append(
        swatches((b.fill ?? '').toUpperCase(), planSwatches(plan), tb),
        colorRow(nowFill, tb, [
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
      // Bokser som ligger bak de andre kan gjøres gjennomsiktige, så linjene bak synes
      if (canBeTransparent(b)) sc.lastElementChild!.before(transparencyRow(transparencyKit, b));
      hatchSection(hatchKit, [b], `box:${b.id}`, nowFill, change);

      const so = section('Callout', calloutFold([b]));
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

      const sf = section('Form', formFold(b));
      sf.append(
        segmented('Type', b.spanTo !== undefined ? 'span' : b.header ? 'header' : 'normal', [['normal', 'Vanlig'], ['header', 'Overskrift'], ['span', 'Multi Lane']], (v) => {
          if (v === 'span') return setSpan(b.id, true);
          if (b.spanTo !== undefined) setSpan(b.id, false);
          if (v === 'header' || b.header) setHeader(b.id, v === 'header');
        }),
      );
      // Tre valg trenger hele bredden, så navnet står over knappene
      sf.lastElementChild!.classList.replace('prop-inline', 'prop');
      // Samme valg og navn som for fritekst, så teksten kan flyttes bort fra bokser som ligger foran
      // Rotert tekst flyttes langs høyden i stedet; det synes når boksen er høyere enn teksten
      const alignRow = () =>
        b.rotation === 0
          ? segmented<TextAlign>('Justering', alignOf(b), [['left', 'Venstre'], ['center', 'Midt'], ['right', 'Høyre']], (v) =>
              change((x) => {
                if (v === 'center') delete x.textAlign;
                else x.textAlign = v;
              }),
            )
          : segmented<'top' | 'middle' | 'bottom'>('Justering', b.textAt ?? 'middle', [['top', 'Oppe'], ['middle', 'Midt'], ['bottom', 'Nede']], (v) =>
              change((x) => {
                if (v === 'middle') delete x.textAt;
                else x.textAt = v;
              }),
            );
      if (b.header || b.spanTo !== undefined)
        sf.append(
          switchRow('Fet skrift', !!b.bold, (v) =>
            change((x) => {
              if (v) x.bold = true;
              else delete x.bold;
            }),
          ),
        );
      if (b.spanTo === undefined) sf.append(alignRow());
      if (b.header) sf.append(el('p', { class: 'hint' }, 'Teksten står øverst. Dra andre bokser inn i den; de flyttes med når du flytter overskriftsboksen.'));
      if (b.spanTo !== undefined && plan) {
        const wrap = el('label', { class: 'prop prop-inline' });
        wrap.append(el('span', { class: 'prop-label' }, 'Ned til'));
        const sel = el('select', { id: 'span-to', 'aria-label': 'Boksen går ned til bunnen av denne lanen' }) as HTMLSelectElement;
        for (const l of lanesFrom(plan, b.id)) {
          const o = el('option', { value: l.id }, plainText(l.name) || 'Uten navn') as HTMLOptionElement;
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
        if (b.rotation === 0) sf.append(alignRow());
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

    if (!ms) marksSection(markKit, plan, [b], (k, v) => commit((pl) => setMarks(pl, [b.id], k, v)), setMarkScale, customActions([b.id]));

    // Milepælpanelet er kort nok til at delene kan stå åpne
    section('Kritisk linje', ms ? undefined : lineFold([b])).append(critical.boxLineRow(plan, [b]));
    const sp = section(ms ? 'Plass' : 'Høyde og plass', ms ? undefined : placeFold([b]));
    if (!ms && b.height) sp.append(lockedRow('Fast høyde', 'Standard høyde', 'Så høy som teksten krever', () => change((x) => delete x.height)));
    if (pinned(b)) sp.append(lockedRow('Fast plass i lanen', 'Løsne', 'La appen velge plassen i lanen igjen', () => change(unpinBox)));
    if (!ms) sp.append(switchRow('Tegn fremst', !!b.front, (v) => commit((pl) => setFront(pl, [b.id], v)), FRONT_HINT));
    // Samme som i høyreklikkmenyen: klikk boksene som skal bli like høye som denne
    if (!ms && heightCopy && canTakeHeight(b))
      sp.append(btn('Gi andre bokser samme høyde …', null, () => startHeightCopy(b.id), 'Klikk boksene som skal bli like høye som denne. Får ikke teksten plass, havner den i callout. Esc avslutter.', 'linkish'));
    sp.append(el('p', { class: 'hint' }, ms ? 'Dra milepælen opp eller ned for å gi den fast plass.' : PLACE_HINT));

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
    paintCriticalOnly(svgNow, criticalView());
    if (!active) return;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'edit-overlay edit-marks');
    g.setAttribute('pointer-events', 'none');
    const plan = host.getPlan();
    // Valgt egen boks: boksen den følger, stiplet. Valgt boks som følges: de som følger den.
    const selBox = plan && selected ? findBox(plan, selected) : null;
    const linked = new Set<string>(selBox?.follows ? [selBox.follows.box] : []);
    if (plan && selBox) for (const x of followersOf(plan, selBox.id)) linked.add(x.id);
    for (const it of layoutNow.items) {
      const b = plan ? findBox(plan, it.id) : null;
      const r = bounds(it);
      if (linked.has(it.id) && it.id !== selected) {
        const rect = document.createElementNS(NS, 'rect');
        const pad = 0.6;
        for (const [k, v] of Object.entries({ x: r.x0 - pad, y: r.y0 - pad, width: r.x1 - r.x0 + 2 * pad, height: r.y1 - r.y0 + 2 * pad, fill: 'none', stroke: ACCENT, 'stroke-width': 0.4, 'stroke-dasharray': '1.2 0.8', rx: 0.6 }))
          rect.setAttribute(k, String(v));
        g.append(rect);
      }
      if (it.id === selected || group.includes(it.id)) {
        const rect = document.createElementNS(NS, 'rect');
        const pad = 0.6;
        for (const [k, v] of Object.entries({ x: r.x0 - pad, y: r.y0 - pad, width: r.x1 - r.x0 + 2 * pad, height: r.y1 - r.y0 + 2 * pad, fill: 'none', stroke: ACCENT, 'stroke-width': 0.5, rx: 0.6 }))
          rect.setAttribute(k, String(v));
        g.append(rect);
      }
      if (critical.mode && plan && b && inLine(b, critical.line)) {
        // Boksene i linjen som tegnes, i linjens farge
        const c = styleOf(plan.plan.layout, critical.line).color;
        const rect = document.createElementNS(NS, 'rect');
        for (const [k, v] of Object.entries({ x: r.x0 - 0.5, y: r.y0 - 0.5, width: r.x1 - r.x0 + 1, height: r.y1 - r.y0 + 1, fill: c, 'fill-opacity': 0.08, stroke: c, 'stroke-width': 0.4, 'stroke-dasharray': '1 0.6', rx: 0.5 }))
          rect.setAttribute(k, String(v));
        g.append(rect);
      }
      if (arrangeUi.moved.has(it.id)) {
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
        for (const [k, v] of Object.entries({ x: ln.titleX0 + 0.3, y: ln.y0 + 0.3, width: L.plot.x0 - ln.titleX0 - 0.6, height: ln.y1 - ln.y0 - 0.6, fill: 'none', stroke: ACCENT, 'stroke-width': 0.6 }))
          rect.setAttribute(k, String(v));
        g.append(rect);
      }
      if (showMarks && pl && (pl.original || pl.manual)) {
        const c = document.createElementNS(NS, 'circle');
        for (const [k, v] of Object.entries({ cx: L.plot.x0 - 1.4, cy: ln.y0 + 1.4, r: 0.9, fill: ACCENT, stroke: '#FFFFFF', 'stroke-width': 0.3 })) c.setAttribute(k, String(v));
        g.append(c);
      }
    }
    for (const gb of L.laneGroups) {
      if (gb.id !== selectedLaneGroup) continue;
      const rect = document.createElementNS(NS, 'rect');
      for (const [k, v] of Object.entries({ x: gb.x0 + 0.3, y: gb.y0 + 0.3, width: gb.x1 - gb.x0 - 0.6, height: gb.y1 - gb.y0 - 0.6, fill: 'none', stroke: ACCENT, 'stroke-width': 0.6 }))
        rect.setAttribute(k, String(v));
      g.append(rect);
    }
    for (const ln of layoutNow.lanes) {
      if (ln.manual) line(layoutNow.laneTitleX, layoutNow.plot.x0, ln.y1, { stroke: ACCENT, 'stroke-width': 3 });
      // Kompakt ser bort fra fast lanehøyde, så kanten kan ikke dras der
      if (!layoutNow.compact) line(layoutNow.laneTitleX, layoutNow.plot.x0, ln.y1, { class: 'edit-handle lane-edge', 'data-lane': ln.id, stroke: 'transparent', 'stroke-width': 8, 'pointer-events': 'stroke' });
    }
    if (!critical.mode) laneWidth.draw(g);
    const sel = layoutNow.items.find((i) => i.id === selected);
    // Ikke i kritisk linje-modus: der skal et klikk like under boksen treffe naboen
    if (sel?.kind === 'box' && !critical.mode) {
      const w = sel.x1 - sel.x0;
      line(sel.x0 + w * 0.25, sel.x1 - w * 0.25, sel.y + sel.h, { stroke: ACCENT, 'stroke-width': 3, 'stroke-linecap': 'round' });
      line(sel.x0, sel.x1, sel.y + sel.h, { class: 'edit-handle box-handle', stroke: 'transparent', 'stroke-width': 7, 'pointer-events': 'stroke' });
    }
    lanePick?.draw(g, L);
    heightCopy?.draw(g, L);
    if (!critical.mode) areaEdit.draw(g);
    imageOverlay(g);
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

  let drag: Drag | null = null;
  let suppressClick = false;
  /** Sluker klikket som følger et trykk. Slippes knappen uten at det blir et klikk, gjelder det ikke neste. */
  const swallowClick = () => {
    suppressClick = true;
    window.addEventListener('pointerup', () => window.setTimeout(() => (suppressClick = false), 0), { once: true });
  };

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
  /** Ctrl holdt nede under dra: boksene under skyves ned (se pushmove.ts). */
  let pushOn = false;
  const pushHint = createPushHint();
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

  /**
   * Flytter boksen eller milepælen `it`, og med flere valgt også de andre valgte (`ids`), like langt.
   * Ett slipp gir ett angresteg.
   */
  const startMove = (it: Item, ids: string[] = [it.id]): Drag | null => {
    if (!layoutNow) return null;
    const L = layoutNow;
    const plan0 = host.getPlan();
    const unit = L.unit;
    const many = ids.length > 1;
    type Unit = {
      it: Item;
      r: ReturnType<typeof bounds>;
      home: LaneLayout;
      span: boolean;
      /** Høyden som teller i lanen: for Multi Lane-bokser bare teksten øverst. */
      fh: number;
      /** Fra toppen av tegningen (bounds) ned til der plassen i lanen regnes fra (milepæler). */
      off: number;
      /** Kanten som snapper: selve boksen, ikke callouten. */
      bh: number;
      sideways: boolean;
      /** Bokser inne i en overskriftsboks, med avstanden fra toppen av overskriftsboksen. */
      kids: { id: string; dy: number }[];
      lane: LaneLayout;
      y: number;
      ghost?: SVGRectElement;
    };
    const unitOf = (o: Item): Unit | null => {
      const r = bounds(o);
      // Lanen boksen hører til. Et flagg øverst i lanen kan stikke litt over kanten, så toppen av
      // tegningen kan ligge i lanen over (eller over den første lanen).
      const own = plan0 ? laneOf(plan0, o.id)?.id : undefined;
      const home = L.lanes.find((l) => l.id === own) ?? laneAt(r.y0);
      if (!home) return null;
      // Multi Lane-boks: i lanen tar den bare plass til teksten øverst, så det er den som flyttes innenfor lanen
      const span = o.kind === 'box' && !!o.span;
      const fh = span ? Math.min((o as BoxItem).minH ?? r.y1 - r.y0, r.y1 - r.y0) : pieceHeight(o);
      // Egne bokser og milepæler kan også dras sidelengs til nye datoer (ikke når de følger en annen boks)
      const b = plan0 ? findBox(plan0, o.id) : null;
      const sideways = !!b?.manual && !b.follows && !!b.resolved && !(o.kind === 'box' && (o.header || o.span));
      const kids = o.kind === 'box' && o.header && !o.span ? L.items.filter((k) => inHeaderBox(o, k)).map((k) => ({ id: k.id, dy: bounds(k).y0 - r.y0 })) : [];
      return { it: o, r, home, span, fh, off: pinOffset(o), bh: o.kind === 'box' ? o.h : fh, sideways, kids, lane: home, y: r.y0 };
    };
    const lead = unitOf(it);
    if (!lead) return null;
    const units: Unit[] = [lead];
    for (const id of ids) {
      const o = id === it.id ? undefined : L.items.find((i) => i.id === id);
      const u = o && unitOf(o);
      if (u) units.push(u);
    }
    // En boks inne i en valgt overskriftsboks følger overskriftsboksen og flyttes ikke for seg
    const carried = new Set(units.flatMap((u) => u.kids.map((k) => k.id)));
    const moving = units.filter((u) => u === lead || !carried.has(u.it.id));
    for (const u of moving) u.kids = u.kids.filter((k) => !moving.some((m) => m.it.id === k.id));
    const skip = new Set(moving.flatMap((u) => [u.it.id, ...u.kids.map((k) => k.id)]));
    const { r, span } = lead;
    let g: SVGGElement | null = null;
    let target: SVGRectElement | null = null;
    let snap: ReturnType<typeof snapper> | null = null;
    const refX = it.kind === 'box' ? it.x0 : it.x;
    const anySideways = moving.some((u) => u.sideways);
    let days = 0;
    let xShift = 0;
    let last = { dy: 0, dx: 0 };
    // Ctrl: bokser i lanen som treffes, skyves ned, med ny topp og lanen de står i
    const laneOfId = new Map((plan0?.lanes ?? []).flatMap((l) => l.boxes.map((b) => [b.id, l.id] as const)));
    let pushed = new Map<string, { y: number; lane: LaneLayout }>();
    const pushGhosts = new Map<string, SVGRectElement>();
    const first = L.lanes[0];
    const lastLane = L.lanes[L.lanes.length - 1];
    /** Plassen for `u` når toppen ønskes ved `top`. `exact`: toppen skal ikke rundes av (snappet, eller fulgt av en annen). */
    const place = (u: Unit, top: number, exact: boolean) => {
      // Boksen kan dras til en annen lane; midten av boksen bestemmer hvilken
      // Regnes fra plassen i lanen; for en milepæl ligger den litt under toppen av tegningen (u.off)
      const lane = laneAt(clamp(top + u.off + u.fh / 2, first.y0, lastLane.y1 - 1e-3)) ?? u.home;
      const pad = lane.top - lane.y0;
      const maxY = Math.max(lane.top, lane.y1 - pad - u.fh) - u.off;
      // Ellers trinn på en kvart tekstlinje
      const want = exact ? top : lane.top - u.off + Math.round((top + u.off - lane.top) / (unit / 4)) * (unit / 4);
      // I samme lane står bunnen av en Multi Lane-boks fast, så toppen kan flyttes ned uten at bunnen følger
      u.lane = lane;
      u.y = clamp(want, lane.top - u.off, u.span && lane === u.home ? Math.min(maxY, u.r.y1 - u.fh) : maxY);
      return want;
    };
    /** Med Ctrl: hvilke bokser som skyves ned, og skyggene som viser hvor de havner. */
    const showPush = (g: SVGGElement) => {
      pushed = new Map();
      if (pushOn)
        for (const lane of new Set(moving.map((u) => u.lane))) {
          const dx = (u: Unit) => (u.sideways ? xShift : 0);
          const movers = moving.filter((u) => u.lane === lane).map((u) => ({ id: u.it.id, x0: u.r.x0 + dx(u), x1: u.r.x1 + dx(u), y0: u.y + u.off, y1: u.y + u.off + u.fh }));
          // Overskrifts- og Multi Lane-bokser skyves ikke; boksene inni en overskriftsboks som flyttes, følger den
          const others = L.items.filter((o) => laneOfId.get(o.id) === lane.id && !skip.has(o.id) && !(o.kind === 'box' && (o.header || o.span))).map(pieceRect);
          for (const [id, y] of pushDown(movers, others)) pushed.set(id, { y, lane });
        }
      for (const [id, e] of pushGhosts) if (!pushed.has(id)) (e.remove(), pushGhosts.delete(id));
      for (const [id, { y }] of pushed) {
        const o = L.items.find((i) => i.id === id)!;
        const b = pieceRect(o);
        let e = pushGhosts.get(id);
        if (!e) {
          e = shape(g, 'rect', { x: b.x0, width: b.x1 - b.x0, height: b.y1 - b.y0, fill: ACCENT, 'fill-opacity': 0.08, stroke: ACCENT, 'stroke-width': 0.3, 'stroke-dasharray': '0.6 0.6' });
          pushGhosts.set(id, e);
        }
        set(e, { y });
      }
      pushHint.show(pushOn);
    };
    const drag: Drag = {
      startY: r.y0,
      startClient: 0,
      moved: false,
      again() {
        if (g) drag.move(last.dy, last.dx);
      },
      move(dy, dx) {
        last = { dy, dx };
        if (anySideways) {
          // Hele dager: datoen under venstre kant (midten for milepæler) bestemmer forskyvningen
          const x = clamp(refX + dx, L.plot.x0, L.plot.x1 - 1e-3);
          days = daysBetween(L.dateAt(refX), L.dateAt(x));
          const nx = L.xOfDate(addDaysIso(L.dateAt(refX), days));
          const ox = L.xOfDate(L.dateAt(refX));
          xShift = nx !== null && ox !== null ? nx - ox : dx;
        }
        if (!g) {
          g = ghostLayer();
          // Lanen boksen havner i, markert svakt (bare når én boks dras)
          if (!many) target = shape(g, 'rect', { x: L.laneTitleX, y: lead.home.y0, width: L.plot.x1 - L.laneTitleX, height: lead.home.y1 - lead.home.y0, fill: ACCENT, 'fill-opacity': 0.06 });
          for (const u of moving) u.ghost = shape(g, 'rect', { x: u.r.x0, y: u.r.y0, width: u.r.x1 - u.r.x0, height: u.r.y1 - u.r.y0, fill: ACCENT, 'fill-opacity': 0.15, stroke: ACCENT, 'stroke-width': 0.4, 'stroke-dasharray': '1 0.6' });
        }
        // Topp eller bunn på boksen det dras i snapper til kanten av en annen boks. De andre valgte flyttes like langt.
        if (!snap) snap = snapper(g, skip);
        const top = r.y0 + dy;
        const hit = it.kind === 'box' ? snap.find(span ? [top] : [top, top + lead.bh]) : null;
        const want = place(lead, hit ? top + hit.d : top, !!hit);
        const shift = want - r.y0;
        // Ikke rundet av for seg, så de valgte står like i forhold til hverandre
        for (const u of moving) if (u !== lead) place(u, u.r.y0 + shift, true);
        snap.show(hit && Math.abs(lead.y - want) < 1e-6 ? hit : null);
        for (const u of moving) {
          set(u.ghost!, u.span && u.lane === u.home ? { y: u.y, height: u.r.y1 - u.y } : { y: u.y, height: u.r.y1 - u.r.y0 });
          set(u.ghost!, { x: u.r.x0 + (u.sideways ? xShift : 0) });
        }
        if (target) set(target, { y: lead.lane.y0, height: lead.lane.y1 - lead.lane.y0, 'fill-opacity': lead.lane === lead.home ? 0 : 0.06 });
        showPush(g);
      },
      end() {
        g?.remove();
        pushHint.hide();
        const vertical = moving.some((u) => !(Math.abs(u.y - u.r.y0) < 1e-6 && u.lane === u.home));
        if (!vertical && !days) return;
        if (!many) selected = it.id;
        const shiftDates = (plan: PlanFile) => {
          if (!days) return;
          for (const u of moving) {
            const b = u.sideways ? findBox(plan, u.it.id) : null;
            if (b?.resolved) b.resolved = { ...b.resolved, start: addDaysIso(b.resolved.start, days), finish: addDaysIso(b.resolved.finish, days) };
          }
        };
        const pushing = pushOn;
        const applyMove = (plan: PlanFile) => {
          if (!vertical) return shiftDates(plan);
          shiftDates(plan);
          for (const u of moving) {
            const { lane, home, y } = u;
            // Med «Fyll hele arket» fordeles ledig plass likt på lanene. Slippes boksen lenger ned enn
            // innholdet i lanen gikk, ville lanen blitt høyere og lanene over lavere, så boksen havnet
            // nesten der den var. Lanen beholder derfor høyden den har, så boksen står der den ble sluppet.
            const pl = findLane(plan, lane.id);
            if (!L.compact && pl && !pl.height && y + (u.r.y1 - u.r.y0) - lane.y0 > lane.minH + 1e-6) pl.height = lines(lane.y1 - lane.y0, unit);
            // En overskriftsboks tar med seg boksene som ligger inne i den
            for (const m of [{ id: u.it.id, dy: 0 }, ...u.kids]) {
              if (lane !== home) moveBox(plan, m.id, lane.id);
              const b = findBox(plan, m.id);
              // I Kompakt lagres plassen bare for Kompakt, så «Fyll hele arket» er som før.
              // Til en annen lane gjelder plassen begge, den gamle hører til forrige lane.
              if (b) {
                const mi = L.items.find((i) => i.id === m.id);
                const at = lines(y + m.dy + (mi ? pinOffset(mi) : 0) - lane.top, unit);
                if (!L.compact || lane !== home) b.top = at;
                if (L.compact) b.compactTop = at;
                else if (lane !== home) delete b.compactTop;
              }
              // Multi Lane-boks i en annen lane: den går like mange lanes ned som før
              if (b && u.span && m.id === u.it.id && lane !== home && b.spanTo !== undefined) {
                const from = L.lanes.findIndex((l) => l.id === b.spanTo);
                const shift = L.lanes.indexOf(lane) - L.lanes.indexOf(home);
                if (from >= 0) b.spanTo = L.lanes[clamp(from + shift, L.lanes.indexOf(lane), L.lanes.length - 1)].id;
              }
            }
          }
        };
        if (!pushing) return commit(applyMove);
        // Ctrl: de skjøvne boksene festes der de havner. Løse bokser som ellers ville hoppet, festes der de står.
        const apply = (plan: PlanFile) => {
          applyMove(plan);
          for (const [id, { y, lane }] of pushed) {
            const b = findBox(plan, id);
            if (b) pinAt(b, lines(y - lane.top, unit), L.compact);
          }
        };
        const trial = snapshotOf(plan0!);
        apply(trial);
        const lanes = new Set(moving.flatMap((u) => [u.lane.id, u.home.id]));
        const extra = settle(trial, L, lanes, (p) => host.layoutOf(p), new Set(pushed.keys()));
        commit((plan) => {
          apply(plan);
          for (const [id, { at, side }] of extra) {
            const b = findBox(plan, id);
            if (!b) continue;
            if (!Number.isNaN(at)) pinAt(b, at, L.compact);
            if (side) b.calloutSide = side;
          }
        });
      },
    };
    return drag;
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
          settleLaneGroups(plan, lane.id);
        });
      },
    };
  };

  const select = (id: string | null) => {
    if (followPick && id !== followPick.id) endFollowPick();
    selected = id;
    group = [];
    selectedLane = null;
    selectedHeader = false;
    selectedLaneGroup = null;
    clearImage();
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
    selectedLaneGroup = null;
    clearImage();
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
    selectedLaneGroup = null;
    clearImage();
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
    selectedLaneGroup = null;
    clearImage();
    typingSession = false;
    buildPanel();
    overlay();
  };
  const selectLaneGroup = (id: string) => {
    selectLane(null);
    selectedLaneGroup = id;
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
    selectedLaneGroup = null;
    clearImage();
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
    selectedLaneGroup = null;
    clearImage();
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
  /** Gruppebaren under markøren, om noen. */
  const groupBarOf = (e: MouseEvent): string | null => {
    if (!active || !layoutNow || (e.target as Element | null)?.closest?.('.edit-handle')) return null;
    const p = toMm(e.clientX, e.clientY);
    return layoutNow.laneGroups.find((g) => p.x >= g.x0 && p.x < g.x1 && p.y >= g.y0 && p.y < g.y1)?.id ?? null;
  };
  /** Lanen hvis hendelsen er i lane-kolonnen (navnet), ellers ingenting. */
  const titleLaneOf = (e: MouseEvent): LaneLayout | null => {
    if (!active || !layoutNow || (e.target as Element | null)?.closest?.('.edit-handle')) return null;
    const p = toMm(e.clientX, e.clientY);
    if (p.x < layoutNow.laneTitleX || p.x >= layoutNow.plot.x0) return null;
    // I «Grupper med …» og «Slå sammen med …» treffer baren lanen bak den
    if (!lanePick?.from && groupBarOf(e)) return null;
    return laneAt(p.y) ?? null;
  };
  /**
   * Boksen eller milepælen under markøren, funnet ut fra plasseringen og ikke bare elementet under
   * markøren: callout-teksten til en boks kan ligge over naboen, grepene på valgt boks likeså, og et
   * klikk like ved kanten skal også treffe. Overskrifts- og Multi Lane-bokser ligger bak de andre og
   * treffes bare når ingenting annet er der. Rekkefølgen:
   * 0. inne i en boks merket «Tegn fremst» (den minste), 1. milepælssymbolet, 2. inne i en boks (den minste), 3. like ved et milepælssymbol (det er lite),
   * 4. callouten eller milepælsteksten, 5. inne i en overskrifts- eller Multi Lane-boks,
   * 6. den nærmeste innenfor slingringsmonnet, der valgt boks vinner.
   */
  const boxAt = (e: MouseEvent): string | null => {
    if (!active || !layoutNow) return null;
    const p = toMm(e.clientX, e.clientY);
    // Millimeter per skjermpunkt
    const px = 1 / (svgNow?.getScreenCTM()?.a || 4);
    type R = { x: number; y: number; w: number; h: number };
    // Skjulte bokser kan ikke treffes
    const items = shownItems(layoutNow.items, criticalView());
    const body = (it: Item): R => (it.kind === 'box' ? { x: it.x0, y: it.y, w: it.x1 - it.x0, h: it.h } : { x: it.x - it.size / 2, y: it.y - it.size / 2, w: it.size, h: it.size });
    const text = (it: Item): R | null => (it.kind === 'box' ? (it.callout?.box ?? null) : it.labelBox);
    const behind = (it: Item) => it.kind === 'box' && !!(it.header || it.span);
    const dist = (r: R) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));
    /** Den minste av dem som treffes innenfor `pad`, den nærmeste først. */
    const pick = (list: Item[], rect: (it: Item) => R | null, pad = 0): string | null => {
      let best = Infinity;
      let hit: string | null = null;
      for (const it of list) {
        const r = rect(it);
        if (!r) continue;
        const d = dist(r);
        if (d > pad + 1e-9) continue;
        const score = d * 1e6 + r.w * r.h;
        if (score < best) [best, hit] = [score, it.id];
      }
      return hit;
    };
    const ms = items.filter((it) => it.kind === 'milestone');
    const front = items.filter((it) => it.kind === 'box' && !behind(it));
    const back = items.filter(behind);
    const found =
      pick(items.filter((it) => it.kind === 'box' && it.front), body) ??
      pick(ms, body, 2 * px) ??
      pick(front, body) ??
      pick(ms, body, 10 * px) ??
      pick([...front, ...ms], text) ??
      pick(back, body);
    if (found) return found;
    const g = itemOf(e);
    if (g) return g.getAttribute('data-id');
    const slack = 8 * px;
    let best = Infinity;
    let hit: string | null = null;
    for (const it of items) {
      const d = Math.min(dist(body(it)), text(it) ? dist(text(it)!) : Infinity);
      if (d > slack) continue;
      const r = body(it);
      const score = it.id === selected ? -1 : d * 1e6 + r.w * r.h;
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
    // Bilder velges når knappen trykkes ned
    if ((e.target as Element | null)?.closest?.('g.images > g[data-image], .img-size, .img-rot, .img-crop, .img-pt, .img-mid, .note-tip, .note-bend, g.note-arrows > g[data-arrow]')) return;
    const g = itemOf(e);
    if (followPick) return pickFollowTarget(boxAt(e));
    if (lanePick?.from) return lanePick.click(laneAt(toMm(e.clientX, e.clientY).y)?.id ?? null);
    if (heightCopy?.from) return heightCopy.click(boxAt(e));
    if (critical.mode) {
      const id = boxAt(e);
      const b = id ? findBox(host.getPlan()!, id) : null;
      if (b) setCritical([b.id], !inLine(b, critical.line));
      return;
    }
    const tradeG = (e.target as Element | null)?.closest?.('g[data-trade]');
    if (tradeG) return selectTrade(tradeG.getAttribute('data-trade')!);
    const legG = (e.target as Element | null)?.closest?.('g[data-legend]');
    if (legG) return selectTrade(legG.getAttribute('data-legend')!);
    if (!g && inHeader(e)) return selectHeader();
    const id = boxAt(e);
    if (id && (e.shiftKey || e.ctrlKey || e.metaKey)) return toggleInGroup(id);
    const gb = id || lanePick?.from ? null : groupBarOf(e);
    if (gb) return selectLaneGroup(gb);
    const ln = id ? null : titleLaneOf(e);
    if (ln) selectLane(ln.id);
    else if (!(e.shiftKey && !id)) select(id);
  });
  sheet.addEventListener('dblclick', (e) => {
    const imgG = active ? (e.target as Element | null)?.closest?.('g.images > g[data-image]') : null;
    if (imgG) {
      // Dobbeltklikk på et bilde: beskjær
      selectImage(imgG.getAttribute('data-image')!, 'crop');
      return;
    }
    const g = itemOf(e);
    if (!g && inHeader(e)) {
      selectHeader();
      const ta = panel.querySelector<HTMLTextAreaElement>('#header-title');
      ta?.focus();
      ta?.select();
      return;
    }
    const gb = g ? null : groupBarOf(e);
    if (gb) {
      selectLaneGroup(gb);
      const inp = panel.querySelector<HTMLTextAreaElement>('#group-name');
      inp?.focus();
      inp?.select();
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
    const id = boxAt(e);
    if (!id) return;
    select(id);
    const ta = panel.querySelector<HTMLTextAreaElement>('#box-text');
    ta?.focus();
    ta?.select();
  });
  sheet.addEventListener('pointerdown', (e) => {
    if (!active || e.button !== 0 || !layoutNow || critical.mode || followPick || lanePick?.from || heightCopy?.from) return;
    const t = e.target as Element;
    let d: Drag | null = null;
    const imgHandle = t.closest('.img-size, .img-rot, .img-crop, .img-pt, .img-mid');
    const imgG = t.closest('g.images > g[data-image]');
    const areaT = t.closest('.area-pt, .area-mid, .area-edge');
    const tipT = t.closest('.note-tip, .note-bend');
    const arrowG = t.closest('g.note-arrows > g[data-arrow]');
    if (tipT && images.selected) d = tipDrag(images.selected, tipT.classList.contains('note-bend'));
    else if (arrowG) {
      // Et klikk på pilen velger teksten den kommer fra
      e.preventDefault();
      const id = arrowG.getAttribute('data-arrow')!;
      if (id !== images.selected) selectImage(id);
      swallowClick();
      return;
    } else if (areaT && !imgHandle) {
      const edge = areaT.getAttribute('data-edge') as AreaEdge;
      const i = Number(areaT.getAttribute('data-i'));
      if (areaT.classList.contains('area-pt') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        areaEdit.deletePoint(edge, i);
        swallowClick();
        return;
      }
      d = areaEdit.startDrag(edge, areaT.classList.contains('area-edge') ? 'edge' : areaT.classList.contains('area-mid') ? 'mid' : 'pt', i);
    } else if (imgHandle) {
      // Ctrl-klikk på et punkt sletter det, som i Office
      if (imgHandle.classList.contains('img-pt') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        deletePoint(Number(imgHandle.getAttribute('data-i')));
        swallowClick();
        return;
      }
      d = startImageHandle(imgHandle);
    } else if (imgG) {
      const id = imgG.getAttribute('data-image')!;
      if (id !== images.selected) selectImage(id);
      // Et symbol drar milepælen med seg, som flagget og ruteren gjør. Med Alt flyttes bare bildet.
      const ms = host.getPlan() && findImage(host.getPlan()!, id)?.milestone;
      const msItem = ms && !e.altKey ? layoutNow.items.find((i) => i.id === ms.id) : undefined;
      d = msItem ? startMove(msItem) : startImageMove(id);
    } else if (t.closest('.box-handle')) {
      const it = layoutNow.items.find((i) => i.id === selected);
      if (it?.kind === 'box') d = startBoxResize(it);
    } else if (t.closest('.lane-col-edge')) {
      d = laneWidth.startDrag();
    } else if (t.closest('.bar-edge')) {
      d = laneWidth.startBarDrag(t.closest('.bar-edge')!.getAttribute('data-group')!);
    } else if (t.closest('.lane-edge')) {
      const ln = layoutNow.lanes.find((l) => l.id === t.closest('.lane-edge')!.getAttribute('data-lane'));
      if (ln) d = startLaneResize(ln);
    } else {
      // Samme treff som et klikk, så en milepæl foran en Multi Lane-boks dras, ikke boksen bak
      const hid = boxAt(e);
      const it = hid ? layoutNow.items.find((i) => i.id === hid) : undefined;
      if (it && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        // Ctrl holdt nede før knappen trykkes: dra skyver boksene under ned, som når Ctrl trykkes
        // underveis. Blir det bare et klikk, legges boksen til eller tas ut av valget som før.
        d = startMove(it, group.includes(it.id) ? group : [it.id]);
      } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // Shift-klikk velger flere; Shift + dra på tom plass velger med rektangel.
        // Nettleseren skal ikke merke tekst i tegningen.
        e.preventDefault();
        if (!it && e.shiftKey && !titleLaneOf(e)) {
          const p = toMm(e.clientX, e.clientY);
          d = startMarquee(p.x, p.y);
        }
      } else if (it) d = startMove(it, group.includes(it.id) ? group : [it.id]);
      else {
        const ln = titleLaneOf(e);
        if (ln) d = startLaneMove(ln);
      }
    }
    if (!d) return;
    e.preventDefault();
    d.startClient = e.clientY;
    d.startClientX = e.clientX;
    if (!d.moveXY) {
      const p0 = toMm(e.clientX, e.clientY);
      d.startY = p0.y;
      d.startX = p0.x;
    }
    drag = d;
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // Flytting starter først etter noen punkter, så et vanlig klikk bare velger
    if (!drag.moved && Math.abs(e.clientY - drag.startClient) < 4 && Math.abs(e.clientX - (drag.startClientX ?? e.clientX)) < 4) return;
    drag.moved = true;
    snapOff = e.altKey;
    pushOn = e.ctrlKey || e.metaKey;
    images.shift = e.shiftKey;
    const p = toMm(e.clientX, e.clientY);
    if (drag.moveXY) drag.moveXY(p.x, p.y);
    else drag.move(p.y - drag.startY, p.x - (drag.startX ?? p.x));
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
  // Ctrl trykket eller sluppet mens musen står stille: vis skyvingen med en gang
  const pushKey = (e: KeyboardEvent) => {
    if (!drag?.moved || !drag.again || (e.key !== 'Control' && e.key !== 'Meta')) return;
    pushOn = e.type === 'keydown';
    drag.again();
  };
  window.addEventListener('keydown', pushKey);
  window.addEventListener('keyup', pushKey);

  // Høyreklikkmenyen følger det du høyreklikket: lane-navnet gir lanevalg, en boks gir
  // boksvalg, og tomt sted i lanen gir ny boks og skjulte bokser.
  const ctx = createCtxMenu();
  const areaEdit = createAreaEdit({
    accent: ACCENT,
    getPlan: () => host.getPlan(),
    layout: () => layoutNow,
    commit: (fn) => commit(fn),
    redraw: () => host.redraw(),
    overlay: () => overlay(),
    mmPerPx: () => mmPerPx(),
    snapOff: () => snapOff,
    openMenu: (x, y, title, groups, subtitle) => ctx.open(x, y, title, groups, subtitle),
  });

  const laneWidth = createLaneWidthEdit({
    accent: ACCENT,
    getPlan: () => host.getPlan(),
    layout: () => layoutNow,
    layoutOf: (p) => host.layoutOf(p),
    commit: (fn) => commit(fn),
    redraw: () => host.redraw(),
    mmPerPx: () => mmPerPx(),
    snapOff: () => snapOff,
  });

  // ---- Bilder og fritekst ----
  const imageKit = { el, calRange, syncTools, snapshot, commit, trial, panelHead, section, segmented, switchRow, btn, swatches, colorRow, lockedRow, textField, buildPanel, overlay, toMm, clamp };
  const images = createImageEdit({
    accent: ACCENT,
    host,
    sheet,
    panel,
    ctx,
    snapOff: () => snapOff,
    clearSelection: () => {
      group = [];
      selected = null;
      selectedLane = null;
      selectedHeader = false;
      selectedLaneGroup = null;
      selectedTrade = null;
      typingSession = false;
    },
    typing: () => typingSession,
    setTyping: (on) => (typingSession = on),
    redrawSoon: (ms) => (redrawTimer = window.setTimeout(() => host.redraw(), ms)),
    cancelRedraw: () => window.clearTimeout(redrawTimer),
    kit: imageKit,
    selectBox: (id) => select(id),
  });
  const { findImage, placedOf, tipDrag, imageId, changePlaced, clearImage, selectImage, setImageMode, pickImage, visibleCenter, insertImages, removeImage, duplicateImage, mmPerPx, startImageMove, startImageHandle, deletePoint, imageOverlay, buildImagePanel, imageMenu, insertNoteItem, insertItem, milestoneImageGroup } = images;

  // Lim inn: et bilde på utklippstavlen settes inn, ellers limes kopierte bokser inn
  let pasteTimer = 0;
  document.addEventListener('paste', (e) => {
    if (!active || (e.target as HTMLElement | null)?.matches?.('input, textarea, select, [contenteditable]')) return;
    window.clearTimeout(pasteTimer);
    const files = imageFiles([...(e.clipboardData?.items ?? [])].filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter((f): f is File => !!f));
    if (files.length) {
      e.preventDefault();
      void insertImages(files, images.lastPointer ?? visibleCenter());
      return;
    }
    if (clipboard.length) {
      e.preventDefault();
      pasteFromClipboard();
    }
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!active || !layoutNow) return;
    const q = toMm(e.clientX, e.clientY);
    images.lastPointer = q.x >= 0 && q.y >= 0 && q.x <= layoutNow.width && q.y <= layoutNow.height ? q : null;
    if (lanePick?.from && lanePick.hover(laneAt(q.y)?.id ?? null)) overlay();
    if (heightCopy?.from && heightCopy.hover(boxAt(e))) overlay();
  });
  sheet.addEventListener('pointerleave', () => (images.lastPointer = null));
  // Nettleserens egen dra-og-slipp av bilder i tegningen skal ikke starte: den ville lagt inn en kopi
  sheet.addEventListener('dragstart', (e) => {
    if (active) e.preventDefault();
  });
  // Dra bildefiler inn på arket
  sheet.addEventListener('dragover', (e) => {
    if (!active || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  sheet.addEventListener('drop', (e) => {
    if (!active) return;
    const files = imageFiles(e.dataTransfer?.files);
    if (!files.length) return;
    e.preventDefault();
    void insertImages(files, toMm(e.clientX, e.clientY));
  });
  sheet.addEventListener('contextmenu', (e) => {
    if (!active || !layoutNow) return;
    const plan = host.getPlan();
    const p = toMm(e.clientX, e.clientY);
    const L = layoutNow;
    // Høyreklikk på kanten av planområdet eller et punkt på den
    const areaT = (e.target as Element | null)?.closest?.('.area-pt, .area-mid, .area-edge');
    if (plan && areaT && L.area) {
      e.preventDefault();
      areaEdit.menu(e, areaT.getAttribute('data-edge') as AreaEdge, areaT.classList.contains('area-pt') ? Number(areaT.getAttribute('data-i')) : -1);
      return;
    }
    // Høyreklikk på et bilde eller et punkt i punktbeskjæringen
    const imgT = (e.target as Element | null)?.closest?.('g.images > g[data-image], .img-size, .img-rot, .img-crop, .img-pt, .img-mid, .note-tip, .note-bend, g.note-arrows > g[data-arrow]');
    if (plan && imgT) {
      e.preventDefault();
      if (imgT.classList.contains('img-pt')) {
        const i = Number(imgT.getAttribute('data-i'));
        const n = placedOf(images.selected!)?.points?.length ?? 0;
        ctx.open(e.clientX, e.clientY, 'Punkt', [
          { items: [{ label: 'Slett punkt', icon: 'trash', kbd: 'Ctrl+klikk', disabled: n <= 3, hint: n <= 3 ? 'Mangekanten må ha minst tre punkter.' : 'Kantene på hver side slås sammen.', onSelect: () => deletePoint(i) }] },
          { items: [{ label: 'Ferdig med punktene', icon: 'check', kbd: 'Enter', hint: 'Avslutter punktbeskjæringen. Bildet er fortsatt valgt.', onSelect: () => setImageMode('points') }] },
        ], 'Rediger punkter');
      } else imageMenu(e, imgT.getAttribute('data-image') ?? imgT.getAttribute('data-arrow') ?? images.selected!);
      return;
    }
    // Utenfor lanene (marger, kalender, forklaring): bare bilder kan settes inn
    const sheetMenu = () => {
      e.preventDefault();
      ctx.open(e.clientX, e.clientY, 'Arket', [{ items: [insertItem(p), insertNoteItem(p)] }]);
    };
    // Høyreklikk i forklaringen: skjul oppføringen eller endre den
    const legHit = (e.target as Element | null)?.closest?.('g[data-trade], g[data-legend]');
    if (plan && legHit) {
      e.preventDefault();
      const key = legHit.getAttribute('data-trade') ?? legHit.getAttribute('data-legend')!;
      const legMark = markOfKey(key);
      const isTrade = key !== FERIE_KEY && !legMark;
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
        ...(legMark && n
          ? [{
              items: [{
                label: n === 1 ? 'Merk valgt boks' : `Merk ${n} valgte bokser`,
                icon: legMark === 'loud' ? ('speaker' as const) : legMark === 'night' ? ('moon' as const) : ('image' as const),
                hint: `Gir boksene merket ${legMark === 'custom' ? markName('custom', plan.plan.layout.customMark?.name) : MARK_NAMES[legMark].toLowerCase()}.`,
                disabled: ids.every((id) => !!findBox(plan, id)![legMark]),
                onSelect: () => commit((pl) => setMarks(pl, ids, legMark, true)),
              }],
            }]
          : []),
        {
          items: [
            { label: isTrade ? 'Endre tekst og farge' : 'Endre tekst', icon: 'pencil', kbd: 'Klikk', hint: 'Åpner oppføringen i panelet til høyre.', onSelect: () => selectTrade(key) },
            { label: 'Skjul i forklaringen', icon: 'hide', hint: legMark ? 'Ikonene står fortsatt på boksene. Vis oppføringen igjen fra panelet når ingenting er valgt.' : 'Boksene beholder fargen. Vis den igjen fra panelet når ingenting er valgt.', onSelect: () => setLegendItem(key, { hidden: true }) },
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
        { items: [insertItem(p), insertNoteItem(p)] },
      ]);
      return;
    }
    if (!plan) return;
    if (p.x < L.laneTitleX || p.x > L.plot.x1) return sheetMenu();
    const ln = laneAt(p.y);
    const lane = ln && findLane(plan, ln.id);
    if (!ln || !lane) return sheetMenu();
    e.preventDefault();
    const hitId = boxAt(e);
    const box = hitId ? findBox(plan, hitId) : null;
    const onTitle = p.x < L.plot.x0;
    const gb = onTitle ? L.laneGroups.find((x) => p.x >= x.x0 && p.x < x.x1 && p.y >= x.y0 && p.y < x.y1) : undefined;
    const lgr = gb && findGroup(plan, gb.id);
    if (lgr) {
      ctx.open(e.clientX, e.clientY, plainText(lgr.name.replace(/\|/g, ' ')) || 'Gruppe', laneGroupMenu(groupKit(), plan, lgr), 'Gruppe');
    } else if (onTitle) {
      // Sammenslåtte lanes vises ikke igjen herfra. De skilles ut fra lanen de er slått sammen med.
      const hiddenLanes = plan.lanes.filter((x) => x.shown && x.hidden && !x.mergedInto);
      ctx.open(e.clientX, e.clientY, plainText(lane.name), [
        ...(L.compact ? [] : [{
          heading: 'Høyde',
          items: [
            { label: 'Automatisk', radio: true, checked: !lane.height, hint: 'Så høy som innholdet krever, og fyller ledig plass.', onSelect: () => commit((pl) => delete findLane(pl, ln.id)!.height) },
            { label: 'Fast', radio: true, checked: !!lane.height, hint: 'Beholder høyden. Dra i nederste kant av lane-navnet for å endre den.', onSelect: () => commit((pl) => (findLane(pl, ln.id)!.height = lines(ln.y1 - ln.y0, L.unit))) },
          ],
        }]),
        laneWidth.menu(),
        {
          items: [
            { label: 'Endre navn og farge', icon: 'pencil', kbd: 'Dobbeltklikk', hint: 'Åpner lanen i panelet til høyre.', onSelect: () => selectLane(ln.id) },
            { label: 'Ny lane over', icon: 'laneAddAbove', hint: 'Lanen lages i appen og følger ikke Project.', onSelect: () => addLaneAbove(ln.id) },
            { label: 'Ny lane under', icon: 'laneAdd', hint: 'Lanen lages i appen og følger ikke Project.', onSelect: () => addLane(ln.id) },
            { label: 'Slå sammen med …', icon: 'merge', hint: 'Klikk lanen den skal slås sammen med. Bokser og milepæler flyttes dit, og denne lanen blir borte.', disabled: !mergeTargets(plan, ln.id).length, onSelect: () => startLaneMerge(ln.id) },
          ],
        },
        { items: mergedInto(plan, ln.id).map((m) => ({ label: `Skill ut ${laneName(m.name)} igjen`, icon: 'merge' as const, hint: SPLIT_HINT, onSelect: () => splitLaneOut(m.id) })) },
        { items: laneGroupItems(groupKit(), plan, ln.id) },
        {
          items: [
            lane.manual
              ? { label: 'Slett lane', icon: 'trash', danger: true, kbd: 'Delete', hint: 'Lanen er laget i appen og blir borte. Angre med Ctrl+Z.', disabled: L.lanes.length <= 1, onSelect: () => removeLaneById(ln.id) }
              : { label: 'Skjul lane', icon: 'hide', kbd: 'Delete', hint: 'Lanen skjules. Vis den igjen fra denne menyen.', disabled: L.lanes.length <= 1, onSelect: () => removeLaneById(ln.id) },
          ],
        },
        {
          heading: hiddenLanes.length ? 'Skjulte lanes' : undefined,
          items: hiddenLanes.map((hl) => ({ label: plainText(hl.name), icon: 'show' as const, hint: 'Vis lanen igjen på samme plass.', onSelect: () => commit((pl) => delete findLane(pl, hl.id)!.hidden) })),
        },
      ], 'Lane');
    } else if (box) {
      const id = box.id;
      const ms = !!box.resolved?.isMilestone;
      const dates = box.resolved ? (ms ? formatLong(box.resolved.start) : `${formatLong(box.resolved.start)} – ${formatLong(box.resolved.finish)}`) : '';
      // Bilde som symbol: gjelder alle valgte milepæler når milepælen er blant dem
      const msIds = ms ? (group.includes(id) ? group.filter((x) => findBox(plan, x)?.resolved?.isMilestone) : [id]) : [];
      ctx.open(e.clientX, e.clientY, plainText(box.text) || (ms ? 'Milepæl' : 'Boks'), [
        ...(ms ? [milestoneImageGroup(plan, msIds)] : []),
        ...(box.manual ? [followGroup(plan, box)] : []),
        {
          items: ms
            ? []
            : [
                { label: 'Overskriftsboks', icon: 'header', checked: !!box.header, hint: 'Teksten øverst, og andre bokser kan ligge inne i boksen.', onSelect: () => setHeader(id, !box.header) },
                { label: 'Multi Lane-boks', icon: 'span', checked: box.spanTo !== undefined, hint: 'Går ned over lanen under uten å gjøre lanene høyere. Velg hvor langt i panelet, eller dra i streken nederst.', onSelect: () => setSpan(id, box.spanTo === undefined) },
                // Gjelder alle valgte bokser når boksen er blant dem
                frontMenuItem(marksTargets(plan, id), (v) => commit((pl) => setFront(pl, marksTargets(plan, id).map((x) => x.id), v))),
              ],
        },
        // Høylytt arbeid og nattarbeid: gjelder alle valgte bokser når boksen er blant dem
        ...(ms ? [] : [{ items: marksMenuItems(plan, marksTargets(plan, id), (k: MarkKind, v: boolean) => commit((pl) => setMarks(pl, marksTargets(plan, id).map((x) => x.id), k, v))) }]),
        // Datoene: gjelder alle valgte bokser når boksen er blant dem
        ...(ms ? [] : [{ items: [datesMenuItem(plan, marksTargets(plan, id), (v) => commit((pl) => setBoxDates(pl, marksTargets(plan, id).map((x) => x.id), v)))] }]),
        {
          items: [
            { label: 'Dupliser', icon: 'copy', kbd: 'Ctrl+D', hint: 'Lager en kopi rett under. Kopien følger ikke Project.', onSelect: () => { selected = id; copySelected(); } },
            { label: 'Kopier', icon: 'copy', kbd: 'Ctrl+C', hint: 'Lim inn i en annen lane med Ctrl+V eller høyreklikk der.', onSelect: () => { if (!group.includes(id)) { group = []; selected = id; } copyToClipboard(); } },
          ],
        },
        {
          items: [
            ...sameHeightItems(id),
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
      // Lengden følger visningen som er valgt i appen (måned/uke), ikke bare den fra Project
      const days = (layoutNow?.calendarMode ?? plan.plan.calendar.mode) === 'week' ? 13 : 29;
      const finishT = new Date(`${start}T00:00:00Z`);
      finishT.setUTCDate(finishT.getUTCDate() + days);
      const finish = [finishT.toISOString().slice(0, 10), calRange(plan).end].sort()[0];
      const hiddenBoxes = lane.boxes.filter((b) => b.hidden);
      ctx.open(e.clientX, e.clientY, plainText(lane.name), [
        {
          items: [
            {
              label: `Ny boks fra ${formatLong(start)}`,
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
            {
              label: `Ny milepæl ${formatLong(start)}`,
              icon: 'flag',
              hint: 'Milepælen lages i appen og følger ikke Project.',
              onSelect: () => {
                let made: Box | null = null;
                commit((pl) => {
                  made = newMilestone(pl, ln.id, start);
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
                      addSymbols(pl, made.map((b, i) => [clipboard[i].symbol, b]));
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
          items: hiddenBoxes.map((hb) => ({ label: plainText(hb.text) || '(uten tekst)', icon: 'show' as const, hint: 'Vis boksen igjen på samme plass.', onSelect: () => commit((pl) => delete findBox(pl, hb.id)!.hidden) })),
        },
        { items: [insertItem(p), insertNoteItem(p)] },
      ], 'Lane');
    }
  });

  toggle.addEventListener('click', () => {
    active = !active;
    if (!active) {
      endArrange();
      endFollowPick();
      lanePick?.end();
      heightCopy?.end();
      critical.stop();
      selected = null;
      selectedLane = null;
      selectedHeader = false;
      selectedLaneGroup = null;
    clearImage();
      group = [];
    }
    buildPanel();
    overlay();
    syncTools();
  });
  criticalBtn?.addEventListener('click', () => setCriticalMode(!critical.mode));
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
    // Lanene først: da er sammenslåinger opphevet, og boksene flyttes tilbake til lanen de kom fra
    plan.lanes.forEach((l) => resetLane(l));
    const ids = plan.lanes.flatMap((l) => l.boxes.map((b) => b.id));
    ids.forEach((id) => resetBoxInPlan(plan, id));
    delete plan.plan.layout.tradeColors;
    delete plan.plan.layout.innerEdge;
    delete plan.plan.layout.laneTitleScale;
    delete plan.plan.layout.laneTitleWidth;
    delete plan.plan.layout.legendItems;
    delete plan.plan.layout.headerRightScale;
    delete plan.plan.layout.legendScale;
    delete plan.plan.layout.logoScale;
    delete plan.plan.layout.markScale;
    host.redraw();
    buildPanel();
    syncTools();
  });
  followBar?.querySelector('#follow-cancel')?.addEventListener('click', () => endFollowPick());

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const inField = t.matches?.('input, textarea, select');
    const mod = e.ctrlKey || e.metaKey;
    // Utenfor redigering angrer Ctrl+Z også, f.eks. en innstilling eller en oppdatering fra Project
    if (!active) {
      const k = e.key.toLowerCase();
      if (!mod || inField || e.altKey || !host.getPlan() || (k !== 'z' && k !== 'y')) return;
      e.preventDefault();
      if (k === 'z' && !e.shiftKey) undo();
      else redo();
      return;
    }
    // Esc avbryter fargeprøvingen, Enter beholder fargene. Også rett etter at fargevelgeren er lukket.
    if (!mod && panel.querySelector('.color-trial')) {
      const esc = e.key === 'Escape' && (!inField || t.matches('input[type=color]'));
      // Enter på en knapp eller et felt gjør det den ellers gjør
      const enter = e.key === 'Enter' && !inField && !t.closest?.('button, a, [role=button]');
      if (esc || enter) {
        e.preventDefault();
        if (esc) cancelTrial();
        else keepTrial();
        return;
      }
    }
    if (e.key === 'Escape') {
      if (inField) t.blur();
      else if (followPick) endFollowPick();
      else if (lanePick?.from) lanePick.end();
      else if (heightCopy?.from) heightCopy.end();
      else if (critical.mode) setCriticalMode(false);
      else if (images.selected && images.mode !== 'none') setImageMode(images.mode);
      else select(null);
      return;
    }
    if (!inField && images.selected) {
      if (e.key === 'Enter' && images.mode !== 'none') {
        e.preventDefault();
        setImageMode(images.mode);
        return;
      }
      if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        if (images.mode === 'points' && images.activePoint >= 0) deletePoint(images.activePoint);
        else removeImage(images.selected);
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateImage(images.selected);
        return;
      }
      // Piltaster flytter bildet 1 mm, med Shift 5 mm. Festet til dato: bare opp og ned.
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const a = arrows[e.key];
      if (a && !mod && images.mode === 'none') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const id = images.selected;
        changePlaced(id, (q) => ({ ...q, cx: q.date ? q.cx : q.cx + a[0] * step, cy: q.cy + a[1] * step }), `image:${id}`);
        return;
      }
    }
    // Piltast opp/ned flytter valgt boks en kvart linje i lanen, med Shift en hel linje
    if (!inField && !mod && !e.altKey && selected && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && layoutNow) {
      const L = layoutNow;
      const it = L.items.find((i) => i.id === selected);
      const ln = it?.kind === 'box' && !it.span ? laneAt(it.y) : null;
      if (it?.kind === 'box' && ln) {
        e.preventDefault();
        const step = (e.shiftKey ? 1 : 0.25) * (e.key === 'ArrowUp' ? -1 : 1);
        const at = Math.max(0, Math.round((lines(it.y - ln.top, L.unit) + step) * 4) / 4);
        const id = selected;
        commit((pl) => {
          const b = findBox(pl, id);
          if (!b) return;
          if (L.compact) b.compactTop = at;
          else b.top = at;
        }, `box:${id}`);
        return;
      }
    }
    if (!inField && !mod && (e.key === 'Delete' || e.key === 'Backspace') && selectedLaneGroup) {
      e.preventDefault();
      dissolveGroup(selectedLaneGroup);
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
      if (copyToClipboard()) {
        e.preventDefault();
        // Teksten legges også på utklippstavlen, så et eldre bilde der ikke limes inn i stedet for boksene
        void navigator.clipboard?.writeText(clipboard.map((c) => plainText(c.box.text)).join('\n')).catch(() => {});
      }
      return;
    }
    // Lim inn håndteres i paste-hendelsen, så et bilde på utklippstavlen kan settes inn.
    // Kommer ingen paste-hendelse (eldre nettlesere), limes kopierte bokser inn likevel.
    if (k === 'v' && clipboard.length) {
      window.clearTimeout(pasteTimer);
      pasteTimer = window.setTimeout(pasteFromClipboard, 60);
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
      images.afterDraw(svg, layout);
      if (selected && !layout.items.some((i) => i.id === selected)) {
        // Boksen tegnes ikke lenger (f.eks. skjult), men kan fortsatt redigeres i panelet
      }
      overlay();
    },
    reset() {
      endArrange();
      endFollowPick();
      lanePick?.end();
      heightCopy?.end();
      past = [];
      future = [];
      dirty = false;
      // Ingenting fra forrige plan følger med til den neste
      recordKey = null;
      nudge = null;
      typingSession = false;
      colorTrial = null;
      critical.clearFilter();
      selectedTrade = null;
      selected = null;
      selectedLane = null;
      selectedHeader = false;
      selectedLaneGroup = null;
    clearImage();
      group = [];
      buildPanel();
      syncTools();
    },
    owns: (e) => (active && !!(e.target as Element | null)?.closest?.('g.images > g[data-image], g.note-arrows > g[data-arrow]')) || !!itemOf(e) || (e instanceof MouseEvent && !!boxAt(e)) || (active && e instanceof MouseEvent && e.shiftKey) || (active && !!(e.target as Element | null)?.closest?.('g[data-trade], g[data-legend]')) || (active && !!(e.target as Element | null)?.closest?.('.edit-handle')) || (e instanceof MouseEvent && (!!titleLaneOf(e) || inHeader(e))),
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
    criticalView,
    record(key) {
      if (key && key === recordKey) return;
      snapshot();
      recordKey = key ?? null;
      typingSession = false;
      syncTools();
    },
    replacePlan(p) {
      endFollowPick();
      lanePick?.end();
      heightCopy?.end();
      snapshot();
      host.setPlan(p);
      selected = null;
      selectedLane = null;
      selectedHeader = false;
      selectedLaneGroup = null;
    clearImage();
      group = [];
      typingSession = false;
      host.redraw();
      buildPanel();
      syncTools();
    },
  };
}
