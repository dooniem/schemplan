// Skravering i bokser: tynne streker i et mønster over fyllet, i en farge du velger.
// Strekene regnes ut som rette linjestykker, klippet til boksens omriss, så skjerm, PNG og PDF
// tegner nøyaktig det samme uten mønstre eller klipping. Rundt teksten og ikonene står det et lite
// felt uten streker, så teksten er like lett å lese som uten skravering.

import type { Box, BoxHatch, HatchDensity, HatchPattern, HexColor } from '../format/types';
import { ARROW_MM, type BoxItem, type TextBlock } from './layout';
import { insetOutline } from './inneredge';
import { markRects } from './marks';
import { LINE_HEIGHT, type Measure } from './text';

export const HATCH_PATTERNS: readonly HatchPattern[] = ['diagUp', 'diagDown', 'diagCross', 'horizontal', 'vertical', 'grid'];
export const HATCH_NAMES: Record<HatchPattern, string> = {
  diagUp: 'Skrå',
  diagDown: 'Skrå andre vei',
  diagCross: 'Skrå kryss',
  horizontal: 'Vannrett',
  vertical: 'Loddrett',
  grid: 'Rutenett',
};
export const HATCH_DENSITIES: readonly HatchDensity[] = ['tight', 'normal', 'loose'];
export const DENSITY_NAMES: Record<HatchDensity, string> = { tight: 'Tett', normal: 'Middels', loose: 'Glissen' };
/** Avstanden mellom strekene, målt på tvers av dem, i mm. */
const SPACING: Record<HatchDensity, number> = { tight: 1.2, normal: 2, loose: 3.2 };
/** Strekbredden i mm. Tynn nok til at fyllet fortsatt er fargen boksen har. */
export const HATCH_WIDTH = 0.3;
/** Fargen skraveringen får når den slås på: rød, som på et stoppskilt. */
export const HATCH_DEFAULT_COLOR: HexColor = '#FF0000';

/** Retningene til strekene i hvert mønster, i grader fra vannrett (mot klokka, som på arket). */
const ANGLES: Record<HatchPattern, number[]> = {
  diagUp: [45],
  diagDown: [-45],
  diagCross: [45, -45],
  horizontal: [0],
  vertical: [90],
  grid: [0, 90],
};

export const isHatchPattern = (v: unknown): v is HatchPattern => typeof v === 'string' && (HATCH_PATTERNS as readonly string[]).includes(v);
export const isHatchDensity = (v: unknown): v is HatchDensity => typeof v === 'string' && (HATCH_DENSITIES as readonly string[]).includes(v);

/** Skraveringen som gjelder for boksen, med standardverdier. null når boksen ikke har skravering. */
export function hatchOf(b: Pick<Box, 'hatch'>): Required<BoxHatch> | null {
  const h = b.hatch;
  if (!h || !isHatchPattern(h.pattern)) return null;
  return { pattern: h.pattern, color: h.color ?? HATCH_DEFAULT_COLOR, density: isHatchDensity(h.density) ? h.density : 'normal' };
}

export type Pt = [number, number];
/** Felt uten streker: x0, y0, x1, y1. */
export type Gap = [number, number, number, number];

/** Linjestykket [s0, s1] langs linjen p + s·t som ligger inni den konvekse mangekanten, eller null. */
function clipToPolygon(p: Pt, t: Pt, poly: readonly Pt[]): [number, number] | null {
  let lo = -Infinity;
  let hi = Infinity;
  // Innsiden ligger til venstre for hver kant når arealet er positivt, ellers til høyre
  const sign = area2(poly) >= 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    // Normal inn mot midten
    const nx = -(b[1] - a[1]) * sign;
    const ny = (b[0] - a[0]) * sign;
    const num = nx * (p[0] - a[0]) + ny * (p[1] - a[1]);
    const den = nx * t[0] + ny * t[1];
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null;
      continue;
    }
    const s = -num / den;
    if (den > 0) lo = Math.max(lo, s);
    else hi = Math.min(hi, s);
    if (lo >= hi) return null;
  }
  return lo < hi ? [lo, hi] : null;
}

/** Dobbelt fortegnsareal (skolisseformelen). */
const area2 = (poly: readonly Pt[]) =>
  poly.reduce((sum, a, i) => {
    const b = poly[(i + 1) % poly.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);

/** Delen [s0, s1] av linjen p + s·t som ligger inni rektangelet, eller null. */
function insideRect(p: Pt, t: Pt, g: Gap): [number, number] | null {
  let lo = -Infinity;
  let hi = Infinity;
  for (let k = 0; k < 2; k++) {
    const a = k === 0 ? g[0] : g[1];
    const b = k === 0 ? g[2] : g[3];
    if (Math.abs(t[k]) < 1e-12) {
      if (p[k] <= a || p[k] >= b) return null;
      continue;
    }
    let s0 = (a - p[k]) / t[k];
    let s1 = (b - p[k]) / t[k];
    if (s0 > s1) [s0, s1] = [s1, s0];
    lo = Math.max(lo, s0);
    hi = Math.min(hi, s1);
  }
  return lo < hi ? [lo, hi] : null;
}

/** Tar bort delene som ligger i feltene. Svarer med det som er igjen, i rekkefølge. */
function subtract(span: [number, number], cuts: [number, number][]): [number, number][] {
  let parts: [number, number][] = [span];
  for (const [c0, c1] of cuts) {
    const next: [number, number][] = [];
    for (const [a, b] of parts) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 > a) next.push([a, c0]);
        if (c1 < b) next.push([c1, b]);
      }
    }
    parts = next;
  }
  return parts;
}

const r = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Strekene i skraveringen som en SVG-sti (bare M og L). Strekene følger et rutenett som er felles
 * for hele arket, så to skraverte bokser ved siden av hverandre får streker som går i ett.
 * poly er omrisset strekene skal holde seg innenfor (konvekst), gaps feltene som skal stå tomme.
 */
export function hatchPath(pattern: HatchPattern, density: HatchDensity, poly: readonly Pt[], gaps: readonly Gap[] = []): string {
  if (poly.length < 3) return '';
  const step = SPACING[density];
  const parts: string[] = [];
  for (const deg of ANGLES[pattern]) {
    const a = (deg * Math.PI) / 180;
    // Langs streken (t) og på tvers av den (n). y går nedover på arket, så vinkelen speiles.
    const t: Pt = [Math.cos(a), -Math.sin(a)];
    const n: Pt = [-t[1], t[0]];
    const proj = poly.map((q) => q[0] * n[0] + q[1] * n[1]);
    const k0 = Math.ceil(Math.min(...proj) / step);
    const k1 = Math.floor(Math.max(...proj) / step);
    for (let k = k0; k <= k1; k++) {
      const c = k * step;
      const p: Pt = [n[0] * c, n[1] * c];
      const span = clipToPolygon(p, t, poly);
      if (!span) continue;
      const cuts = gaps.map((g) => insideRect(p, t, g)).filter((x): x is [number, number] => !!x);
      for (const [s0, s1] of subtract(span, cuts)) {
        if (s1 - s0 < 0.05) continue;
        parts.push(`M${r(p[0] + t[0] * s0)} ${r(p[1] + t[1] * s0)}L${r(p[0] + t[0] * s1)} ${r(p[1] + t[1] * s1)}`);
      }
    }
  }
  return parts.join('');
}

/**
 * Feltene rundt hver tekstlinje, slik tekst() i svg.ts setter linjene. Rotert tekst gir felt som står
 * på høykant. Luften rundt er litt større enn mellomrommet mellom bokstavene, så strekene ikke berører teksten.
 */
export function textGaps(t: TextBlock, measure: Measure): Gap[] {
  const sub = t.sub;
  const isSub = (i: number) => !!sub && i >= sub.from;
  const sizeOf = (i: number) => (isSub(i) ? sub!.size : t.size);
  const hOf = (i: number) => sizeOf(i) * LINE_HEIGHT;
  const total = t.lines.reduce((sum, _l, i) => sum + hOf(i), 0);
  const out: Gap[] = [];
  // Grunnlinjen til første linje, uten rotasjon. Rotert tekst står midt om (x, y).
  let base = t.rotate ? t.y + t.size * 0.35 - (total - hOf(0)) / 2 : t.y;
  t.lines.forEach((line, i) => {
    if (i > 0) base += t.rotate ? (hOf(i - 1) + hOf(i)) / 2 : hOf(i);
    if (!line.trim()) return;
    const s = sizeOf(i);
    const bold = !isSub(i) && (t.boldLines ? !!t.boldLines[i] : !!t.bold);
    const w = measure(line, s, bold);
    const padX = s * 0.3;
    const padY = s * 0.12;
    const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
    let g: Gap = [x0 - padX, base - s * 0.85 - padY, x0 + w + padX, base + s * 0.25 + padY];
    if (t.rotate) g = rotateGap(g, t.rotate, t.x, t.y);
    out.push(g);
  });
  return out;
}

/** Rektangelet dreid 90° eller −90° om (cx, cy), som SVG sin rotate(). */
function rotateGap(g: Gap, deg: 90 | -90, cx: number, cy: number): Gap {
  const turn = ([x, y]: Pt): Pt => (deg === 90 ? [cx - (y - cy), cy + (x - cx)] : [cx + (y - cy), cy - (x - cx)]);
  const a = turn([g[0], g[1]]);
  const b = turn([g[2], g[3]]);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

/** Setter skraveringen. null tar den bort. Standardverdiene lagres ikke. */
export function setHatch(b: Box, h: Partial<BoxHatch> | null): void {
  if (!h || !h.pattern) {
    delete b.hatch;
    return;
  }
  const next: BoxHatch = { pattern: h.pattern };
  if (h.color && h.color.toUpperCase() !== HATCH_DEFAULT_COLOR) next.color = h.color.toUpperCase();
  if (h.density && h.density !== 'normal') next.density = h.density;
  b.hatch = next;
}

/**
 * Skraveringen slik den tegnes for boksen, eller null. Strekene holder seg innenfor kanten,
 * inkludert pilspissene på bokser som fortsetter utenfor kalenderen.
 */
export function boxHatch(b: Pick<Box, 'hatch'>, it: BoxItem, ny: boolean, measure: Measure): BoxItem['hatch'] | null {
  const h = hatchOf(b);
  if (!h || it.h <= 0 || it.x1 <= it.x0) return null;
  // Innenfor kanten, så strekene ikke gjør kanten tykkere
  const inset = it.border ? (ny ? 0.3 : 0.25) / 2 : 0;
  const tip = Math.min(ARROW_MM, (it.x1 - it.x0) / 3);
  const poly = insetOutline(it.x0, it.x1, it.y, it.h, tip, it.arrowLeft, it.arrowRight, inset);
  const gaps = it.text ? textGaps(it.text, measure) : [];
  if (it.marks) {
    const edge = it.arrowRight ? it.x1 - tip : it.x1;
    const pad = 0.3;
    for (const m of markRects(it.marks, edge, it.y, it.h, it.lineBoxH ?? it.h)) gaps.push([m.x - pad, m.y - pad, m.x + m.s + pad, m.y + m.s + pad]);
  }
  const d = hatchPath(h.pattern, h.density, poly, gaps);
  return d ? { d, color: h.color, width: HATCH_WIDTH } : null;
}
