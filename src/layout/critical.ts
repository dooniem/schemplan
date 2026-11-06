// Kritisk linje: en trappestreng gjennom de merkede boksene i datorekkefølge.
// Linjen går vannrett gjennom hver boks der det ikke står tekst (over eller under teksten,
// ellers langs kanten), og loddrett mellom boksene. Høyden i hver boks velges samlet for hele
// linjen, så den hopper minst mulig opp og ned.
import type { Item } from './layout';
import { LINE_HEIGHT } from './text';

export type CriticalDash = 'solid' | 'dashed' | 'dotted';

export interface CriticalLine {
  /** Punkter x0,y0,x1,y1,… i mm. */
  points: number[];
  width: number;
  color: string;
  dash: CriticalDash;
}

export const CRITICAL_DEFAULT: { width: number; color: string; dash?: CriticalDash } = { width: 0.6, color: '#E00000' };

/** Strek og mellomrom for stiplingen, som ganger av linjebredden. */
export function dashArray(dash: CriticalDash | undefined, width: number): number[] | null {
  if (dash === 'dashed') return [4 * width + 1.5, 2.5 * width + 0.8];
  if (dash === 'dotted') return [0.01, 2.2 * width + 0.3];
  return null;
}

interface Stop {
  id: string;
  x0: number;
  x1: number;
  /** Mulige høyder for linjen gjennom boksen, med en straff for dem som går langs kanten. */
  tracks: { y: number; cost: number }[];
}

/** Straff for å gå langs en kant: litt alltid, og mer når en annen boks ligger helt inntil,
 *  for da drukner streken i fugen mellom dem. */
const EDGE_COST = 0.5;
const CROWDED_COST = 3;
/** Å stryke over tekst vannrett er verre enn å krysse den loddrett. */
const STRIKE_WEIGHT = 3;

/** Høydene linjen kan gå i gjennom en boks eller milepæl uten å krysse tekst. */
function stopOf(it: Item, width: number, others: Rect[]): Stop {
  if (it.kind === 'milestone') return { id: it.id, x0: it.x, x1: it.x, tracks: [{ y: it.y, cost: 0 }] };
  const top = it.y;
  const bottom = it.y + it.h;
  const t = it.text;
  // Hvor tett en annen boks ligger inntil kanten, som andel av boksens bredde
  const crowd = (edge: number, above: boolean) => {
    let covered = 0;
    for (const o of others) {
      if (o.id === it.id) continue;
      const touch = above ? o.y1 > edge - 0.8 && o.y0 < edge - 0.01 : o.y0 < edge + 0.8 && o.y1 > edge + 0.01;
      if (touch) covered += Math.max(0, Math.min(o.x1, it.x1) - Math.max(o.x0, it.x0));
    }
    return Math.min(1, covered / Math.max(0.1, it.x1 - it.x0));
  };
  const edges = (base: number) => [
    { y: top, cost: base + CROWDED_COST * crowd(top, true) },
    { y: bottom, cost: base + CROWDED_COST * crowd(bottom, false) },
  ];
  // Uten tekst inne i boksen (tom eller callout) går linjen helst midt gjennom, men kan ta en kant
  if (!t || !t.lines.length) return { id: it.id, x0: it.x0, x1: it.x1, tracks: [{ y: top + it.h / 2, cost: 0 }, ...edges(EDGE_COST)] };
  const tracks: Stop['tracks'] = [];
  if (!t.rotate) {
    const tTop = t.y - t.size * 0.8;
    const tBottom = t.y + (t.lines.length - 1) * t.size * LINE_HEIGHT + t.size * 0.25;
    // Luft over og under teksten som er bred nok til streken
    for (const [a, b] of [[top, tTop], [tBottom, bottom]]) if (b - a >= width * 1.5) tracks.push({ y: (a + b) / 2, cost: 0 });
  }
  if (!tracks.length) tracks.push(...edges(EDGE_COST));
  return { id: it.id, x0: it.x0, x1: it.x1, tracks };
}

export function criticalLine(items: Item[], ids: Set<string>, style: { width: number; color: string; dash?: CriticalDash }): CriticalLine | null {
  const marked = items.filter((it) => ids.has(it.id));
  if (!marked.length) return null;
  const obstacles = textAreas(items);
  const blocks = boxAreas(items);
  const stops = marked.map((it) => stopOf(it, style.width, blocks)).sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1);

  // Velger én høyde per boks samlet for hele linjen: hopp opp og ned, kanter og tekst
  // som streken må krysse på vei til neste boks teller alle med
  const span = (a: Stop, b: Stop) => {
    const lo = Math.min(a.x1, b.x0);
    return [lo, Math.max(lo, Math.min(Math.max(a.x1, b.x0), b.x1))] as const;
  };
  const best: number[][] = [stops[0].tracks.map((t) => t.cost)];
  const from: number[][] = [stops[0].tracks.map(() => -1)];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1].tracks;
    const [lo, hi] = span(stops[i - 1], stops[i]);
    best.push([]);
    from.push([]);
    stops[i].tracks.forEach((t, j) => {
      let bi = 0;
      let bv = Infinity;
      prev.forEach((p, k) => {
        const v = best[i - 1][k] + Math.abs(p.y - t.y) + route(lo, hi, p.y, t.y, obstacles, [stops[i - 1], stops[i]]).cost;
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
  // Der velges stedet der streken krysser minst tekst. x går aldri bakover.
  const pts: number[] = [stops[0].x0, ys[0]];
  let x = stops[0].x0;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const [lo0, hi0] = span(a, b);
    const lo = Math.max(x, lo0);
    const hi = Math.max(lo, hi0);
    const xm = Math.abs(ys[i + 1] - ys[i]) > 1e-6 ? route(lo, hi, ys[i], ys[i + 1], obstacles, [a, b]).x : lo;
    if (Math.abs(ys[i + 1] - ys[i]) > 1e-6) pts.push(xm, ys[i], xm, ys[i + 1]);
    x = xm;
  }
  const last = stops[stops.length - 1];
  pts.push(Math.max(x, last.x1), ys[ys.length - 1]);
  return { points: pts, width: style.width, color: style.color, dash: style.dash ?? 'solid' };
}

/** own: boksen selv (linjen skal gjennom den), ikke en tekst ved siden av. */
type Rect = { x0: number; x1: number; y0: number; y1: number; id: string; own: boolean };

/** Alle bokser og tekster, for å se om noe ligger inntil en kant. */
function boxAreas(items: Item[]): Rect[] {
  const out = textAreas(items).map((r) => ({ ...r, id: r.own ? r.id : `${r.id}:tekst` }));
  for (const it of items) if (it.kind === 'box' && !it.text?.lines.length) out.push({ x0: it.x0, x1: it.x1, y0: it.y, y1: it.y + it.h, id: it.id, own: true });
  return out;
}

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

/** x for overgangen fra ya til yb mellom lo og hi, og hva den koster: tekst som den loddrette
 *  streken krysser, og tekst som den vannrette streken fram til og fra den stryker over.
 *  Boksene linjen skal gjennom, teller ikke. */
function route(lo: number, hi: number, ya: number, yb: number, obstacles: Rect[], ends: Stop[]): { x: number; cost: number } {
  const ownIds = new Set(ends.map((e) => e.id));
  const y0 = Math.min(ya, yb) + 0.3;
  const y1 = Math.max(ya, yb) - 0.3;
  const near = obstacles.filter((o) => !(o.own && ownIds.has(o.id)) && o.x1 > lo - 1 && o.x0 < hi + 1);
  const across = (o: Rect, y: number) => y > o.y0 + 1e-6 && y < o.y1 - 1e-6;
  const overlap = (o: Rect, a: number, b: number) => Math.max(0, Math.min(o.x1, b) - Math.max(o.x0, a));
  // Samme høyde: ingen trapp, bare den vannrette streken
  if (Math.abs(ya - yb) <= 1e-6) {
    let cost = 0;
    for (const o of near) if (across(o, ya)) cost += STRIKE_WEIGHT * overlap(o, lo, hi);
    return { x: lo, cost };
  }
  const mid = (lo + hi) / 2;
  const cand = new Set([lo, hi, mid, ...ends.flatMap((e) => [e.x0, e.x1])]);
  // Rett utenfor kantene av det som er i veien
  for (const o of near) cand.add(o.x0 - 0.4), cand.add(o.x1 + 0.4);
  let best = mid;
  let bestCost = Infinity;
  for (const c of cand) {
    if (c < lo - 1e-9 || c > hi + 1e-9) continue;
    let cost = Math.abs(c - mid) * 1e-3;
    for (const o of near) {
      if (c > o.x0 + 1e-6 && c < o.x1 - 1e-6 && o.y1 > y0 && o.y0 < y1) cost += Math.min(o.y1, y1) - Math.max(o.y0, y0);
      if (across(o, ya)) cost += STRIKE_WEIGHT * overlap(o, lo, c);
      if (across(o, yb)) cost += STRIKE_WEIGHT * overlap(o, c, hi);
    }
    if (cost < bestCost) (bestCost = cost), (best = c);
  }
  return { x: best, cost: bestCost };
}
