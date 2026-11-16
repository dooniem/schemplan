// Egendefinert planområde i redigeringen: topp- og bunnkanten dras opp og ned, og punkter lager
// knekk, som punktbeskjæringen av bilder. Endepunktene står fast i hver side. Planen tegnes på nytt
// mens du drar.
import type { PlanFile } from './format/types';
import type { Layout } from './layout/layout';
import { MIN_AREA_H, type Pt as AreaPt } from './layout/area';
import type { CtxGroup } from './ctxmenu';

const NS = 'http://www.w3.org/2000/svg';

export type AreaEdge = 'top' | 'bottom';

export interface AreaEditHost {
  accent: string;
  getPlan(): PlanFile | null;
  layout(): Layout | null;
  /** Lagrer en endring som ett angresteg og tegner planen på nytt. */
  commit(fn: (plan: PlanFile) => void): void;
  redraw(): void;
  /** Tegn markeringene på nytt. */
  overlay(): void;
  /** Millimeter per skjermpunkt. */
  mmPerPx(): number;
  /** Alt holdt nede: ingen snapping. */
  snapOff(): boolean;
  openMenu(x: number, y: number, title: string, groups: CtxGroup[], subtitle?: string): void;
}

/** Dra i en kant eller et punkt. Følger musen i mm. */
export interface AreaDrag {
  startY: number;
  startClient: number;
  moved: boolean;
  move(): void;
  moveXY(x: number, y: number): void;
  end(): void;
}

export interface AreaEdit {
  startDrag(edge: AreaEdge, kind: 'edge' | 'pt' | 'mid', i: number): AreaDrag | null;
  /** Sletter et knekkpunkt. Punktene i sidene står fast. */
  deletePoint(edge: AreaEdge, i: number): void;
  /** Høyreklikkmenyen for en kant, eller et punkt når `i` ikke er negativ. */
  menu(e: MouseEvent, edge: AreaEdge, i: number): void;
  /** Kantene med punkter i markeringslaget. Kommer ikke med i PDF. */
  draw(g: SVGGElement): void;
}

export function createAreaEdit(h: AreaEditHost): AreaEdit {
  let liveArea: { edge: AreaEdge; pts: AreaPt[] } | null = null;
  const areaEdgeNow = (edge: AreaEdge): AreaPt[] => (liveArea?.edge === edge ? liveArea.pts : h.layout()?.area?.[edge] ?? []);
  /** Lagrer kanten som andeler av arket. Den andre kanten beholdes som den er lagret. */
  const storeArea = (edge: AreaEdge, pts: AreaPt[] | null) => {
    const L = h.layout();
    if (!L) return;
    const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
    h.commit((pl) => {
      const pa = { ...(pl.plan.layout.planArea ?? {}) };
      if (pts) pa[edge] = pts.map(([x, y]) => [r5(x / L.width), r5(y / L.height)] as [number, number]);
      else delete pa[edge];
      if (pa.top || pa.bottom) pl.plan.layout.planArea = pa;
      else delete pl.plan.layout.planArea;
    });
  };
  /** Grensene for en kant: toppen går ikke over kalenderens plass, bunnen ikke under forklaringen. */
  const areaBounds = (edge: AreaEdge): [number, number] => {
    const A = h.layout()!.area!;
    return edge === 'top'
      ? [A.minTop, Math.min(...A.bottom.map((q) => q[1])) - MIN_AREA_H]
      : [Math.max(...A.top.map((q) => q[1])) + MIN_AREA_H, A.maxBottom];
  };
  /** Snapping: x mot måneds-/ukeskillene og planens sider, y mot lanekantene. Alt slår det av. */
  const snapArea = (v: number, targets: number[]) => {
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
  const areaXs = () => [h.layout()!.plot.x0, h.layout()!.plot.x1, ...h.layout()!.grid.map((g) => g.x)];
  const areaYs = () => h.layout()!.lanes.flatMap((l) => [l.y0, l.y1]);

  const startDrag = (edge: AreaEdge, kind: 'edge' | 'pt' | 'mid', i: number): AreaDrag | null => {
    const A = h.layout()?.area;
    if (!A) return null;
    const pts0 = A[edge].map((q) => [q[0], q[1]] as AreaPt);
    const [lo, hi] = areaBounds(edge);
    let from: number | null = null;
    let idx = kind === 'mid' ? i + 1 : i;
    // Planen tegnes på nytt mens du drar, så lanene og beskjæringen følger med. Den lagrede kanten
    // settes tilbake før endringen lagres, så angre går til der kanten sto før du begynte å dra.
    const plan = h.getPlan();
    const saved = plan?.plan.layout.planArea;
    const W = h.layout()!.width;
    const H = h.layout()!.height;
    let frame = 0;
    const restoreSaved = () => {
      window.cancelAnimationFrame(frame);
      if (!plan) return;
      if (saved) plan.plan.layout.planArea = saved;
      else delete plan.plan.layout.planArea;
    };
    const live = (pts: AreaPt[]) => {
      liveArea = { edge, pts };
      h.overlay();
      if (!plan || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const now = liveArea?.edge === edge ? liveArea.pts : null;
        if (!now) return;
        plan.plan.layout.planArea = { ...(saved ?? {}), [edge]: now.map(([x, y]) => [x / W, y / H] as [number, number]) };
        h.redraw();
      });
    };
    return {
      startY: 0,
      startClient: 0,
      moved: false,
      move() {},
      moveXY(x, y) {
        if (kind === 'edge') {
          // Hele kanten flyttes, formen beholdes
          from ??= y;
          const ys = pts0.map((q) => q[1]);
          let dy = y - from;
          // Rett kant snapper mot lanekantene
          if (ys.every((v) => Math.abs(v - ys[0]) < 1e-6)) dy = snapArea(ys[0] + dy, areaYs()) - ys[0];
          dy = Math.min(hi - Math.max(...ys), Math.max(lo - Math.min(...ys), dy));
          live(pts0.map(([px, py]) => [px, py + dy]));
          return;
        }
        const pts = pts0.map((q) => [q[0], q[1]] as AreaPt);
        if (kind === 'mid' && pts.length < 40) pts.splice(idx, 0, [x, y]);
        else if (kind === 'mid') idx = i;
        const last = pts.length - 1;
        // Endepunktene står i sidene; de andre holder seg mellom naboene
        const nx = idx === 0 ? pts[0][0] : idx === last ? pts[last][0] : Math.min(pts[idx + 1][0], Math.max(pts[idx - 1][0], snapArea(x, [...areaXs(), pts[idx - 1][0], pts[idx + 1][0]])));
        const ny = Math.min(hi, Math.max(lo, snapArea(y, [...areaYs(), ...(idx > 0 ? [pts[idx - 1][1]] : []), ...(idx < last ? [pts[idx + 1][1]] : [])])));
        pts[idx] = [nx, ny];
        activeAreaPt = { edge, i: idx };
        live(pts);
      },
      end() {
        const pts = liveArea?.edge === edge ? liveArea.pts : null;
        liveArea = null;
        restoreSaved();
        if (pts) storeArea(edge, pts);
        else h.redraw();
      },
    };
  };
  let activeAreaPt: { edge: AreaEdge; i: number } | null = null;
  const deletePoint = (edge: AreaEdge, i: number) => {
    const pts = h.layout()?.area?.[edge];
    if (!pts || i <= 0 || i >= pts.length - 1) return;
    activeAreaPt = null;
    storeArea(edge, pts.filter((_, k) => k !== i));
  };
  const menu = (e: MouseEvent, edge: AreaEdge, i: number) => {
    const pts = h.layout()?.area?.[edge] ?? [];
    const name = edge === 'top' ? 'Toppkanten' : 'Bunnkanten';
    const inner = i > 0 && i < pts.length - 1;
    const stored = !!h.getPlan()?.plan.layout.planArea?.[edge];
    const groups: CtxGroup[] = [];
    if (i >= 0)
      groups.push({
        items: [{ label: 'Slett punkt', icon: 'trash', kbd: 'Ctrl+klikk', disabled: !inner, hint: inner ? 'Kanten går rett mellom punktene på hver side.' : 'Punktene i sidene kan ikke slettes, bare dras opp og ned.', onSelect: () => deletePoint(edge, i) }],
      });
    groups.push({
      items: [
        { label: 'Rett ut kanten', icon: 'undo', disabled: pts.length <= 2, hint: pts.length > 2 ? 'Fjerner knekkpunktene. Kanten blir rett der den står i venstre side.' : 'Kanten er rett.', onSelect: () => storeArea(edge, [[pts[0][0], pts[0][1]], [pts[pts.length - 1][0], pts[0][1]]]) },
        { label: edge === 'top' ? 'Toppkanten tilbake under kalenderen' : 'Bunnkanten tilbake over forklaringen', icon: 'undo', disabled: !stored, hint: stored ? 'Kanten går tilbake dit den står i «Fyll arket».' : 'Kanten står der den står i «Fyll arket».', onSelect: () => storeArea(edge, null) },
      ],
    });
    h.openMenu(e.clientX, e.clientY, name, groups, 'Planområde');
  };
  /** Kantene med punkter i markeringslaget. Kommer ikke med i PDF. */
  const draw = (g: SVGGElement) => {
    const A = h.layout()?.area;
    if (!A) return;
    const k = h.mmPerPx();
    const add = (tag: string, attrs: Record<string, string | number>, parent: Element = g) => {
      const e = document.createElementNS(NS, tag);
      for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, String(v));
      parent.append(e);
      return e;
    };
    for (const edge of ['top', 'bottom'] as const) {
      const pts = areaEdgeNow(edge);
      if (pts.length < 2) continue;
      const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
      add('polyline', { points: line, fill: 'none', stroke: h.accent, 'stroke-width': 2, 'stroke-dasharray': '6 4', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' });
      const hit = add('polyline', { points: line, fill: 'none', stroke: 'transparent', 'stroke-width': 10, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'stroke', cursor: 'ns-resize', class: 'edit-handle area-edge', 'data-edge': edge });
      add('title', {}, hit).textContent = `Dra ${edge === 'top' ? 'toppkanten' : 'bunnkanten'} opp eller ned. Høyreklikk for flere valg.`;
      // Hvite punkter midt på hver del lager et nytt knekkpunkt når de dras
      pts.forEach((q, i) => {
        const n = pts[i + 1];
        if (!n || Math.hypot(n[0] - q[0], n[1] - q[1]) < 24 * k) return;
        const s = 7 * k;
        const m = add('rect', { x: (q[0] + n[0]) / 2 - s / 2, y: (q[1] + n[1]) / 2 - s / 2, width: s, height: s, rx: s / 2, fill: '#FFFFFF', stroke: h.accent, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'all', cursor: 'copy', class: 'edit-handle area-mid', 'data-edge': edge, 'data-i': i });
        add('title', {}, m).textContent = 'Dra for å lage et nytt punkt';
      });
      pts.forEach((q, i) => {
        const s = 9 * k;
        const on = activeAreaPt?.edge === edge && activeAreaPt.i === i;
        const r = add('rect', { x: q[0] - s / 2, y: q[1] - s / 2, width: s, height: s, fill: on ? h.accent : '#FFFFFF', stroke: h.accent, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'all', cursor: i === 0 || i === pts.length - 1 ? 'ns-resize' : 'move', class: 'edit-handle area-pt', 'data-edge': edge, 'data-i': i });
        add('title', {}, r).textContent = i === 0 || i === pts.length - 1 ? 'Dra opp eller ned' : 'Dra punktet. Ctrl+klikk sletter det.';
      });
    }
  };

  return { startDrag, deletePoint, menu, draw };
}
