// Redigering i tegningen: velg en boks, endre den i panelet, angre og gjør om.
// Endringene skrives rett inn i planen (som valgfrie felt på boksen), så de følger med i arbeidsfilen.
import type { Box, PlanFile, Rotation } from './format/types';
import type { Item, Layout } from './layout/layout';

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
  markSaved(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};

function findBox(plan: PlanFile, id: string): Box | null {
  for (const l of plan.lanes) for (const b of l.boxes) if (b.id === id) return b;
  return null;
}

/** Har brukeren overstyrt noe på boksen? */
export function isEdited(b: Box): boolean {
  return !!(b.fill || b.textColor || (b.callout && b.callout !== 'auto') || (b.calloutSide && b.calloutSide !== 'auto') || b.original);
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
}

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

  const syncTools = () => {
    toggle.setAttribute('aria-pressed', String(active));
    tools.hidden = !active;
    undoBtn.disabled = !past.length;
    redoBtn.disabled = !future.length;
    const plan = host.getPlan();
    resetAllBtn.disabled = !plan || !plan.lanes.some((l) => l.boxes.some(isEdited));
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

  const restore = (from: PlanFile[], to: PlanFile[]) => {
    const plan = host.getPlan();
    const prev = from.pop();
    if (!plan || !prev) return;
    to.push(structuredClone(plan));
    host.setPlan(prev);
    dirty = true;
    typingSession = false;
    if (selected && !findBox(prev, selected)) selected = null;
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

  const buildPanel = () => {
    const plan = host.getPlan();
    const b = active && plan && selected ? findBox(plan, selected) : null;
    panel.hidden = !b;
    panel.replaceChildren();
    if (!plan || !b) return;
    const ms = !!b.resolved?.isMilestone;
    const head = el('div', { class: 'panel-head' });
    head.append(el('h2', {}, ms ? 'Milepæl' : 'Boks'));
    const close = el('button', { type: 'button', class: 'icon', title: 'Lukk (Esc)', 'aria-label': 'Lukk' }, '×');
    close.addEventListener('click', () => select(null));
    head.append(close);
    panel.append(head);
    if (b.resolved) panel.append(el('p', { class: 'muted small' }, `${b.resolved.start.split('-').reverse().join('.')} til ${b.resolved.finish.split('-').reverse().join('.')}${b.resolved.trade && b.resolved.trade !== '(none)' ? ` · ${b.resolved.trade}` : ''}`));

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
        segmented<Rotation>('Rotert tekst', b.rotation, [[0, 'Ingen'], [90, '90°'], [-90, '−90°']], (v) =>
          change((x) => {
            keepOriginal(x);
            x.rotation = v;
          }),
        ),
      );
      if (b.rotation !== 0) panel.append(el('p', { class: 'hint' }, 'Rotert tekst får ikke callout.'));
    }
    const reset = el('button', { type: 'button', class: 'button' }, 'Tilbakestill boks');
    reset.disabled = !isEdited(b);
    reset.title = 'Fjerner det du har endret, så appens forslag gjelder igjen';
    reset.addEventListener('click', () => change(resetBox));
    panel.append(el('div', { class: 'panel-foot' }, undefined));
    panel.lastElementChild!.append(reset);
  };

  // ---- Markeringer i tegningen (kommer ikke med i PDF eller utskrift) ----
  const overlay = () => {
    if (!svgNow || !layoutNow) return;
    svgNow.querySelector('g.edit-overlay')?.remove();
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
      if (b && isEdited(b)) {
        const c = document.createElementNS(NS, 'circle');
        for (const [k, v] of Object.entries({ cx: r.x1, cy: r.y0, r: 0.9, fill: ACCENT, stroke: '#FFFFFF', 'stroke-width': 0.3 })) c.setAttribute(k, String(v));
        g.append(c);
      }
    }
    svgNow.append(g);
  };

  const select = (id: string | null) => {
    selected = id;
    typingSession = false;
    buildPanel();
    overlay();
  };

  // ---- Hendelser ----
  const itemOf = (e: Event) => (active ? ((e.target as Element | null)?.closest?.('g[data-id]') as SVGGElement | null) : null);
  sheet.addEventListener('click', (e) => {
    if (!active) return;
    const g = itemOf(e);
    select(g ? g.getAttribute('data-id') : null);
  });
  sheet.addEventListener('dblclick', (e) => {
    const g = itemOf(e);
    if (!g) return;
    select(g.getAttribute('data-id'));
    const ta = panel.querySelector<HTMLTextAreaElement>('#box-text');
    ta?.focus();
    ta?.select();
  });
  toggle.addEventListener('click', () => {
    active = !active;
    if (!active) selected = null;
    buildPanel();
    overlay();
    syncTools();
  });
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  resetAllBtn.addEventListener('click', () => {
    const plan = host.getPlan();
    if (!plan) return;
    snapshot();
    plan.lanes.forEach((l) => l.boxes.forEach(resetBox));
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
    if (inField || !mod) return;
    const k = e.key.toLowerCase();
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
      buildPanel();
      syncTools();
    },
    owns: (e) => !!itemOf(e),
    get active() {
      return active;
    },
    get dirty() {
      return dirty;
    },
    markSaved() {
      dirty = false;
    },
  };
}
