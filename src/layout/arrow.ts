// Pil fra en fritekst: en rett strek fra kanten av teksten til en pilspiss som kan stå hvor som helst.
// Pilspissen kan festes til en boks eller milepæl og følger den da når planen endres.
import type { NoteArrow, PlanImage } from '../format/types';
import { frameCenter, frameCorners, type PlacedImage, type Pt } from './image';

export type Rect = { x: number; y: number; w: number; h: number };

/** Pilen slik den tegnes, i mm. */
export interface PlacedArrow {
  /** Id-en til friteksten. */
  id: string;
  /** Fra kanten av teksten. */
  x1: number;
  y1: number;
  /** Streken slutter inne i pilspissen, så den ikke stikker ut foran. */
  lx: number;
  ly: number;
  /** Pilspissen. */
  x2: number;
  y2: number;
  width: number;
  color: string;
  /** Pilspissen som trekant: spissen og de to hjørnene bak. */
  head: [Pt, Pt, Pt];
}

const PT_TO_MM = 25.4 / 72;
/** Luft mellom teksten og der streken starter, i mm. */
const GAP = 0.4;

/** Strekbredden følger skriftstørrelsen: 12 pt gir omtrent 0,75 pt, som en vanlig linje i Office. */
export const arrowWidth = (sizePt: number) => Math.min(1.4, Math.max(0.2, sizePt * PT_TO_MM * 0.06));
/** Lengden på pilspissen. */
export const headLength = (width: number) => Math.max(1.8, width * 6.5);

/** Hvor pilspissen står: i boksen den er festet til, eller der den ble sluppet. */
export function arrowTip(a: NoteArrow, W: number, H: number, rectOf: (id: string) => Rect | null): Pt {
  const r = a.to ? rectOf(a.to.id) : null;
  if (r && a.to) return { x: r.x + a.to.u * r.w, y: r.y + a.to.v * r.h };
  return { x: a.x * W, y: a.y * H };
}

/** Er punktet inne i mangekanten? */
function inside(pts: Pt[], q: Pt): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * Der streken fra midten av teksten mot pilspissen krysser kanten av teksten. Null når pilspissen
 * står inne i teksten, for da er det ingen pil å tegne.
 */
export function arrowStart(p: PlacedImage, tip: Pt): Pt | null {
  const pts = frameCorners(p);
  if (inside(pts, tip)) return null;
  const c = frameCenter(p);
  const dx = tip.x - c.x;
  const dy = tip.y - c.y;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    // c + t·d = a + s·e
    const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / den;
    const s = ((a.x - c.x) * dy - (a.y - c.y) * dx) / den;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
  }
  if (!Number.isFinite(best)) return null;
  return { x: c.x + dx * best, y: c.y + dy * best };
}

/** Pilen fra teksten til spissen, eller null når den blir for kort til å vises. */
export function placeArrow(p: PlacedImage, tip: Pt, sizePt: number, color: string): PlacedArrow | null {
  const s = arrowStart(p, tip);
  if (!s) return null;
  const width = arrowWidth(sizePt);
  const hl = headLength(width);
  const len = Math.hypot(tip.x - s.x, tip.y - s.y);
  if (len < hl + GAP + 0.5) return null;
  const ux = (tip.x - s.x) / len;
  const uy = (tip.y - s.y) / len;
  const hw = hl * 0.42;
  const bx = tip.x - ux * hl;
  const by = tip.y - uy * hl;
  return {
    id: p.id,
    x1: s.x + ux * GAP,
    y1: s.y + uy * GAP,
    lx: tip.x - ux * hl * 0.6,
    ly: tip.y - uy * hl * 0.6,
    x2: tip.x,
    y2: tip.y,
    width,
    color,
    head: [tip, { x: bx - uy * hw, y: by + ux * hw }, { x: bx + uy * hw, y: by - ux * hw }],
  };
}

/** Pilene til friteksten som vises. placed er bildene slik de står på arket. */
export function placeArrows(images: PlanImage[], placed: PlacedImage[], W: number, H: number, rectOf: (id: string) => Rect | null): PlacedArrow[] {
  const byId = new Map(placed.map((p) => [p.id, p]));
  const out: PlacedArrow[] = [];
  for (const im of images) {
    const a = im.note?.arrow;
    const p = byId.get(im.id);
    if (!a || !p || !im.note) continue;
    const pa = placeArrow(p, arrowTip(a, W, H, rectOf), im.note.sizePt, im.note.color ?? '#000000');
    if (pa) out.push(pa);
  }
  return out;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Lagrer pilspissen: som andel av arket, og som plass i boksen den står på, hvis noen. */
export function storeTip(tip: Pt, W: number, H: number, target: { id: string; rect: Rect } | null): NoteArrow {
  const a: NoteArrow = { x: r4(tip.x / W), y: r4(tip.y / H) };
  if (target) {
    const r = target.rect;
    a.to = { id: target.id, u: r4(clamp01(r.w ? (tip.x - r.x) / r.w : 0.5)), v: r4(clamp01(r.h ? (tip.y - r.y) / r.h : 0.5)) };
  }
  return a;
}

/** Boksen eller milepælen under pilspissen: den minste, så en boks inne i en overskriftsboks vinner. */
export function targetAt(q: Pt, targets: { id: string; rect: Rect }[], tol = 0): { id: string; rect: Rect } | null {
  let best: { id: string; rect: Rect } | null = null;
  for (const t of targets) {
    const r = t.rect;
    if (q.x < r.x - tol || q.x > r.x + r.w + tol || q.y < r.y - tol || q.y > r.y + r.h + tol) continue;
    if (!best || r.w * r.h < best.rect.w * best.rect.h) best = t;
  }
  return best;
}

/** Der en ny pil peker: ned og til høyre for teksten, innenfor arket. */
export function defaultTip(p: PlacedImage, W: number, H: number): Pt {
  const pts = frameCorners(p);
  const x = Math.max(...pts.map((q) => q.x)) + 12;
  const y = Math.max(...pts.map((q) => q.y)) + 10;
  const c = frameCenter(p);
  // Ikke plass til høyre eller under: pek motsatt vei
  return {
    x: x < W - 4 ? x : Math.min(...pts.map((q) => q.x)) - 12 > 4 ? Math.min(...pts.map((q) => q.x)) - 12 : c.x,
    y: y < H - 4 ? y : Math.min(...pts.map((q) => q.y)) - 10 > 4 ? Math.min(...pts.map((q) => q.y)) - 10 : c.y,
  };
}
