// Bilder og fritekst festet til en lane: står like langt ned i lanen når lanen flyttes eller
// endrer høyde, for eksempel når arket byttes fra liggende til stående eller lanene omplasseres.
import type { Lane, PlanImage } from '../format/types';

/** Lanen slik den står på arket, i mm. */
export interface LaneSpan {
  id: string;
  y0: number;
  y1: number;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Lanen bildet står i. Er lanen slått sammen med en annen, gjelder den. Er lanen skjult
 * eller ikke med på arket, gir den null, og bildet blir stående der det sist var.
 */
export function laneSpanOf(id: string, shown: LaneSpan[], lanes: Pick<Lane, 'id' | 'mergedInto'>[]): LaneSpan | null {
  const seen = new Set<string>();
  let cur: string | undefined = id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const s = shown.find((l) => l.id === cur);
    if (s) return s;
    cur = lanes.find((l) => l.id === cur)?.mergedInto;
  }
  return null;
}

/** Lanen som rommer y, eller den nærmeste over eller under. */
export function laneAtY(shown: LaneSpan[], y: number): LaneSpan | null {
  let best: LaneSpan | null = null;
  let dist = Infinity;
  for (const s of shown) {
    const d = y < s.y0 ? s.y0 - y : y > s.y1 ? y - s.y1 : 0;
    if (d < dist) {
      best = s;
      dist = d;
    }
  }
  return best;
}

/** y for midten av det synlige, når bildet står v ned i lanen (0 er toppen, 1 bunnen). */
export const yInLane = (s: LaneSpan, v: number) => s.y0 + v * (s.y1 - s.y0);

/** Hvor langt ned i lanen y er, som andel av lanehøyden. */
export const vInLane = (s: LaneSpan, y: number) => r4(s.y1 > s.y0 ? (y - s.y0) / (s.y1 - s.y0) : 0);

/**
 * Lagrer plassen i lanen etter at bildet er flyttet. Midten av det synlige bestemmer lanen,
 * så et bilde som dras til en annen lane, festes der.
 */
export function storeLane(img: PlanImage, centerY: number, shown: LaneSpan[]): void {
  if (!img.lane) return;
  const s = laneAtY(shown, centerY);
  if (s) img.lane = { id: s.id, v: vInLane(s, centerY) };
}

/** Fest til lanen der midten av det synlige står, eller løsne. Bildet flytter seg ikke. */
export function pinLane(img: PlanImage, centerY: number, shown: LaneSpan[], on: boolean): void {
  if (!on) {
    delete img.lane;
    return;
  }
  const s = laneAtY(shown, centerY);
  if (s) img.lane = { id: s.id, v: vInLane(s, centerY) };
}

/** Flytt bildet til en annen lane, like langt ned i den. */
export function moveToLane(img: PlanImage, id: string): void {
  img.lane = { id, v: Math.min(1, Math.max(0, img.lane?.v ?? 0.5)) };
}
