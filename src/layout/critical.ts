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
    if (Math.abs(ys[i + 1] - ys[i]) > 1e-6) {
      const r = route(lo, hi, ys[i], ys[i + 1], obstacles, [a, b]);
      pts.push(...r.bends);
      x = r.x;
    } else x = lo;
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

/** Straff for et ekstra knekk i trappen. */
const BEND_COST = 0.3;
/** Linjen skal se ut til å gå gjennom neste boks: en loddrett strek langt fra boksen koster litt per mm. */
const HUG_WEIGHT = 0.1;

/** Overgangen fra ya til yb mellom lo og hi, og hva den koster: tekst som de loddrette strekene
 *  krysser, og tekst som de vannrette strekene stryker over. Enten ett loddrett hopp, eller to
 *  med en vannrett bit mellom, så streken kan runde en tekst og legge seg inntil neste boks.
 *  Boksene linjen skal gjennom, teller ikke. bends er knekkpunktene x,y,… i rekkefølge. */
function route(lo: number, hi: number, ya: number, yb: number, obstacles: Rect[], ends: Stop[]): { x: number; cost: number; bends: number[] } {
  const ownIds = new Set(ends.map((e) => e.id));
  const near = obstacles.filter((o) => !(o.own && ownIds.has(o.id)) && o.x1 > lo - 1 && o.x0 < hi + 1);
  const across = (o: Rect, y: number) => y > o.y0 + 1e-6 && y < o.y1 - 1e-6;
  const overlap = (o: Rect, a: number, b: number) => Math.max(0, Math.min(o.x1, b) - Math.max(o.x0, a));
  /** Vannrett fra a til b i høyde y. */
  const horiz = (y: number, a: number, b: number) => {
    let c = 0;
    if (b - a > 1e-9) for (const o of near) if (across(o, y)) c += STRIKE_WEIGHT * overlap(o, a, b);
    return c;
  };
  /** Loddrett i x fra y1 til y2. */
  const vert = (x: number, y1: number, y2: number) => {
    const t = Math.min(y1, y2) + 0.3;
    const u = Math.max(y1, y2) - 0.3;
    let c = 0;
    if (u > t) for (const o of near) if (x > o.x0 + 1e-6 && x < o.x1 - 1e-6 && o.y1 > t && o.y0 < u) c += Math.min(o.y1, u) - Math.max(o.y0, t);
    return c;
  };
  // Samme høyde: ingen trapp, bare den vannrette streken
  if (Math.abs(ya - yb) <= 1e-6) return { x: lo, cost: horiz(ya, lo, hi), bends: [] };
  const xs = new Set([lo, hi, (lo + hi) / 2, ...ends.flatMap((e) => [e.x0, e.x1])]);
  // Rett utenfor kantene av det som er i veien
  for (const o of near) xs.add(o.x0 - 0.4), xs.add(o.x1 + 0.4);
  const cand = [...xs].filter((c) => c >= lo - 1e-9 && c <= hi + 1e-9);
  const hug = (c: number) => HUG_WEIGHT * (hi - c);
  // Ett hopp
  let best = { x: hi, cost: Infinity, bends: [] as number[] };
  for (const c of cand) {
    const cost = horiz(ya, lo, c) + vert(c, ya, yb) + horiz(yb, c, hi) + hug(c);
    if (cost < best.cost - 1e-9) best = { x: c, cost, bends: [c, ya, c, yb] };
  }
  // To hopp: ned (eller opp) i xa til en ledig høyde ym, bort til xb, og videre til yb
  const yLo = Math.min(ya, yb);
  const yHi = Math.max(ya, yb);
  const ysMid = new Set<number>();
  for (const o of near) for (const y of [o.y0 - 0.4, o.y1 + 0.4]) if (y > yLo + 0.3 && y < yHi - 0.3) ysMid.add(y);
  if (ysMid.size) {
    const xbs = cand.filter((c) => c >= hi - 1e-9 || ends.some((e) => Math.abs(e.x0 - c) < 1e-9));
    for (const ym of ysMid)
      for (const xa of cand) {
        const first = horiz(ya, lo, xa) + vert(xa, ya, ym);
        if (first + BEND_COST >= best.cost) continue;
        for (const xb of xbs) {
          if (xb <= xa + 1e-6) continue;
          const cost = first + horiz(ym, xa, xb) + vert(xb, ym, yb) + horiz(yb, xb, hi) + hug(xb) + BEND_COST;
          if (cost < best.cost - 1e-9) best = { x: xb, cost, bends: [xa, ya, xa, ym, xb, ym, xb, yb] };
        }
      }
  }
  return best;
}
