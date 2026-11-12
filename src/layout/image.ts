// Bilder satt inn i planen: plassering på arket, beskjæring og regning for dra i håndtak.
// Bildet har egne koordinater (u, v) fra 0 til 1 over hele bildet, uansett beskjæring.
import type { PlanImage } from '../format/types';

export type Pt = { x: number; y: number };
export type Uv = [number, number];
/** Rektangel i bildets egne koordinater: u0, v0, u1, v1. */
export type UvRect = [number, number, number, number];

/** Et bilde slik det tegnes, i mm på arket. */
export interface PlacedImage {
  id: string;
  href: string;
  /** Midten av hele bildet (uten beskjæring). */
  cx: number;
  cy: number;
  /** Hele bildet (uten beskjæring). */
  w: number;
  h: number;
  /** Grader med klokken. */
  rotation: number;
  crop: UvRect;
  points: Uv[] | null;
  /** Festet til en dato: midten av det synlige står på datoen, og bildet kan bare flyttes opp og ned. */
  date: string | null;
  /** Symbolet til denne milepælen (boks-id). */
  milestone: string | null;
}

export interface Anchors {
  /** x for midten av en dag, eller null utenfor kalenderen. */
  xOfDate?: (iso: string) => number | null;
  /** Punktet til en milepæl som tegnes, eller null. */
  milestoneAt?: (id: string) => Pt | null;
}

export const FULL: UvRect = [0, 0, 1, 1];
/** Minste del av bildet som kan stå igjen etter beskjæring, i hver retning. */
export const MIN_CROP = 0.02;
/** Minste bredde og høyde på det synlige, i mm. */
export const MIN_SIZE_MM = 3;
/** Bildet lagres aldri større enn dette (lengste side, piksler). */
export const MAX_PX = 2400;

const rad = (deg: number) => (deg * Math.PI) / 180;
const rot = (x: number, y: number, deg: number): Pt => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: x * c - y * s, y: x * s + y * c };
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Fra bildets koordinater til arket. */
export function toSheet(p: Pick<PlacedImage, 'cx' | 'cy' | 'w' | 'h' | 'rotation'>, u: number, v: number): Pt {
  const r = rot((u - 0.5) * p.w, (v - 0.5) * p.h, p.rotation);
  return { x: p.cx + r.x, y: p.cy + r.y };
}

/** Fra arket til bildets koordinater. */
export function toUv(p: Pick<PlacedImage, 'cx' | 'cy' | 'w' | 'h' | 'rotation'>, x: number, y: number): Uv {
  const r = rot(x - p.cx, y - p.cy, -p.rotation);
  return [r.x / p.w + 0.5, r.y / p.h + 0.5];
}

/** Den synlige delen: beskjæringen, og punktene hvis bildet har punktbeskjæring. */
export function frameUv(crop: UvRect, points: Uv[] | null): UvRect {
  if (!points || points.length < 3) return crop;
  const us = points.map((p) => p[0]);
  const vs = points.map((p) => p[1]);
  const f: UvRect = [Math.max(crop[0], Math.min(...us)), Math.max(crop[1], Math.min(...vs)), Math.min(crop[2], Math.max(...us)), Math.min(crop[3], Math.max(...vs))];
  // Punktene helt utenfor beskjæringen: vis i det minste beskjæringen
  return f[2] - f[0] > 1e-6 && f[3] - f[1] > 1e-6 ? f : crop;
}

/** Hjørnene av den synlige delen på arket: øverst til venstre og videre med klokken. */
export function frameCorners(p: PlacedImage): Pt[] {
  const [u0, v0, u1, v1] = frameUv(p.crop, p.points);
  return [toSheet(p, u0, v0), toSheet(p, u1, v0), toSheet(p, u1, v1), toSheet(p, u0, v1)];
}

/** Midten av den synlige delen på arket. */
export function frameCenter(p: PlacedImage): Pt {
  const [u0, v0, u1, v1] = frameUv(p.crop, p.points);
  return toSheet(p, (u0 + u1) / 2, (v0 + v1) / 2);
}

/** Det minste rektangelet på arket som rommer det synlige (også når bildet er rotert). */
export function frameBounds(p: PlacedImage) {
  const c = frameCorners(p);
  const xs = c.map((q) => q.x);
  const ys = c.map((q) => q.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Bildet på arket. x og y lagres som andel av arkets bredde og høyde, størrelsen som andel av bredden,
 * så bildet står på samme sted når arket byttes. xOfDate gir x for midten av en dag, eller null utenfor kalenderen.
 */
export function placeImage(img: PlanImage, W: number, H: number, a: Anchors = {}): PlacedImage | null {
  const p: PlacedImage = {
    id: img.id,
    href: img.data,
    cx: img.x * W,
    cy: img.y * H,
    w: img.w * W,
    h: img.h * W,
    rotation: img.rotation ?? 0,
    crop: img.crop ?? FULL,
    points: img.points && img.points.length >= 3 ? img.points : null,
    date: img.date?.day ?? null,
    milestone: img.milestone?.id ?? null,
  };
  if (img.milestone) {
    // Symbol for en milepæl: står der milepælen står, eller vises ikke når milepælen ikke tegnes
    const m = a.milestoneAt?.(img.milestone.id);
    if (!m) return null;
    const c = frameCenter(p);
    p.cx += m.x + img.milestone.dx * W - c.x;
    p.cy += m.y + img.milestone.dy * W - c.y;
    return p;
  }
  if (img.date && a.xOfDate) {
    const x = a.xOfDate(img.date.day);
    // Festet til en dato som ikke er med i kalenderen (f.eks. i utkikk): bildet vises ikke
    if (x === null) return null;
    p.cx += x + img.date.dx * W - frameCenter(p).x;
  }
  return p;
}

/** Tilbake til lagret form (andeler av arket). Datoen beholdes, x lagres også så bildet står likt når det løsnes. */
/** anchor: milepælens punkt, eller x for midten av datoen bildet er festet til. Avstanden dit lagres. */
export function storeImage(img: PlanImage, p: PlacedImage, W: number, H: number, anchor?: Pt | null): void {
  const c = frameCenter(p);
  if (img.milestone && anchor) img.milestone = { id: img.milestone.id, dx: r4((c.x - anchor.x) / W), dy: r4((c.y - anchor.y) / W) };
  else if (img.date && anchor) img.date = { day: img.date.day, dx: r4((c.x - anchor.x) / W) };
  img.x = p.cx / W;
  img.y = p.cy / H;
  img.w = p.w / W;
  img.h = p.h / W;
  img.rotation = normDeg(p.rotation);
  if (p.crop.every((v, i) => Math.abs(v - FULL[i]) < 1e-9)) delete img.crop;
  else img.crop = p.crop.map(r4) as UvRect;
  if (p.points) img.points = p.points.map(([u, v]) => [r4(u), r4(v)]);
  else delete img.points;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;
/** Grader fra −180 til 180. */
export const normDeg = (d: number) => {
  const x = ((((d + 180) % 360) + 360) % 360) - 180;
  return Math.abs(x) < 1e-9 ? 0 : Math.round(x * 100) / 100;
};

/**
 * Opprinnelig størrelse i mm: 96 punkter per tomme, som når bildet settes inn i Office.
 * Store bilder krympes til en tredjedel av arkets bredde og halve høyden.
 */
export function naturalSize(px: [number, number], W: number, H: number): { w: number; h: number } {
  const w = (px[0] * 25.4) / 96;
  const h = (px[1] * 25.4) / 96;
  const k = Math.min(1, (W / 3) / w, (H / 2) / h);
  return { w: w * k, h: h * k };
}

/** Nytt bilde med opprinnelig størrelse og midten i (x, y) på arket. */
export function newImage(id: string, data: string, px: [number, number], at: Pt, W: number, H: number): PlanImage {
  const s = naturalSize(px, W, H);
  const x = clamp(at.x, s.w / 2, W - s.w / 2);
  const y = clamp(at.y, s.h / 2, H - s.h / 2);
  return { id, data, px, x: x / W, y: y / H, w: s.w / W, h: s.h / W, rotation: 0 };
}

/** Bildets opprinnelige størrelse og form, med den synlige midten på samme sted. Rotasjon og beskjæring beholdes. */
export function resetSize(p: PlacedImage, px: [number, number], W: number, H: number): PlacedImage {
  const s = naturalSize(px, W, H);
  return keepPoint({ ...p, w: s.w, h: s.h }, p, frameCenterUv(p));
}

const frameCenterUv = (p: PlacedImage): Uv => {
  const [u0, v0, u1, v1] = frameUv(p.crop, p.points);
  return [(u0 + u1) / 2, (v0 + v1) / 2];
};

/** Flytter midten av next så punktet (u, v) står der det sto i prev. */
export function keepPoint(next: PlacedImage, prev: PlacedImage, uv: Uv): PlacedImage {
  const a = toSheet(prev, uv[0], uv[1]);
  const b = toSheet(next, uv[0], uv[1]);
  return { ...next, cx: next.cx + a.x - b.x, cy: next.cy + a.y - b.y };
}

/** Håndtakene rundt det synlige: hjørner og midt på kantene. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
/** Hvor håndtaket står på rammen: 0, ½ eller 1 i hver retning. */
export const handleAt = (h: Handle): [number, number] => [h.includes('w') ? 0 : h.includes('e') ? 1 : 0.5, h.includes('n') ? 0 : h.includes('s') ? 1 : 0.5];

/**
 * Endre størrelse ved å dra i et håndtak til punktet q. Motsatt hjørne eller kant står stille.
 * Hjørner beholder formen, med mindre free er satt (Shift). Beskjæringen følger med.
 */
export function resizeBy(p: PlacedImage, h: Handle, q: Pt, free = false): PlacedImage {
  const f = frameUv(p.crop, p.points);
  const fw = (f[2] - f[0]) * p.w;
  const fh = (f[3] - f[1]) * p.h;
  const [hu, hv] = handleAt(h);
  // Motsatt punkt på rammen, i bildets koordinater
  const au = f[0] + (1 - hu) * (f[2] - f[0]);
  const av = f[1] + (1 - hv) * (f[3] - f[1]);
  const a = toSheet(p, au, av);
  // Punktet i rammens retning (bildet rotert tilbake), målt fra det faste punktet
  const d = rot(q.x - a.x, q.y - a.y, -p.rotation);
  const corner = hu !== 0.5 && hv !== 0.5;
  let sx = hu === 0.5 ? 1 : Math.max(MIN_SIZE_MM, (hu === 1 ? d.x : -d.x)) / fw;
  let sy = hv === 0.5 ? 1 : Math.max(MIN_SIZE_MM, (hv === 1 ? d.y : -d.y)) / fh;
  if (corner && !free) {
    // Samme forhold i begge retninger: den største av de to, så hjørnet følger musen
    const s = Math.max(sx, sy);
    sx = s;
    sy = s;
  }
  return keepPoint({ ...p, w: p.w * sx, h: p.h * sy }, p, [au, av]);
}

/** Roter så håndtaket over bildet peker mot q. snap: trinn på 15°. Ellers fanges 0°, 90°, 180° og −90° innenfor 4°. */
export function rotateTo(p: PlacedImage, q: Pt, step = false): PlacedImage {
  const c = frameCenter(p);
  let deg = (Math.atan2(q.y - c.y, q.x - c.x) * 180) / Math.PI + 90;
  if (step) deg = Math.round(deg / 15) * 15;
  else {
    const near = Math.round(deg / 90) * 90;
    if (Math.abs(deg - near) < 4) deg = near;
  }
  return rotateBy(p, normDeg(deg) - p.rotation);
}

/** Roter om midten av det synlige. */
export function rotateBy(p: PlacedImage, delta: number): PlacedImage {
  return keepPoint({ ...p, rotation: normDeg(p.rotation + delta) }, p, frameCenterUv(p));
}

/** Vanlig beskjæring: flytt kanten eller hjørnet h til punktet q. Holdes innenfor bildet. */
export function cropTo(p: PlacedImage, h: Handle, q: Pt): UvRect {
  const [u, v] = toUv(p, q.x, q.y);
  const [hu, hv] = handleAt(h);
  const c: UvRect = [...p.crop];
  if (hu === 0) c[0] = clamp(u, 0, c[2] - MIN_CROP);
  if (hu === 1) c[2] = clamp(u, c[0] + MIN_CROP, 1);
  if (hv === 0) c[1] = clamp(v, 0, c[3] - MIN_CROP);
  if (hv === 1) c[3] = clamp(v, c[1] + MIN_CROP, 1);
  return c;
}

/** Punktbeskjæring: punktet flyttes til q, innenfor bildet. Kanter fanges når punktet er nær dem. */
export function movePoint(p: PlacedImage, q: Pt, snapMm = 0): Uv {
  let [u, v] = toUv(p, q.x, q.y);
  if (snapMm > 0) {
    const su = snapMm / p.w;
    const sv = snapMm / p.h;
    for (const e of [0, 1]) {
      if (Math.abs(u - e) < su) u = e;
      if (Math.abs(v - e) < sv) v = e;
    }
  }
  return [clamp(u, 0, 1), clamp(v, 0, 1)];
}

/** Punktene i et rektangel, med klokken fra øverst til venstre. */
export const rectPoints = (c: UvRect): Uv[] => [[c[0], c[1]], [c[2], c[1]], [c[2], c[3]], [c[0], c[3]]];
