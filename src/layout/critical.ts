// Kritisk linje: en trappestreng gjennom de merkede boksene i datorekkefølge.
// Linjen går vannrett gjennom hver boks der det ikke står tekst (over eller under teksten,
// ellers langs kanten), og loddrett mellom boksene. Høyden i hver boks velges samlet for hele
// linjen, så den hopper minst mulig opp og ned.
import type { Item } from './layout';
import { LINE_HEIGHT } from './text';

export interface CriticalLine {
  /** Punkter x0,y0,x1,y1,… i mm. */
  points: number[];
  width: number;
  color: string;
}

export const CRITICAL_DEFAULT = { width: 0.6, color: '#E00000' };

interface Stop {
  id: string;
  x0: number;
  x1: number;
  /** Mulige høyder for linjen gjennom boksen, med en straff for dem som går langs kanten. */
  tracks: { y: number; cost: number }[];
}

/** Høydene linjen kan gå i gjennom en boks eller milepæl uten å krysse tekst. */
function stopOf(it: Item, width: number): Stop {
  if (it.kind === 'milestone') return { id: it.id, x0: it.x, x1: it.x, tracks: [{ y: it.y, cost: 0 }] };
  const top = it.y;
  const bottom = it.y + it.h;
  const t = it.text;
  // Uten tekst inne i boksen (tom eller callout) går linjen midt gjennom
  if (!t || !t.lines.length) return { id: it.id, x0: it.x0, x1: it.x1, tracks: [{ y: top + it.h / 2, cost: 0 }] };
  const tracks: Stop['tracks'] = [];
  if (!t.rotate) {
    const tTop = t.y - t.size * 0.8;
    const tBottom = t.y + (t.lines.length - 1) * t.size * LINE_HEIGHT + t.size * 0.25;
    // Luft over og under teksten som er bred nok til streken
    for (const [a, b] of [[top, tTop], [tBottom, bottom]]) if (b - a >= width * 1.5) tracks.push({ y: (a + b) / 2, cost: 0 });
  }
  if (!tracks.length) tracks.push({ y: top, cost: 0.5 }, { y: bottom, cost: 0.5 });
  return { id: it.id, x0: it.x0, x1: it.x1, tracks };
}

export function criticalLine(items: Item[], ids: Set<string>, style: { width: number; color: string }): CriticalLine | null {
  const marked = items.filter((it) => ids.has(it.id));
  if (!marked.length) return null;
  const stops = marked.map((it) => stopOf(it, style.width)).sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1);

  // Velger én høyde per boks slik at summen av hoppene (pluss straff for kantene) blir minst
  const best: number[][] = [stops[0].tracks.map((t) => t.cost)];
  const from: number[][] = [stops[0].tracks.map(() => -1)];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1].tracks;
    best.push([]);
    from.push([]);
    stops[i].tracks.forEach((t, j) => {
      let bi = 0;
      let bv = Infinity;
      prev.forEach((p, k) => {
        const v = best[i - 1][k] + Math.abs(p.y - t.y);
        if (v < bv - 1e-9) (bv = v), (bi = k);
      });
      best[i][j] = bv + t.cost;
      from[i][j] = bi;
    });
  }
  const ys: number[] = new Array(stops.length);
  let j = best[stops.length - 1].indexOf(Math.min(...best[stops.length - 1]));
  for (let i = stops.length - 1; i >= 0; i--) {
    ys[i] = stops[i].tracks[j].y;
    j = from[i][j];
  }

  // Trappen: vannrett i boksen, loddrett et sted mellom slutten av denne og starten av neste.
  // Der velges stedet der den loddrette streken krysser færrest bokser og tekster. x går aldri bakover.
  const obstacles = textAreas(items);
  const pts: number[] = [stops[0].x0, ys[0]];
  let x = stops[0].x0;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const lo = Math.max(x, Math.min(a.x1, b.x0));
    const hi = Math.max(lo, Math.min(Math.max(a.x1, b.x0), b.x1));
    const xm = Math.abs(ys[i + 1] - ys[i]) > 1e-6 ? bestX(lo, hi, ys[i], ys[i + 1], obstacles, [a, b]) : lo;
    if (Math.abs(ys[i + 1] - ys[i]) > 1e-6) pts.push(xm, ys[i], xm, ys[i + 1]);
    x = xm;
  }
  const last = stops[stops.length - 1];
  pts.push(Math.max(x, last.x1), ys[ys.length - 1]);
  return { points: pts, width: style.width, color: style.color };
}

/** own: boksen selv (linjen skal gjennom den), ikke en tekst ved siden av. */
type Rect = { x0: number; x1: number; y0: number; y1: number; id: string; own: boolean };

/** Det som har tekst: bokser, callouts og milepælstekster. */
function textAreas(items: Item[]): Rect[] {
  const out: Rect[] = [];
  for (const it of items) {
    if (it.kind === 'milestone') {
      const l = it.labelBox;
      out.push({ x0: l.x, x1: l.x + l.w, y0: l.y, y1: l.y + l.h, id: it.id, own: false });
    } else {
      if (it.text?.lines.length) out.push({ x0: it.x0, x1: it.x1, y0: it.y, y1: it.y + it.h, id: it.id, own: true });
      const c = it.callout?.box;
      if (c) out.push({ x0: c.x, x1: c.x + c.w, y0: c.y, y1: c.y + c.h, id: it.id, own: false });
    }
  }
  return out;
}

/** x for overgangen fra ya til yb mellom lo og hi: der streken (loddrett, og vannrett fram til
 *  og fra den) krysser minst tekst. Boksene linjen skal gjennom, teller ikke. */
function bestX(lo: number, hi: number, ya: number, yb: number, obstacles: Rect[], ends: Stop[]): number {
  const ownIds = new Set(ends.map((e) => e.id));
  const y0 = Math.min(ya, yb) + 0.3;
  const y1 = Math.max(ya, yb) - 0.3;
  const near = obstacles.filter((o) => !(o.own && ownIds.has(o.id)) && o.x1 > lo - 1 && o.x0 < hi + 1);
  const mid = (lo + hi) / 2;
  const cand = new Set([lo, hi, mid, ...ends.flatMap((e) => [e.x0, e.x1])]);
  // Rett utenfor kantene av det som er i veien
  for (const o of near) cand.add(o.x0 - 0.4), cand.add(o.x1 + 0.4);
  const across = (o: Rect, y: number) => y > o.y0 + 1e-6 && y < o.y1 - 1e-6;
  const overlap = (o: Rect, a: number, b: number) => Math.max(0, Math.min(o.x1, b) - Math.max(o.x0, a));
  let best = mid;
  let bestCost = Infinity;
  for (const c of cand) {
    if (c < lo - 1e-9 || c > hi + 1e-9) continue;
    let cost = Math.abs(c - mid) * 1e-3;
    for (const o of near) {
      if (c > o.x0 + 1e-6 && c < o.x1 - 1e-6 && o.y1 > y0 && o.y0 < y1) cost += Math.min(o.y1, y1) - Math.max(o.y0, y0);
      if (across(o, ya)) cost += overlap(o, lo, c);
      if (across(o, yb)) cost += overlap(o, c, hi);
    }
    if (cost < bestCost) (bestCost = cost), (best = c);
  }
  return best;
}
