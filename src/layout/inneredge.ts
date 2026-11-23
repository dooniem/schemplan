// Lys innerkant: en tynn lys linje rett innenfor kanten, som skiller like bokser som ligger kant i kant.
// Gjelder et helt fag om gangen, så alle boksene i faget ser like ut. Automatisk slås den på når
// minst to bokser i faget med samme mellomtone rører hverandre. Lyse farger (der en lys linje ikke
// synes) og mørke farger (der den konkurrerer med hvit tekst) får den aldri automatisk.

import type { BoxItem } from './layout';
import { luminance, mixColor } from './color';

export type InnerEdgeChoice = 'on' | 'off';

/** Bredden på den lyse linjen i mm. */
export const INNER_EDGE = 0.2;
/** Hvor mye av veien mot hvitt linjen går fra fyllet. */
const TOWARD_WHITE = 0.55;
/** Mellomtonene, målt som relativ luminans: fra blå og rød til cyan. */
const TONE_MIN = 0.14;
const TONE_MAX = 0.58;
/** To kanter regnes som samme linje når de ligger nærmere enn dette (mm). */
const TOUCH = 0.05;

/** Fyllet er en mellomtone der en lys innerkant synes uten å forstyrre teksten. */
export function innerEdgeTone(fill: string): boolean {
  const l = luminance(fill);
  return l >= TONE_MIN && l <= TONE_MAX;
}

/** Fargen på den lyse linjen: fyllet blandet mot hvitt, så den holder seg i samme tone. */
export const innerEdgeColor = (fill: string): string => mixColor(fill, '#FFFFFF', TOWARD_WHITE);

type Rect = Pick<BoxItem, 'x0' | 'x1' | 'y' | 'h'>;

/** Boksene deler en kant: side mot side eller topp mot bunn, med overlapp langs kanten. */
export function boxesTouch(a: Rect, b: Rect): boolean {
  const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > TOUCH;
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > TOUCH;
  const sideBySide = overlapY && (Math.abs(a.x1 - b.x0) < TOUCH || Math.abs(b.x1 - a.x0) < TOUCH);
  const stacked = overlapX && (Math.abs(a.y + a.h - b.y) < TOUCH || Math.abs(b.y + b.h - a.y) < TOUCH);
  return sideBySide || stacked;
}

/** Bokser som kan få innerkant: vanlige, hele bokser med kant. Overskrifts- og gjennomsiktige bokser står utenfor. */
const candidate = (it: BoxItem): boolean => !!it.border && !it.header && (it.fillOpacity ?? 1) >= 1 && it.h > INNER_EDGE * 4 && it.x1 - it.x0 > INNER_EDGE * 4;

/** Fagene som automatisk får innerkant: minst to bokser med samme mellomtone som rører hverandre. */
export function autoInnerEdgeTrades(items: (BoxItem & { trade?: string })[]): Set<string> {
  const out = new Set<string>();
  const groups = new Map<string, BoxItem[]>();
  for (const it of items) {
    if (it.trade === undefined || !candidate(it) || !innerEdgeTone(it.fill)) continue;
    const key = `${it.trade}\u0000${it.fill.toUpperCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  for (const [key, list] of groups) {
    const trade = key.split('\u0000')[0];
    if (out.has(trade)) continue;
    if (list.some((a, i) => list.slice(i + 1).some((b) => boxesTouch(a, b)))) out.add(trade);
  }
  return out;
}

/**
 * Setter innerEdge på boksene. «På» gir innerkant på alle boksene i faget, «Av» på ingen.
 * Uten valg følger faget den automatiske regelen, og da bare på bokser i en mellomtone.
 * Returnerer fagene som har innerkant.
 */
export function markInnerEdges(items: (BoxItem & { trade?: string })[], choices: Record<string, InnerEdgeChoice> = {}): Set<string> {
  const auto = autoInnerEdgeTrades(items);
  const on = new Set<string>();
  for (const it of items) {
    if (it.trade === undefined || !candidate(it)) continue;
    const choice = choices[it.trade];
    const yes = choice === 'on' || (choice !== 'off' && auto.has(it.trade) && innerEdgeTone(it.fill));
    if (yes) {
      it.innerEdge = innerEdgeColor(it.fill);
      on.add(it.trade);
    }
  }
  return on;
}

/**
 * Omrisset av boksen trukket inn med d, med samme pilspisser. Spissene er skrå, så de flyttes
 * inn langs normalen; det gir parallelle skrålinjer også innenfor.
 */
export function insetOutline(x0: number, x1: number, y: number, h: number, tip: number, left: boolean, right: boolean, d: number): [number, number][] {
  const mid = y + h / 2;
  const half = h / 2;
  // Vannrett forskyvning for en skrå linje som flyttes d inn, og hvor langt den går per mm i høyden
  const slope = tip / half;
  const shift = d * Math.sqrt(1 + slope * slope);
  const yt = y + d;
  const yb = y + h - d;
  const pts: [number, number][] = [];
  const lx = left ? x0 + shift : x0 + d;
  const rx = right ? x1 - shift : x1 - d;
  // Hjørnene der skrålinjen møter toppen og bunnen innenfor
  const lc = left ? lx + (mid - yt) * slope : lx;
  const rc = right ? rx - (mid - yt) * slope : rx;
  pts.push([lc, yt], [rc, yt]);
  if (right) pts.push([rx, mid]);
  pts.push([rc, yb], [lc, yb]);
  if (left) pts.push([lx, mid]);
  return pts;
}
