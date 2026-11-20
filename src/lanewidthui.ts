// Bredden på lane-kolonnen i redigeringen: høyre kant av navnefeltet dras til siden, og planen
// tegnes på nytt mens du drar. Kanten snapper der et navn får én linje mindre (Alt slår det av).
// Valgt bredde lagres i forhold til navnenes tekststørrelse, se layout/lanewidth.ts.
import type { PlanFile } from './format/types';
import type { Layout } from './layout/layout';
import { BAR_MAX_SHARE, BAR_MIN_EM, MAX_WIDTH_EM, widthToEm } from './layout/lanewidth';

/** Barens bredde i ganger tekststørrelsen, rundet til hundredeler. */
const barToEm = (mm: number, size: number) => Math.round(Math.min(MAX_WIDTH_EM, Math.max(BAR_MIN_EM, mm / size)) * 100) / 100;
import { wrapHyphenated, type Measure } from './layout/text';
import { splitLines } from './format/text';
import { canvasMeasure } from './render/measure';
import type { CtxGroup } from './ctxmenu';

const NS = 'http://www.w3.org/2000/svg';

export interface LaneWidthHost {
  accent: string;
  getPlan(): PlanFile | null;
  layout(): Layout | null;
  /** Tegningen for en plan som ikke er lagret ennå. */
  layoutOf(p: PlanFile): Layout;
  /** Lagrer en endring som ett angresteg og tegner planen på nytt. */
  commit(fn: (plan: PlanFile) => void): void;
  redraw(): void;
  /** Millimeter per skjermpunkt. */
  mmPerPx(): number;
  /** Alt holdt nede: ingen snapping. */
  snapOff(): boolean;
}

export interface LaneWidthDrag {
  startY: number;
  startClient: number;
  moved: boolean;
  move(): void;
  moveXY(x: number, y: number): void;
  end(): void;
}

export interface LaneWidthEdit {
  /** Håndtaket på høyre kant av navnefeltet, i markeringslaget. */
  draw(g: SVGGElement): void;
  startDrag(): LaneWidthDrag | null;
  /** Dra i høyre kant av en gruppebar. */
  startBarDrag(groupId: string): LaneWidthDrag | null;
  /** Valgene i høyreklikkmenyen på et lane-navn. */
  menu(): CtxGroup;
  /** Setter bredden i mm (null: automatisk) som ett angresteg. */
  set(mm: number | null): void;
  /** Linjene i lane-panelet. */
  panelRows(kit: PanelKit): HTMLElement[];
}

export interface PanelKit {
  el(tag: 'p', attrs?: Record<string, string>, text?: string): HTMLElement;
  lockedRow(text: string, button: string, title: string, onClick: () => void): HTMLElement;
}

const fmt = (v: number) => v.toLocaleString('nb-NO', { maximumFractionDigits: 0 });

/**
 * Bredder (mm) der et lane-navn får plass på færre linjer: for hvert navn den minste bredden som
 * gir 1, 2, 3 … linjer. Brukes til snapping.
 */
export function lineBreakWidths(L: Layout, plan: PlanFile, measure: Measure): number[] {
  const { size, pad, min, max } = L.laneCol;
  const out = new Set<number>();
  for (const ln of L.lanes) {
    const lane = plan.lanes.find((l) => l.id === ln.id);
    // Loddrette navn brytes etter lanens høyde, ikke kolonnens bredde
    if (!lane || plan.plan.layout.laneGroups?.some((g) => g.rotateNames && g.lanes.includes(lane.id))) continue;
    const raw = splitLines(lane.name);
    const bar = ln.titleX0 - L.laneTitleX;
    const count = (w: number) => wrapHyphenated(raw, w - bar - pad, size, measure, true).length;
    const most = Math.min(count(min), 6);
    const fewest = count(max);
    for (let n = fewest; n < most; n++) {
      let lo = min;
      let hi = max;
      if (count(hi) > n) continue;
      for (let i = 0; i < 24 && hi - lo > 0.05; i++) {
        const mid = (lo + hi) / 2;
        if (count(mid) <= n) hi = mid;
        else lo = mid;
      }
      out.add(Math.round(hi * 10) / 10 + 0.1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Knekkpunktene i et egendefinert planområde lagres som andeler av arket. Når tidsaksen flytter
 * seg, flyttes de med, så de beholder datoen sin. x0 og x1 er tidsaksen før og etter, i mm.
 */
export function remapPlanArea(plan: PlanFile, W: number, from: [number, number], to: [number, number]) {
  const pa = plan.plan.layout.planArea;
  if (!pa || Math.abs(from[0] - to[0]) < 1e-6) return;
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  const map = (pts?: [number, number][]) =>
    pts?.map(([x, y]): [number, number] => {
      const mm = x * W;
      const t = (mm - from[0]) / (from[1] - from[0]);
      // Punkter i venstre side står i siden også etterpå
      const nx = mm <= from[0] + 1e-6 ? to[0] : to[0] + Math.min(1, Math.max(0, t)) * (to[1] - to[0]);
      return [r5(nx / W), y];
    });
  plan.plan.layout.planArea = { ...pa, ...(pa.top ? { top: map(pa.top) } : {}), ...(pa.bottom ? { bottom: map(pa.bottom) } : {}) };
}

export function createLaneWidthEdit(h: LaneWidthHost): LaneWidthEdit {
  const measure = canvasMeasure();
  /** Bredden som vises ved håndtaket mens du drar. */
  let label: string | null = null;
  /** Hvor merkelappen står: ved kanten som dras. Uten: kanten av navnefeltet. */
  let labelAt: { x: number; y: number } | null = null;

  /** Lagrer bredden og flytter knekkpunktene i planområdet med tidsaksen. */
  const store = (pl: PlanFile, mm: number | null, L: Layout) => {
    if (mm === null) delete pl.plan.layout.laneTitleWidth;
    else pl.plan.layout.laneTitleWidth = widthToEm(mm, L.laneCol.size);
    const N = h.layoutOf(pl);
    remapPlanArea(pl, L.width, [L.plot.x0, L.plot.x1], [N.plot.x0, N.plot.x1]);
  };

  const set = (mm: number | null) => {
    const L = h.layout();
    if (!L) return;
    h.commit((pl) => store(pl, mm, L));
  };

  const draw = (g: SVGGElement) => {
    const L = h.layout();
    if (!L || !L.lanes.length) return;
    const y0 = L.lanes[0].y0;
    const y1 = L.lanes[L.lanes.length - 1].y1;
    const x = L.plot.x0;
    const add = (attrs: Record<string, string | number>) => {
      const e = document.createElementNS(NS, 'line');
      for (const [a, v] of Object.entries({ x1: x, x2: x, y1: y0, y2: y1, 'vector-effect': 'non-scaling-stroke', ...attrs })) e.setAttribute(a, String(v));
      g.append(e);
      return e;
    };
    if (L.laneCol.chosen) add({ stroke: h.accent, 'stroke-width': 2, 'pointer-events': 'none' });
    const hit = add({ stroke: 'transparent', 'stroke-width': 8, 'pointer-events': 'stroke', class: 'edit-handle lane-col-edge' });
    const t = document.createElementNS(NS, 'title');
    t.textContent = 'Dra for å endre bredden på navnefeltet. Høyreklikk et lane-navn for automatisk bredde.';
    hit.append(t);
    // Høyre kant av hver gruppebar
    for (const gb of L.laneGroups) {
      const e = document.createElementNS(NS, 'line');
      for (const [a, v] of Object.entries({ x1: gb.x1, x2: gb.x1, y1: gb.y0, y2: gb.y1, 'vector-effect': 'non-scaling-stroke', stroke: 'transparent', 'stroke-width': 8, 'pointer-events': 'stroke', class: 'edit-handle bar-edge', 'data-group': gb.id })) e.setAttribute(a, String(v));
      const bt = document.createElementNS(NS, 'title');
      bt.textContent = 'Dra for å endre bredden på baren. Høyreklikk baren for automatisk bredde.';
      e.append(bt);
      g.append(e);
    }
    if (label) {
      // Merkelapp over kanten, i fast størrelse på skjermen
      const k = h.mmPerPx();
      const lx = labelAt?.x ?? x;
      const ly = labelAt?.y ?? y0;
      const txt = document.createElementNS(NS, 'text');
      for (const [a, v] of Object.entries({ x: lx + 6 * k, y: ly + 16 * k, 'font-size': 12 * k, 'font-family': 'system-ui, sans-serif', fill: '#FFFFFF', 'pointer-events': 'none' })) txt.setAttribute(a, String(v));
      txt.textContent = label;
      const bg = document.createElementNS(NS, 'rect');
      for (const [a, v] of Object.entries({ x: lx + 2 * k, y: ly + 3 * k, width: (label.length * 7.4 + 10) * k, height: 18 * k, rx: 4 * k, fill: h.accent, 'pointer-events': 'none' })) bg.setAttribute(a, String(v));
      g.append(bg, txt);
    }
  };

  const startDrag = (): LaneWidthDrag | null => {
    const L = h.layout();
    const plan = h.getPlan();
    if (!L || !plan) return null;
    const { min, max, auto, size } = L.laneCol;
    const start = L.plot.x0 - L.laneTitleX;
    const targets = [...lineBreakWidths(L, plan, measure), auto];
    // Planen tegnes på nytt mens du drar. Det lagrede settes tilbake før endringen lagres,
    // så angre går til bredden før du begynte å dra.
    const saved = plan.plan.layout.laneTitleWidth;
    const savedArea = plan.plan.layout.planArea;
    let w = start;
    let frame = 0;
    let from: number | null = null;
    const restore = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (saved === undefined) delete plan.plan.layout.laneTitleWidth;
      else plan.plan.layout.laneTitleWidth = saved;
      if (savedArea) plan.plan.layout.planArea = savedArea;
      else delete plan.plan.layout.planArea;
    };
    const snap = (v: number) => {
      if (h.snapOff()) return v;
      const tol = 6 * h.mmPerPx();
      let best = v;
      let dist = tol;
      for (const t of targets)
        if (Math.abs(t - v) < dist) {
          dist = Math.abs(t - v);
          best = t;
        }
      return best;
    };
    const say = () => {
      label = `${fmt(w)} mm${Math.abs(w - auto) < 0.05 ? ' · automatisk' : ''}`;
    };
    return {
      startY: 0,
      startClient: 0,
      moved: false,
      move() {},
      moveXY(x) {
        from ??= x;
        w = Math.min(max, Math.max(min, snap(start + x - from)));
        say();
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          plan.plan.layout.laneTitleWidth = widthToEm(w, size);
          if (savedArea) {
            plan.plan.layout.planArea = savedArea;
            remapPlanArea(plan, L.width, [L.plot.x0, L.plot.x1], [L.laneTitleX + w, L.plot.x1]);
          }
          h.redraw();
        });
      },
      end() {
        label = null;
        restore();
        if (from === null || Math.abs(w - start) < 0.05) {
          h.redraw();
          return;
        }
        h.commit((pl) => store(pl, w, L));
      },
    };
  };

  const startBarDrag = (groupId: string): LaneWidthDrag | null => {
    const L = h.layout();
    const plan = h.getPlan();
    const gb = L?.laneGroups.find((x) => x.id === groupId);
    const grp = plan?.plan.layout.laneGroups?.find((x) => x.id === groupId);
    if (!L || !plan || !gb || !grp) return null;
    const { size } = L.laneCol;
    const colW = L.plot.x0 - L.laneTitleX;
    const lo = BAR_MIN_EM * size;
    const hi = colW * BAR_MAX_SHARE;
    const start = gb.x1 - gb.x0;
    const saved = grp.barWidth;
    let w = start;
    let frame = 0;
    let from: number | null = null;
    const restore = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (saved === undefined) delete grp.barWidth;
      else grp.barWidth = saved;
    };
    const snap = (v: number) => (!h.snapOff() && Math.abs(v - gb.autoW) < 6 * h.mmPerPx() ? gb.autoW : v);
    return {
      startY: 0,
      startClient: 0,
      moved: false,
      move() {},
      moveXY(x) {
        from ??= x;
        w = Math.min(hi, Math.max(lo, snap(start + x - from)));
        label = `${fmt(w)} mm${Math.abs(w - gb.autoW) < 0.05 ? ' · automatisk' : ''}`;
        labelAt = { x: gb.x0 + w, y: gb.y0 };
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          grp.barWidth = barToEm(w, size);
          h.redraw();
        });
      },
      end() {
        label = null;
        labelAt = null;
        restore();
        if (from === null || Math.abs(w - start) < 0.05) {
          h.redraw();
          return;
        }
        const auto = Math.abs(w - gb.autoW) < 0.05;
        h.commit((pl) => {
          const x = pl.plan.layout.laneGroups?.find((q) => q.id === groupId);
          if (!x) return;
          if (auto) delete x.barWidth;
          else x.barWidth = barToEm(w, size);
        });
      },
    };
  };

  const menu = (): CtxGroup => {
    const L = h.layout();
    const chosen = !!L?.laneCol.chosen;
    return {
      heading: 'Bredde på navnefeltet',
      items: [
        { label: 'Automatisk', radio: true, checked: !chosen, hint: L ? `Bred nok til at ingen ord deles (${fmt(L.laneCol.auto)} mm nå).` : '', onSelect: () => set(null) },
        { label: 'Valgt', radio: true, checked: chosen, hint: 'Beholder bredden og linjeskiftene i navnene. Dra i høyre kant av navnefeltet for å endre den.', onSelect: () => L && set(L.plot.x0 - L.laneTitleX) },
      ],
    };
  };

  const panelRows = (k: PanelKit): HTMLElement[] => {
    const L = h.layout();
    if (!L) return [];
    const w = L.plot.x0 - L.laneTitleX;
    if (!L.laneCol.chosen) return [k.el('p', { class: 'hint' }, `Navnefeltet er ${fmt(w)} mm, automatisk. Dra i høyre kant av feltet for å gjøre det bredere eller smalere.`)];
    return [
      k.lockedRow(`Valgt bredde på navnefeltet, ${fmt(w)} mm`, 'Automatisk', `Bred nok til at ingen ord deles (${fmt(L.laneCol.auto)} mm nå)`, () => set(null)),
      k.el('p', { class: 'hint' }, 'Bredden følger tekststørrelsen på navnene, så linjeskiftene blir de samme på alle ark.'),
    ];
  };

  return { draw, startDrag, startBarDrag, menu, set, panelRows };
}
