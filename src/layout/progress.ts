// Fremdriftsfront: en sikksakk langs statuslinjen. For hver boks som pågår, går streken ut til
// punktet arbeidet er kommet til, og tilbake. Til venstre for statuslinjen er boksen etter,
// til høyre er den foran.
//
// Alt regnes i arbeidstid etter planens kalender (arbeidsdager per uke og ferier), slik
// % ferdig er ment: 50 % av ti arbeidsdager er etter fem arbeidsdager, uansett helg.
// En boks får punktet til den aktiviteten som ligger lengst bak. Et snitt av % ville gitt
// feil punkt når aktivitetene i boksen har ulik lengde, selv om alle er i rute.

import type { PlanFile, Task } from '../format/types';
import type { TimeAxis } from './calendar';
import { addDays, parseIso, weekday } from './dates';
import type { Item } from './layout';
import type { StatusMoment } from './status';

const DAY = 86_400_000;
/** Punkter nærmere statuslinjen enn dette (arbeidsdager) står på linjen. */
export const SNAP_DAYS = 0.5;
/** % er heltall i planen, så en lang aktivitet kan bomme med en halv prosent av lengden. */
const ROUNDING = 0.005;

/** Arbeidstid: antall arbeidsdager fra et fast punkt, og tilbake til dato. */
export interface WorkClock {
  /** Arbeidsdager før starten av dagen t. */
  at(t: number): number;
  /** Starten av arbeidsdagen og hvor langt ut i den arbeidstid w er. */
  day(w: number): { t: number; frac: number };
}

export function workClock(file: PlanFile, from: number, to: number): WorkClock {
  const workDays = Math.min(7, Math.max(1, Math.round(file.plan.calendar.workingDaysPerWeek || 5)));
  const holidays = file.holidays.map((h) => [parseIso(h.start), parseIso(h.end)] as const);
  const isWork = (t: number) => weekday(t) < workDays && !holidays.some(([s, e]) => t >= s && t <= e);
  const start = addDays(from, -7);
  const n = Math.max(1, Math.round((addDays(to, 7) - start) / DAY));
  // cum[i] = arbeidsdager før dag i
  const cum = new Float64Array(n + 1);
  const work: number[] = [];
  for (let i = 0; i < n; i++) {
    const w = isWork(start + i * DAY);
    cum[i + 1] = cum[i] + (w ? 1 : 0);
    if (w) work.push(i);
  }
  const idx = (t: number) => Math.min(n, Math.max(0, Math.round((t - start) / DAY)));
  return {
    at: (t) => cum[idx(t)],
    day: (w) => {
      if (!work.length) return { t: start, frac: 0 };
      const k = Math.min(work.length - 1, Math.max(0, Math.floor(w)));
      return { t: start + work[k] * DAY, frac: Math.min(1, Math.max(0, w - k)) };
    },
  };
}

export interface FrontPoint {
  id: string;
  /** Arbeidsdager foran (+) eller bak (−) statuslinjen. 0 når den er i rute. */
  delta: number;
  /** Dagen og hvor langt ut i den arbeidet er kommet. */
  t: number;
  frac: number;
}

export interface FrontOptions {
  /** Ta også med bokser som skulle vært ferdige, men ikke er det. */
  late: boolean;
}

/** Hvor langt aktiviteten er kommet, i arbeidstid. null uten datoer. */
function doneThrough(task: Task, clock: WorkClock): { w: number; started: boolean; done: boolean; tol: number } | null {
  const s = parseIso(task.start);
  const f = parseIso(task.finish);
  if (Number.isNaN(s) || Number.isNaN(f)) return null;
  const ws = clock.at(s);
  const span = clock.at(addDays(f, 1)) - ws;
  const pc = Math.min(100, Math.max(0, Number(task.percentComplete) || 0));
  return { w: ws + (span * pc) / 100, started: pc > 0, done: pc >= 100, tol: Math.max(SNAP_DAYS, span * ROUNDING + 1e-9) };
}

/**
 * Punktene for boksene som pågår på statusdatoen (og, med `late`, de som skulle vært ferdige).
 * Bokser uten aktiviteter, milepæler og overskriftsbokser er ikke med.
 */
export function frontPoints(file: PlanFile, status: StatusMoment, opts: FrontOptions): FrontPoint[] {
  const tasks = new Map(file.tasks.map((t) => [t.uid, t]));
  const boxes = file.lanes.filter((l) => l.shown && !l.hidden).flatMap((l) => l.boxes.filter((b) => b.shown && !b.hidden && !b.header && b.spanTo === undefined && b.taskIds.length && b.resolved && !b.resolved.isMilestone));
  if (!boxes.length) return [];
  const all = boxes.map((b) => b.resolved!);
  const lo = Math.min(status.t, ...all.map((r) => parseIso(r.start)));
  const hi = Math.max(status.t, ...all.map((r) => parseIso(r.finish)));
  const clock = workClock(file, lo, hi);
  const now = clock.at(status.t);
  const out: FrontPoint[] = [];
  for (const b of boxes) {
    const r = b.resolved!;
    const bs = clock.at(parseIso(r.start));
    const bf = clock.at(addDays(parseIso(r.finish), 1));
    const running = bs < now && now < bf;
    const ts = b.taskIds.map((id) => tasks.get(id)).filter((t): t is Task => !!t && !t.summary && !t.milestone);
    const prog = ts.map((t) => doneThrough(t, clock)).filter((p): p is NonNullable<typeof p> => !!p);
    if (!prog.length) continue;
    const unfinished = prog.filter((p) => !p.done);
    const late = opts.late && bf <= now && unfinished.length > 0;
    if (!running && !late) continue;
    // Aktiviteter som ikke skal ha startet ennå, teller ikke: de er verken foran eller bak
    const counts = unfinished.filter((p) => p.started || p.w < now);
    const lead = counts.reduce<(typeof counts)[number] | null>((a, p) => (!a || p.w < a.w ? p : a), null);
    const w = lead ? lead.w : now;
    let delta = w - now;
    if (Math.abs(delta) < (lead?.tol ?? SNAP_DAYS)) delta = 0;
    const at = clock.day(delta === 0 ? now : w);
    out.push({ id: b.id, delta, t: at.t, frac: at.frac });
  }
  return out;
}

/** Sikksakken i mm: fra toppen av planen, ut til hvert punkt og tilbake, ned til bunnen. */
export function frontPath(points: FrontPoint[], items: Item[], axis: TimeAxis, sx: number, y0: number, y1: number): { points: number[]; labels: { x: number; y: number; delta: number; side: 'left' | 'right' }[] } {
  const byId = new Map(items.filter((i) => i.kind === 'box').map((i) => [i.id, i]));
  const stops = points
    .map((p) => {
      const it = byId.get(p.id);
      if (!it || it.kind !== 'box') return null;
      const x = p.delta === 0 ? sx : axis.xStart(p.t) + p.frac * (axis.xEnd(p.t) - axis.xStart(p.t));
      // Utenfor kalenderen (utkikk): punktet legges på kanten
      return { x: Math.min(axis.x1, Math.max(axis.x0, x)), y: it.y + it.h / 2, h: it.h, delta: p.delta };
    })
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => a.y - b.y);
  const pts = [sx, y0];
  const labels: { x: number; y: number; delta: number; side: 'left' | 'right' }[] = [];
  for (const s of stops) {
    if (s.delta === 0) continue;
    const half = Math.min(s.h / 2, 3);
    pts.push(sx, Math.max(pts[pts.length - 1], s.y - half), s.x, s.y, sx, s.y + half);
    labels.push({ x: s.x, y: s.y, delta: s.delta, side: s.delta < 0 ? 'left' : 'right' });
  }
  pts.push(sx, y1);
  return { points: pts, labels };
}

/** «−3 d», «+1,5 d» */
export const deltaText = (d: number) => {
  const v = Math.round(Math.abs(d) * 2) / 2;
  return `${d < 0 ? '−' : '+'}${String(v).replace('.', ',')} d`;
};
