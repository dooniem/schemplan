// Pil fra en fritekst: en rett eller kurvet strek fra kanten av teksten til en pilspiss som kan stå hvor som helst.
// Pilspissen kan festes til en boks eller milepæl og følger den da når planen endres.
import type { NoteArrow, PlanImage } from '../format/types';
import { frameCenter, frameCorners, type PlacedImage, type Pt } from './image';

export type Rect = { x: number; y: number; w: number; h: number };

/** Pilen slik den tegnes, i mm. */
export interface PlacedArrow {
  /** Id-en til friteksten. */
  id: string;
  /** Streken som SVG-sti (M, L og C), fra kanten av teksten til inne i pilspissen, så den ikke stikker ut foran. */
  d: string;
  /** Hele streken fra teksten til spissen, til å treffe med musen. */
  hit: string;
  /** Pilspissen. */
  x2: number;
  y2: number;
  /** Midt på streken: knotten for å kurve den. */
  mid: Pt;
  width: number;
  color: string;
  /** Pilspissen som trekant: spissen og de to hjørnene bak. */
  head: [Pt, Pt, Pt];
}

/** Hvordan pilen ser ut: fra friteksten og pilens egne valg. */
export interface ArrowStyle {
  sizePt: number;
  color: string;
  /** Strekbredde i pt. */
  width?: number;
  head?: 'small' | 'large';
  bend?: number;
}

const PT_TO_MM = 25.4 / 72;
/** Luft mellom teksten og der streken starter, i mm. */
const GAP = 0.4;

/** Strekbredden følger skriftstørrelsen: 12 pt gir omtrent 0,75 pt, som en vanlig linje i Office. */
export const arrowWidth = (sizePt: number) => Math.min(1.4, Math.max(0.2, sizePt * PT_TO_MM * 0.06));
/** Lengden på pilspissen. */
export const headLength = (width: number) => Math.max(1.8, width * 6.5);

/** Hvor pilspissen står: i boksen den er festet til, eller der den ble sluppet. */
export function arrowTip(a: NoteArrow, W: number, H: number, rectOf: (id: string) => Rect | null, line?: number[] | null): Pt {
  const onLine = a.line !== undefined && line ? polyAt(line, a.line) : null;
  if (onLine) return onLine;
  const r = a.to ? rectOf(a.to.id) : null;
  if (r && a.to) return { x: r.x + a.to.u * r.w, y: r.y + a.to.v * r.h };
  return { x: a.x * W, y: a.y * H };
}

/** Lengden av en brutt linje gitt som x0,y0,x1,y1,… */
const polyLen = (pts: number[]) => {
  let len = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
};

/** Punktet så langt ut langs linjen (0 til 1), eller null uten linje. */
export function polyAt(pts: number[], t: number): Pt | null {
  if (pts.length < 4) return null;
  let left = Math.min(1, Math.max(0, t)) * polyLen(pts);
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const seg = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (left <= seg || i + 3 >= pts.length) {
      const k = seg > 1e-9 ? Math.min(1, left / seg) : 0;
      return { x: pts[i - 2] + (pts[i] - pts[i - 2]) * k, y: pts[i - 1] + (pts[i + 1] - pts[i - 1]) * k };
    }
    left -= seg;
  }
  return { x: pts[0], y: pts[1] };
}

/** Nærmeste punkt på linjen, hvor langt ut det er (0 til 1) og avstanden dit. */
export function nearestOnPoly(pts: number[], q: Pt): { pt: Pt; t: number; dist: number } | null {
  if (pts.length < 4) return null;
  const total = polyLen(pts);
  let best: { pt: Pt; t: number; dist: number } | null = null;
  let run = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const ax = pts[i - 2];
    const ay = pts[i - 1];
    const dx = pts[i] - ax;
    const dy = pts[i + 1] - ay;
    const seg2 = dx * dx + dy * dy;
    const k = seg2 > 1e-12 ? Math.min(1, Math.max(0, ((q.x - ax) * dx + (q.y - ay) * dy) / seg2)) : 0;
    const pt = { x: ax + dx * k, y: ay + dy * k };
    const dist = Math.hypot(q.x - pt.x, q.y - pt.y);
    const seg = Math.sqrt(seg2);
    if (!best || dist < best.dist) best = { pt, t: total > 0 ? (run + seg * k) / total : 0, dist };
    run += seg;
  }
  return best;
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

/** Strekbredder å velge mellom, i pt, som i Office. */
export const ARROW_WIDTHS = [0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6];
const HEAD_SCALE = { small: 0.7, medium: 1, large: 1.5 } as const;
/** Grensene for kurven, og hvor nær rett den fanges til rett. */
export const MAX_BEND = 1.5;
const SNAP_BEND = 0.04;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const ptStr = (q: Pt) => `${r3(q.x)} ${r3(q.y)}`;

/**
 * Punktet streken bøyes mot. Regnes fra midten av teksten til spissen, så kurven står likt
 * når teksten flyttes litt eller skrives om.
 */
export function bendControl(p: PlacedImage, tip: Pt, bend: number): Pt {
  const c = frameCenter(p);
  const dx = tip.x - c.x;
  const dy = tip.y - c.y;
  // Normalen til venstre for retningen fra teksten mot spissen (y nedover)
  return { x: (c.x + tip.x) / 2 + dy * bend, y: (c.y + tip.y) / 2 - dx * bend };
}

/** Kurven som gir midten av streken nærmest q. Fanges til rett nær null. */
export function bendThrough(p: PlacedImage, tip: Pt, q: Pt): number {
  const c = frameCenter(p);
  const s = arrowStart(p, tip) ?? c;
  const dx = tip.x - c.x;
  const dy = tip.y - c.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return 0;
  // Midten av en andregradskurve er (s + 2k + t) / 4, så kontrollpunktet k = 2q − (s + t) / 2
  const kx = 2 * q.x - (s.x + tip.x) / 2;
  const ky = 2 * q.y - (s.y + tip.y) / 2;
  const b = ((kx - (c.x + tip.x) / 2) * dy - (ky - (c.y + tip.y) / 2) * dx) / L2;
  if (Math.abs(b) < SNAP_BEND) return 0;
  return Math.round(Math.max(-MAX_BEND, Math.min(MAX_BEND, b)) * 1000) / 1000;
}

/** Strekbredden i mm: valgt i pt, ellers etter skriftstørrelsen. */
export const styleWidth = (st: ArrowStyle) => (st.width ? st.width * PT_TO_MM : arrowWidth(st.sizePt));

/** Pilen fra teksten til spissen, eller null når den blir for kort til å vises. */
export function placeArrow(p: PlacedImage, tip: Pt, st: ArrowStyle): PlacedArrow | null {
  const bend = st.bend ?? 0;
  const k = bend ? bendControl(p, tip, bend) : null;
  // Streken går ut av teksten i retning kontrollpunktet, så kurven starter pent
  const s = (k && arrowStart(p, k)) || arrowStart(p, tip);
  if (!s) return null;
  const width = styleWidth(st);
  const hl = headLength(width) * HEAD_SCALE[st.head ?? 'medium'];
  if (Math.hypot(tip.x - s.x, tip.y - s.y) < hl + GAP + 0.5) return null;
  const unit = (from: Pt, to: Pt) => {
    const l = Math.hypot(to.x - from.x, to.y - from.y);
    return l > 1e-6 ? { x: (to.x - from.x) / l, y: (to.y - from.y) / l } : null;
  };
  const straight = unit(s, tip)!;
  // Retningen inn mot spissen og ut fra teksten: langs kurven, eller langs streken
  const uEnd = (k && unit(k, tip)) || straight;
  const uStart = (k && unit(s, k)) || straight;
  const a = { x: s.x + uStart.x * GAP, y: s.y + uStart.y * GAP };
  const e = { x: tip.x - uEnd.x * hl * 0.6, y: tip.y - uEnd.y * hl * 0.6 };
  // Andregradskurven skrives som C, som PDF-en kan tegne: kontrollpunktene 2/3 mot k fra hver ende
  const curve = (from: Pt, to: Pt) =>
    k ? `M ${ptStr(from)} C ${ptStr({ x: from.x + (2 / 3) * (k.x - from.x), y: from.y + (2 / 3) * (k.y - from.y) })} ${ptStr({ x: to.x + (2 / 3) * (k.x - to.x), y: to.y + (2 / 3) * (k.y - to.y) })} ${ptStr(to)}` : `M ${ptStr(from)} L ${ptStr(to)}`;
  const mid = k ? { x: 0.25 * s.x + 0.5 * k.x + 0.25 * tip.x, y: 0.25 * s.y + 0.5 * k.y + 0.25 * tip.y } : { x: (s.x + tip.x) / 2, y: (s.y + tip.y) / 2 };
  const hw = hl * 0.42;
  const bx = tip.x - uEnd.x * hl;
  const by = tip.y - uEnd.y * hl;
  return {
    id: p.id,
    d: curve(a, e),
    hit: curve(s, tip),
    x2: tip.x,
    y2: tip.y,
    mid,
    width,
    color: st.color,
    head: [tip, { x: bx - uEnd.y * hw, y: by + uEnd.x * hw }, { x: bx + uEnd.y * hw, y: by - uEnd.x * hw }],
  };
}

/** Utseendet til pilen på en fritekst. */
export const arrowStyleOf = (im: PlanImage): ArrowStyle => {
  const a = im.note!.arrow!;
  return { sizePt: im.note!.sizePt, color: a.color ?? im.note!.color ?? '#000000', width: a.width, head: a.head, bend: a.bend };
};

/** Pilene til friteksten som vises. placed er bildene slik de står på arket. */
export function placeArrows(images: PlanImage[], placed: PlacedImage[], W: number, H: number, rectOf: (id: string) => Rect | null, line?: number[] | null): PlacedArrow[] {
  const byId = new Map(placed.map((p) => [p.id, p]));
  const out: PlacedArrow[] = [];
  for (const im of images) {
    const a = im.note?.arrow;
    const p = byId.get(im.id);
    if (!a || !p || !im.note) continue;
    const pa = placeArrow(p, arrowTip(a, W, H, rectOf, line), arrowStyleOf(im));
    if (pa) out.push(pa);
  }
  return out;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Lagrer pilspissen: som andel av arket, og som plass i boksen den står på, hvis noen. */
export function storeTip(tip: Pt, W: number, H: number, target: { id: string; rect: Rect } | null, keep?: NoteArrow, line?: number): NoteArrow {
  // Utseendet beholdes; bare plassen og festet byttes
  const a: NoteArrow = { ...keep, x: r4(tip.x / W), y: r4(tip.y / H) };
  delete a.to;
  delete a.line;
  if (line !== undefined) {
    a.line = r4(clamp01(line));
    return a;
  }
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
