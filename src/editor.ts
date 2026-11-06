// Redigering i tegningen: velg en boks, endre den i panelet, angre og gjør om.
// Endringene skrives rett inn i planen (som valgfrie felt på boksen), så de følger med i arbeidsfilen.
import type { Box, Lane, PlanFile, Rotation } from './format/types';
import type { BoxItem, Item, LaneLayout, Layout } from './layout/layout';

const NS = 'http://www.w3.org/2000/svg';
const MAX_HISTORY = 100;
const ACCENT = '#1F5FBF';

export interface EditorHost {
  getPlan(): PlanFile | null;
  setPlan(p: PlanFile): void;
  redraw(): void;
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
export function isEdited(b: Box): boolean {
  return !!(b.fill || b.textColor || (b.callout && b.callout !== 'auto') || (b.calloutSide && b.calloutSide !== 'auto') || b.original || b.height || b.top !== undefined || b.hidden || b.fromLane || b.manual || b.header);
}

/** Fjerner alt brukeren har overstyrt, og setter tekst og rotasjon tilbake. */
export function resetBox(b: Box): void {
  if (b.original) {
    b.text = b.original.text;
    b.rotation = b.original.rotation;
  }
  delete b.original;
  delete b.fill;
  delete b.textColor;
  delete b.callout;
  delete b.calloutSide;
  delete b.height;
  delete b.top;
  delete b.hidden;
  delete b.header;
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
  delete b.original;
  delete b.fromLane;
  delete b.hidden;
  lane.boxes.splice(lane.boxes.indexOf(src) + 1, 0, b);
  return b;
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

/** Har brukeren endret lanen? */
export function isLaneEdited(l: Lane): boolean {
  return !!(l.original || l.height || l.hidden || l.manual);
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

function bounds(it: Item) {
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

export function createEditor(host: EditorHost, sheet: HTMLElement, panel: HTMLElement, toggle: HTMLButtonElement, tools: HTMLElement): Editor {
  let active = false;
  let selected: string | null = null;
  /** Valgt lane (klikk i lane-kolonnen). Bare én av boks og lane er valgt om gangen. */
  let selectedLane: string | null = null;
  let past: PlanFile[] = [];
  let future: PlanFile[] = [];
  let dirty = false;
  /** Skriving i tekstfeltet samles til ett angre-steg per økt i feltet. */
  let typingSession = false;
  let svgNow: SVGSVGElement | null = null;
  let layoutNow: Layout | null = null;
  let redrawTimer = 0;

  const undoBtn = tools.querySelector<HTMLButtonElement>('#undo')!;
  const redoBtn = tools.querySelector<HTMLButtonElement>('#redo')!;
  const resetAllBtn = tools.querySelector<HTMLButtonElement>('#reset-all')!;
  const marksBtn = tools.querySelector<HTMLButtonElement>('#show-marks');
  /** Blå prikk på bokser brukeren har endret. Kan skjules for å se planen slik den blir. */
  let showMarks = true;

  const syncTools = () => {
    toggle.setAttribute('aria-pressed', String(active));
    tools.hidden = !active;
    undoBtn.disabled = !past.length;
    redoBtn.disabled = !future.length;
    const plan = host.getPlan();
    resetAllBtn.disabled = !plan || !plan.lanes.some((l) => (isLaneEdited(l) && !l.manual) || l.boxes.some(isEdited));
    sheet.classList.toggle('editing', active);
  };

  /** Tar vare på planen før en endring, så den kan angres. */
  const snapshot = () => {
    const plan = host.getPlan();
    if (!plan) return;
    past.push(structuredClone(plan));
    if (past.length > MAX_HISTORY) past.shift();
    future = [];
    dirty = true;
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
      if (L && it?.kind === 'box' && ln) {
        if (b.top === undefined) b.top = lines(it.y - ln.top, L.unit);
        b.height = Math.max(b.height ?? 0, lines(it.h, L.unit) + 2);
      }
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

  const copySelected = () => {
    if (!selected) return;
    let made: Box | null = null;
    const id = selected;
    commit((pl) => (made = copyBox(pl, id)));
    if (made) select((made as Box).id);
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
    to.push(structuredClone(plan));
    host.setPlan(prev);
    dirty = true;
    typingSession = false;
    if (selected && !findBox(prev, selected)) selected = null;
    if (selectedLane && !findLane(prev, selectedLane)) selectedLane = null;
    host.redraw();
    buildPanel();
    syncTools();
  };
  const undo = () => restore(past, future);
  const redo = () => restore(future, past);

  // ---- Panelet ----
  const segmented = <T extends string | number>(label: string, value: T, options: [T, string][], onPick: (v: T) => void) => {
    const wrap = el('div', { class: 'prop' });
    wrap.append(el('span', { class: 'prop-label' }, label));
    const g = el('div', { class: 'group', role: 'group', 'aria-label': label });
    for (const [v, text] of options) {
      const b = el('button', { type: 'button', 'aria-pressed': String(v === value) }, text);
      b.addEventListener('click', () => onPick(v));
      g.append(b);
    }
    wrap.append(g);
    return wrap;
  };

  const buildLanePanel = (plan: PlanFile, l: Lane) => {
    const head = el('div', { class: 'panel-head' });
    head.append(el('h2', {}, 'Lane'));
    const close = el('button', { type: 'button', class: 'icon', title: 'Lukk (Esc)', 'aria-label': 'Lukk' }, '×');
    close.addEventListener('click', () => select(null));
    head.append(close);
    panel.append(head);
    if (l.manual) panel.append(el('p', { class: 'muted small' }, 'Laget i appen, følger ikke Project.'));

    const nw = el('label', { class: 'prop' });
    nw.append(el('span', { class: 'prop-label' }, 'Navn'));
    const ta = el('textarea', { id: 'lane-name', rows: '2', spellcheck: 'true' }) as HTMLTextAreaElement;
    ta.value = l.name;
    ta.addEventListener('focus', () => (typingSession = false));
    ta.addEventListener('input', () =>
      changeLane((x) => {
        keepLaneOriginal(x);
        x.name = ta.value;
      }, { typing: true, rebuild: false }),
    );
    ta.addEventListener('blur', () => {
      typingSession = false;
      syncTools();
    });
    nw.append(ta, el('span', { class: 'hint' }, 'Skriv | for linjeskift.'));
    panel.append(nw);

    const cw = el('div', { class: 'prop' });
    cw.append(el('span', { class: 'prop-label' }, 'Farge'));
    const sw = el('div', { class: 'swatches' });
    const now = (l.fill ?? '#FFFFFF').toUpperCase();
    const seen = new Set<string>();
    const swatch = (fill: string, name: string) => {
      const key = fill.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      const s = el('button', { type: 'button', class: 'swatch', title: name, 'aria-label': name, 'aria-pressed': String(now === key) });
      s.style.background = fill;
      s.addEventListener('click', () =>
        changeLane((x) => {
          keepLaneOriginal(x);
          x.fill = key;
        }),
      );
      sw.append(s);
    };
    LANE_COLORS.forEach((c) => swatch(c, c === '#FFFFFF' ? 'Hvit' : 'Lanefarge'));
    plan.lanes.filter((x) => x.fill).forEach((x) => swatch(x.fill!, 'Brukt i planen'));
    cw.append(sw);
    const row = el('div', { class: 'row' });
    const custom = el('input', { type: 'color', title: 'Egen farge', 'aria-label': 'Egen farge' }) as HTMLInputElement;
    custom.value = now.toLowerCase();
    custom.addEventListener('change', () =>
      changeLane((x) => {
        keepLaneOriginal(x);
        x.fill = custom.value.toUpperCase();
      }),
    );
    row.append(custom, el('span', { class: 'small' }, 'Egen farge'));
    if (l.original) {
      const back = el('button', { type: 'button', class: 'button small' }, 'Fargen fra Project');
      back.disabled = (l.original.fill ?? '').toUpperCase() === (l.fill ?? '').toUpperCase();
      back.addEventListener('click', () => changeLane((x) => (x.fill = x.original ? x.original.fill : x.fill)));
      row.append(back);
    }
    cw.append(row);
    panel.append(cw);

    panel.append(
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
    const ow = el('div', { class: 'prop' });
    ow.append(el('span', { class: 'prop-label' }, 'Rekkefølge'));
    const orow = el('div', { class: 'row' });
    const up = el('button', { type: 'button', class: 'button small' }, '↑ Flytt opp');
    up.disabled = pos <= 0;
    up.addEventListener('click', () => stepLane(l.id, -1));
    const down = el('button', { type: 'button', class: 'button small' }, '↓ Flytt ned');
    down.disabled = pos < 0 || pos >= vis.length - 1;
    down.addEventListener('click', () => stepLane(l.id, 1));
    orow.append(up, down);
    ow.append(orow, el('p', { class: 'hint' }, 'Du kan også dra lane-navnet opp eller ned.'));
    panel.append(ow);

    const add = el('button', { type: 'button', class: 'button', title: 'Ny lane rett under denne' }, 'Ny lane');
    add.addEventListener('click', () => addLane(l.id));
    const del = el('button', { type: 'button', class: 'button', title: l.manual ? 'Slett lanen. Egne bokser i den slettes, bokser fra Project flyttes tilbake. (Delete)' : 'Skjul lanen. Høyreklikk en lane for å vise den igjen. (Delete)' }, l.manual ? 'Slett' : 'Skjul');
    del.disabled = vis.length <= 1 && pos >= 0;
    del.addEventListener('click', () => removeLaneById(l.id));
    const reset = el('button', { type: 'button', class: 'button', title: 'Navn og farge fra Project, og automatisk høyde' }, 'Tilbakestill lane');
    reset.disabled = l.manual || !isLaneEdited(l);
    reset.addEventListener('click', () => changeLane((x) => resetLane(x)));
    const foot = el('div', { class: 'panel-foot row' });
    foot.append(add, del, reset);
    panel.append(foot);
  };

  const buildPanel = () => {
    const plan = host.getPlan();
    const b = active && plan && selected ? findBox(plan, selected) : null;
    // Panelet står åpent hele tiden i redigering, så arket ikke skifter størrelse når du velger
    panel.hidden = !active || !plan;
    panel.replaceChildren();
    if (!plan || !active) return;
    const lane = !b && selectedLane ? findLane(plan, selectedLane) : null;
    if (lane) return buildLanePanel(plan, lane);
    if (!b) {
      panel.append(el('h2', { class: 'panel-empty-title' }, 'Rediger'));
      const tips = el('ul', { class: 'tips' });
      for (const t of [
        'Klikk en boks for å velge den. Dobbeltklikk for å skrive.',
        'Dra en boks opp eller ned for å gi den fast plass i lanen.',
        'Dra i den blå streken under valgt boks for å endre høyden.',
        'Dra i nederste kant av en lane for å gi den fast høyde.',
        'Dra en boks til en annen lane for å flytte den dit.',
        'Klikk et lane-navn for å endre navn og farge. Dra navnet opp eller ned for ny rekkefølge.',
        'Høyreklikk en lane for ny boks, ny lane, lanehøyde og skjulte bokser.',
        'Ctrl+D kopierer valgt boks. Delete skjuler den.',
        'Ctrl+Z angrer, Ctrl+Y gjør om.',
      ])
        tips.append(el('li', {}, t));
      panel.append(tips);
      return;
    }
    const ms = !!b.resolved?.isMilestone;
    const head = el('div', { class: 'panel-head' });
    head.append(el('h2', {}, ms ? 'Milepæl' : 'Boks'));
    const close = el('button', { type: 'button', class: 'icon', title: 'Lukk (Esc)', 'aria-label': 'Lukk' }, '×');
    close.addEventListener('click', () => select(null));
    head.append(close);
    panel.append(head);
    if (b.manual && b.resolved) {
      // Boks laget i appen: datoene velges her
      const dw = el('div', { class: 'prop' });
      dw.append(el('span', { class: 'prop-label' }, 'Laget i appen, følger ikke Project'));
      const row = el('div', { class: 'row dates' });
      const mk = (key: 'start' | 'finish', label: string) => {
        const lab = el('label', { class: 'small' }, label);
        const inp = el('input', { type: 'date', value: b.resolved![key], min: plan.plan.calendar.start, max: plan.plan.calendar.end }) as HTMLInputElement;
        inp.addEventListener('change', () => {
          const v = inp.value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
          change((x) => {
            if (!x.resolved) return;
            x.resolved[key] = v;
            if (x.resolved.start > x.resolved.finish) x.resolved[key === 'start' ? 'finish' : 'start'] = v;
          });
        });
        lab.append(inp);
        row.append(lab);
      };
      mk('start', 'Fra');
      mk('finish', 'Til');
      dw.append(row);
      panel.append(dw);
    } else if (b.resolved) panel.append(el('p', { class: 'muted small' }, `${b.resolved.start.split('-').reverse().join('.')} til ${b.resolved.finish.split('-').reverse().join('.')}${b.resolved.trade && b.resolved.trade !== '(none)' ? ` · ${b.resolved.trade}` : ''}`));

    // Tekst
    const tw = el('label', { class: 'prop' });
    tw.append(el('span', { class: 'prop-label' }, 'Tekst'));
    const ta = el('textarea', { id: 'box-text', rows: '3', spellcheck: 'true' }) as HTMLTextAreaElement;
    ta.value = b.text;
    ta.addEventListener('focus', () => (typingSession = false));
    ta.addEventListener('input', () =>
      change((x) => {
        keepOriginal(x);
        x.text = ta.value;
      }, { typing: true, rebuild: false }),
    );
    ta.addEventListener('blur', () => {
      typingSession = false;
      syncTools();
    });
    tw.append(ta, el('span', { class: 'hint' }, 'Skriv | for linjeskift og /| for en loddrett strek.'));
    panel.append(tw);
    if (ms) {
      panel.append(el('p', { class: 'muted small' }, 'Symbol og farge på milepæler kommer i et senere trinn.'));
    } else {
      // Bakgrunnsfarge: alle fagfarger og lanefarger, pluss egen farge. Ingen farger fjernes.
      const cw = el('div', { class: 'prop' });
      cw.append(el('span', { class: 'prop-label' }, 'Bakgrunn'));
      const sw = el('div', { class: 'swatches' });
      const seen = new Set<string>();
      const swatch = (fill: string, name: string) => {
        const key = fill.toUpperCase();
        if (seen.has(key)) return;
        seen.add(key);
        const s = el('button', { type: 'button', class: 'swatch', title: name, 'aria-label': name, 'aria-pressed': String((b.fill ?? '').toUpperCase() === key) });
        s.style.background = fill;
        s.addEventListener('click', () => change((x) => (x.fill = key)));
        sw.append(s);
      };
      plan.colors.filter((c) => c.fill).forEach((c) => swatch(c.fill!, c.name === '(none)' ? 'Uten fag' : c.name));
      plan.lanes.filter((l) => l.fill).forEach((l) => swatch(l.fill!, 'Lanefarge'));
      cw.append(sw);
      const row = el('div', { class: 'row' });
      const custom = el('input', { type: 'color', title: 'Egen farge', 'aria-label': 'Egen farge' }) as HTMLInputElement;
      custom.value = b.fill ?? '#FFFFFF';
      custom.addEventListener('change', () => change((x) => (x.fill = custom.value.toUpperCase())));
      const tradeBtn = el('button', { type: 'button', class: 'button small' }, 'Fagets farge');
      tradeBtn.disabled = !b.fill;
      tradeBtn.addEventListener('click', () => change((x) => delete x.fill));
      row.append(custom, el('span', { class: 'small' }, 'Egen farge'), tradeBtn);
      cw.append(row);
      panel.append(cw);

      const tc = b.textColor === '#000000' ? 'black' : b.textColor === '#FFFFFF' ? 'white' : 'auto';
      panel.append(
        segmented('Tekstfarge', tc, [['auto', 'Auto'], ['black', 'Svart'], ['white', 'Hvit']], (v) =>
          change((x) => {
            if (v === 'auto') delete x.textColor;
            else x.textColor = v === 'black' ? '#000000' : '#FFFFFF';
          }),
        ),
      );
      panel.append(
        segmented('Callout', b.callout ?? 'auto', [['auto', 'Auto'], ['on', 'På'], ['off', 'Av']], (v) =>
          change((x) => {
            if (v === 'auto') delete x.callout;
            else x.callout = v;
          }),
        ),
      );
      panel.append(
        segmented('Callout-side', b.calloutSide ?? 'auto', [['auto', 'Auto'], ['left', 'Venstre'], ['right', 'Høyre']], (v) =>
          change((x) => {
            if (v === 'auto') delete x.calloutSide;
            else x.calloutSide = v;
          }),
        ),
      );
      panel.append(
        segmented('Type', b.header ? 'header' : 'normal', [['normal', 'Vanlig'], ['header', 'Overskriftsboks']], (v) => setHeader(b.id, v === 'header')),
      );
      if (b.header) panel.append(el('p', { class: 'hint' }, 'Teksten står øverst. Dra andre bokser inn i den; de flyttes med når du flytter overskriftsboksen.'));
      panel.append(
        segmented<Rotation>('Rotert tekst', b.rotation, [[0, 'Ingen'], [90, '90°'], [-90, '−90°']], (v) =>
          change((x) => {
            keepOriginal(x);
            x.rotation = v;
          }),
        ),
      );
      if (b.rotation !== 0) panel.append(el('p', { class: 'hint' }, 'Rotert tekst får ikke callout.'));
    }
    const pw = el('div', { class: 'prop' });
    pw.append(el('span', { class: 'prop-label' }, 'Høyde og plass'));
    const prow = el('div', { class: 'row' });
    if (!ms) {
      const hb = el('button', { type: 'button', class: 'button small', title: 'Så høy som teksten krever' }, 'Standard høyde');
      hb.disabled = !b.height;
      hb.addEventListener('click', () => change((x) => delete x.height));
      prow.append(hb);
    }
    const lb = el('button', { type: 'button', class: 'button small', title: 'La appen velge plassen i lanen igjen' }, 'Løsne');
    lb.disabled = b.top === undefined;
    lb.addEventListener('click', () => change((x) => delete x.top));
    prow.append(lb);
    pw.append(prow, el('p', { class: 'hint' }, ms ? 'Dra milepælen opp eller ned for å gi den fast plass.' : 'Dra boksen opp eller ned for å gi den fast plass. Dra i den blå streken nederst for å endre høyden.'));
    panel.append(pw);
    const reset = el('button', { type: 'button', class: 'button' }, 'Tilbakestill boks');
    reset.disabled = !isEdited(b);
    reset.title = 'Fjerner det du har endret, så appens forslag gjelder igjen';
    reset.addEventListener('click', () => commit((pl) => resetBoxInPlan(pl, b.id)));
    const copy = el('button', { type: 'button', class: 'button', title: 'Lag en kopi rett under (Ctrl+D)' }, 'Kopier');
    copy.addEventListener('click', () => copySelected());
    const del = el('button', { type: 'button', class: 'button', title: b.manual ? 'Slett boksen (Delete)' : 'Skjul boksen. Høyreklikk lanen for å vise den igjen. (Delete)' }, b.manual ? 'Slett' : 'Skjul');
    del.addEventListener('click', () => removeSelected());
    const foot = el('div', { class: 'panel-foot row' });
    foot.append(copy, del, reset);
    panel.append(foot);
  };

  // ---- Markeringer i tegningen (kommer ikke med i PDF eller utskrift) ----
  const overlay = () => {
    if (!svgNow || !layoutNow) return;
    svgNow.querySelector('g.edit-overlay:not(.edit-ghost)')?.remove();
    if (!active) return;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'edit-overlay');
    g.setAttribute('pointer-events', 'none');
    const plan = host.getPlan();
    for (const it of layoutNow.items) {
      const b = plan ? findBox(plan, it.id) : null;
      const r = bounds(it);
      if (it.id === selected) {
        const rect = document.createElementNS(NS, 'rect');
        const pad = 0.6;
        for (const [k, v] of Object.entries({ x: r.x0 - pad, y: r.y0 - pad, width: r.x1 - r.x0 + 2 * pad, height: r.y1 - r.y0 + 2 * pad, fill: 'none', stroke: ACCENT, 'stroke-width': 0.5, rx: 0.6 }))
          rect.setAttribute(k, String(v));
        g.append(rect);
      }
      if (showMarks && b && isEdited(b)) {
        const c = document.createElementNS(NS, 'circle');
        for (const [k, v] of Object.entries({ cx: r.x1, cy: r.y0, r: 0.9, fill: ACCENT, stroke: '#FFFFFF', 'stroke-width': 0.3 })) c.setAttribute(k, String(v));
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
      line(layoutNow.laneTitleX, layoutNow.plot.x0, ln.y1, { class: 'edit-handle lane-edge', 'data-lane': ln.id, stroke: 'transparent', 'stroke-width': 8, 'pointer-events': 'stroke' });
    }
    const sel = layoutNow.items.find((i) => i.id === selected);
    if (sel?.kind === 'box') {
      const w = sel.x1 - sel.x0;
      line(sel.x0 + w * 0.25, sel.x1 - w * 0.25, sel.y + sel.h, { stroke: ACCENT, 'stroke-width': 3, 'stroke-linecap': 'round' });
      line(sel.x0, sel.x1, sel.y + sel.h, { class: 'edit-handle box-handle', stroke: 'transparent', 'stroke-width': 10, 'pointer-events': 'stroke' });
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

  const startBoxResize = (it: BoxItem): Drag | null => {
    const lane = laneAt(it.y);
    if (!lane || !layoutNow) return null;
    const unit = layoutNow.unit;
    const pad = lane.top - lane.y0;
    const minH = it.minH ?? it.h;
    const maxH = Math.max(minH, lane.y1 - pad - it.y);
    const g = ghostLayer();
    const r = shape(g, 'rect', { x: it.x0, y: it.y, width: it.x1 - it.x0, height: it.h, fill: ACCENT, 'fill-opacity': 0.15, stroke: ACCENT, 'stroke-width': 0.4, 'stroke-dasharray': '1 0.6' });
    let h = it.h;
    return {
      startY: it.y + it.h,
      startClient: 0,
      moved: false,
      move(dy) {
        // Trinn på en kvart tekstlinje
        h = clamp(Math.round((it.h + dy) / (unit / 4)) * (unit / 4), minH, maxH);
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
          // Boksen blir stående der den er; de andre flyttes rundt den
          if (b.top === undefined) b.top = lines(it.y - lane.top, unit);
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
    const fh = r.y1 - r.y0;
    let lane = home;
    let g: SVGGElement | null = null;
    let rect: SVGRectElement | null = null;
    let target: SVGRectElement | null = null;
    let y = r.y0;
    return {
      startY: r.y0,
      startClient: 0,
      moved: false,
      move(dy) {
        if (!g) {
          g = ghostLayer();
          // Lanen boksen havner i, markert svakt
          target = shape(g, 'rect', { x: L.laneTitleX, y: home.y0, width: L.plot.x1 - L.laneTitleX, height: home.y1 - home.y0, fill: ACCENT, 'fill-opacity': 0.06 });
          rect = shape(g, 'rect', { x: r.x0, y: r.y0, width: r.x1 - r.x0, height: fh, fill: ACCENT, 'fill-opacity': 0.15, stroke: ACCENT, 'stroke-width': 0.4, 'stroke-dasharray': '1 0.6' });
        }
        // Boksen kan dras til en annen lane; midten av boksen bestemmer hvilken
        const first = L.lanes[0];
        const last = L.lanes[L.lanes.length - 1];
        lane = laneAt(clamp(r.y0 + dy + fh / 2, first.y0, last.y1 - 1e-3)) ?? home;
        const pad = lane.top - lane.y0;
        const maxY = Math.max(lane.top, lane.y1 - pad - fh);
        y = clamp(lane.top + Math.round((r.y0 + dy - lane.top) / (unit / 4)) * (unit / 4), lane.top, maxY);
        set(rect!, { y });
        set(target!, { y: lane.y0, height: lane.y1 - lane.y0, 'fill-opacity': lane === home ? 0 : 0.06 });
      },
      end() {
        g?.remove();
        if (Math.abs(y - r.y0) < 1e-6 && lane === home) return;
        selected = it.id;
        // En overskriftsboks tar med seg boksene som ligger inne i den
        const kids = it.kind === 'box' && it.header
          ? L.items.filter((o) => {
              if (o === it) return false;
              const q = bounds(o);
              return q.x0 >= r.x0 - 1e-6 && q.x1 <= r.x1 + 1e-6 && q.y0 >= r.y0 - 1e-6 && q.y1 <= r.y1 + 1e-6;
            }).map((o) => ({ id: o.id, dy: bounds(o).y0 - r.y0 }))
          : [];
        commit((plan) => {
          for (const m of [{ id: it.id, dy: 0 }, ...kids]) {
            if (lane !== home) moveBox(plan, m.id, lane.id);
            const b = findBox(plan, m.id);
            if (b) b.top = lines(y + m.dy - lane.top, unit);
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
    selectedLane = null;
    typingSession = false;
    buildPanel();
    overlay();
  };

  const selectLane = (id: string | null) => {
    selected = null;
    selectedLane = id;
    typingSession = false;
    buildPanel();
    overlay();
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
  sheet.addEventListener('click', (e) => {
    if (!active) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const g = itemOf(e);
    const ln = g ? null : titleLaneOf(e);
    if (ln) selectLane(ln.id);
    else select(g ? g.getAttribute('data-id') : null);
  });
  sheet.addEventListener('dblclick', (e) => {
    const g = itemOf(e);
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
    if (!active || e.button !== 0 || !layoutNow) return;
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
      if (it) d = startMove(it);
      else {
        const ln = titleLaneOf(e);
        if (ln) d = startLaneMove(ln);
      }
    }
    if (!d) return;
    e.preventDefault();
    d.startClient = e.clientY;
    d.startY = toMm(e.clientX, e.clientY).y;
    drag = d;
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // Flytting starter først etter noen punkter, så et vanlig klikk bare velger
    if (!drag.moved && Math.abs(e.clientY - drag.startClient) < 4) return;
    drag.moved = true;
    drag.move(toMm(e.clientX, e.clientY).y - drag.startY);
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

  // Høyreklikk på en lane: automatisk eller fast høyde
  // Lukkes av koden: på Mac og Linux kommer høyreklikket før museknappen slippes,
  // og nettleserens egen lukking ville da lukke menyen med en gang.
  const menu = el('div', { class: 'pop pop-menu no-print', popover: 'manual' });
  document.body.append(menu);
  const closeMenu = () => menu.matches(':popover-open') && menu.hidePopover();
  document.addEventListener('pointerdown', (e) => !menu.contains(e.target as Node) && closeMenu(), true);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());
  window.addEventListener('blur', closeMenu);
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('button')) menu.hidePopover();
  });
  sheet.addEventListener('contextmenu', (e) => {
    if (!active || !layoutNow) return;
    const plan = host.getPlan();
    const p = toMm(e.clientX, e.clientY);
    const L = layoutNow;
    if (!plan || p.x < L.laneTitleX || p.x > L.plot.x1) return;
    const ln = laneAt(p.y);
    const lane = ln && findLane(plan, ln.id);
    if (!ln || !lane) return;
    e.preventDefault();
    const g = itemOf(e);
    const box = g ? findBox(plan, g.getAttribute('data-id')!) : null;
    const item = (label: string, note: string, pressed: boolean | null, fn: () => void, disabled = false) => {
      const b = el('button', { type: 'button' });
      if (pressed !== null) b.setAttribute('aria-pressed', String(pressed));
      b.append(el('strong', {}, `${pressed ? '✓ ' : ''}${label}`), el('span', {}, note));
      b.disabled = disabled;
      b.addEventListener('click', fn);
      menu.append(b);
    };
    menu.replaceChildren(el('p', { class: 'pop-title' }, `Lane: ${lane.name.replace(/\/?\|/g, ' ')}`));
    item('Automatisk høyde', 'Så høy som innholdet krever, og fyller ledig plass.', !lane.height, () => commit((pl) => delete findLane(pl, ln.id)!.height));
    item('Fast høyde', 'Beholder høyden. Dra i nederste kant for å endre den.', !!lane.height, () => commit((pl) => (findLane(pl, ln.id)!.height = lines(ln.y1 - ln.y0, L.unit))));
    item('Ny lane under', 'Lanen er laget i appen og følger ikke Project.', null, () => addLane(ln.id));
    item('Endre navn og farge', 'Åpner lanen i panelet. Dobbeltklikk navnet gjør det samme.', null, () => selectLane(ln.id));
    item(lane.manual ? 'Slett lane' : 'Skjul lane', lane.manual ? 'Lanen er laget i appen.' : 'Vis den igjen fra denne menyen.', null, () => removeLaneById(ln.id), L.lanes.length <= 1);
    for (const hl of plan.lanes.filter((x) => x.shown && x.hidden)) {
      const hid = hl.id;
      item(`Vis lane igjen: ${hl.name.replace(/\/?\|/g, ' ')}`, 'Skjult lane. Den kommer tilbake på samme plass.', null, () => commit((pl) => delete findLane(pl, hid)!.hidden));
    }
    // Ny boks der du høyreklikket, en måned lang (to uker i ukesvisning)
    const start = L.dateAt(Math.max(p.x, L.plot.x0));
    const days = plan.plan.calendar.mode === 'week' ? 13 : 29;
    const finishT = new Date(`${start}T00:00:00Z`);
    finishT.setUTCDate(finishT.getUTCDate() + days);
    const finish = [finishT.toISOString().slice(0, 10), plan.plan.calendar.end].sort()[0];
    item('Ny boks her', `Fra ${start.split('-').reverse().join('.')}. Følger ikke Project.`, null, () => {
      let made: Box | null = null;
      commit((pl) => {
        made = newBox(pl, ln.id, start, finish);
        if (made) made.top = lines(Math.max(0, p.y - ln.top), L.unit);
      });
      if (made) select((made as Box).id);
    });
    const hiddenBoxes = lane.boxes.filter((b) => b.hidden);
    for (const hb of hiddenBoxes) {
      const hid = hb.id;
      item(`Vis igjen: ${hb.text.replace(/\/?\|/g, ' ').replace(/^\*/, '')}`, 'Skjult boks i denne lanen.', null, () => commit((pl) => delete findBox(pl, hid)!.hidden));
    }
    if (box) {
      const id = box.id;
      menu.append(el('p', { class: 'pop-title' }, 'Boks'));
      if (!box.resolved?.isMilestone) item('Overskriftsboks', 'Teksten øverst, og andre bokser kan ligge inne i den.', !!box.header, () => setHeader(id, !box.header));
      item('Kopier', 'Kopi rett under, som følger ikke Project.', null, () => {
        selected = id;
        copySelected();
      });
      item(box.manual ? 'Slett' : 'Skjul', box.manual ? 'Boksen er laget i appen.' : 'Vis den igjen fra denne menyen.', null, () => {
        selected = id;
        removeSelected();
      });
      if (!box.resolved?.isMilestone) item('Standard høyde', 'Så høy som teksten krever.', null, () => commit((pl) => delete findBox(pl, id)!.height), !box.height);
      item('Løsne', 'La appen velge plassen i lanen igjen.', null, () => commit((pl) => delete findBox(pl, id)!.top), box.top === undefined);
    }
    if (!menu.matches(':popover-open')) menu.showPopover();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    menu.style.left = `${Math.max(8, Math.min(e.clientX, vw - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(e.clientY, vh - menu.offsetHeight - 8))}px`;
  });

  toggle.addEventListener('click', () => {
    active = !active;
    if (!active) {
      selected = null;
      selectedLane = null;
    }
    buildPanel();
    overlay();
    syncTools();
  });
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
    host.redraw();
    buildPanel();
    syncTools();
  });
  document.addEventListener('keydown', (e) => {
    if (!active) return;
    const t = e.target as HTMLElement;
    const inField = t.matches?.('input, textarea, select');
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (inField) t.blur();
      else select(null);
      return;
    }
    if (!inField && !mod && (e.key === 'Delete' || e.key === 'Backspace') && (selected || selectedLane)) {
      e.preventDefault();
      if (selected) removeSelected();
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
      past = [];
      future = [];
      dirty = false;
      selected = null;
      selectedLane = null;
      buildPanel();
      syncTools();
    },
    owns: (e) => !!itemOf(e) || (active && !!(e.target as Element | null)?.closest?.('.edit-handle')) || (e instanceof MouseEvent && !!titleLaneOf(e)),
    get active() {
      return active;
    },
    get dirty() {
      return dirty;
    },
    markSaved() {
      dirty = false;
    },
    replacePlan(p) {
      snapshot();
      host.setPlan(p);
      selected = null;
      selectedLane = null;
      typingSession = false;
      host.redraw();
      buildPanel();
      syncTools();
    },
  };
}
