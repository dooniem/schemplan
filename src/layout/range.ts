// Kalenderens omfang valgt i appen. Hver ende kan settes for seg; en ende som ikke er satt,
// følger Project. Planen selv endres ikke: tegningen får en kopi med kalenderen satt til
// omfanget, så bokser utenfor bare ikke tegnes og kommer tilbake når kalenderen utvides igjen.

import type { CalendarRange, IsoDate, PlanFile } from '../format/types';
import { addDays, daysInMonth, isoWeek, month, monthStart, MONTHS_NB, parseIso, toIso, weekday, year } from './dates';

type Mode = 'month' | 'week';

/** Første dag i kolonnen dagen ligger i: den 1. i måneden, eller mandagen. */
export function columnStart(iso: IsoDate, mode: Mode): IsoDate {
  const t = parseIso(iso);
  return toIso(mode === 'month' ? monthStart(year(t), month(t)) : addDays(t, -weekday(t)));
}
/** Siste dag i kolonnen dagen ligger i: siste dag i måneden, eller søndagen. */
export function columnEnd(iso: IsoDate, mode: Mode): IsoDate {
  const t = parseIso(iso);
  return toIso(mode === 'month' ? Date.UTC(year(t), month(t), daysInMonth(year(t), month(t))) : addDays(t, 6 - weekday(t)));
}

/** Flytter dagen én kolonne (måned eller uke) fram eller tilbake. Måneder holder seg innenfor måneden. */
export function stepColumn(iso: IsoDate, mode: Mode, dir: 1 | -1): IsoDate {
  const t = parseIso(iso);
  if (mode === 'week') return toIso(addDays(t, 7 * dir));
  const y = year(t);
  const m = month(t) + dir;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return toIso(Date.UTC(ny, nm, Math.min(new Date(t).getUTCDate(), daysInMonth(ny, nm))));
}

/** Omfanget som tegnes. Ender valgt i appen rundes ut til hele måneder eller uker. */
export function effectiveRange(file: PlanFile, mode: Mode): { start: IsoDate; end: IsoDate } {
  const cal = file.plan.calendar;
  const r = file.plan.layout.calendarRange;
  const start = r?.start ? columnStart(r.start, mode) : cal.start;
  const end = r?.end ? columnEnd(r.end, mode) : cal.end;
  // En kolonne er minst: står endene feil vei, gjelder starten
  return { start, end: end < start ? columnEnd(start, mode) : end };
}

/** Kopi av planen med kalenderen satt til omfanget. Samme plan når ingenting er valgt. */
export function withCalendarRange(file: PlanFile, mode: Mode): PlanFile {
  const r = file.plan.layout.calendarRange;
  if (!r?.start && !r?.end) return file;
  const { start, end } = effectiveRange(file, mode);
  if (start === file.plan.calendar.start && end === file.plan.calendar.end) return file;
  return { ...file, plan: { ...file.plan, calendar: { ...file.plan.calendar, start, end } } };
}

/** Bokser som skulle vært tegnet, men ligger helt utenfor omfanget. */
export function boxesOutside(file: PlanFile, mode: Mode): number {
  const { start, end } = effectiveRange(file, mode);
  let n = 0;
  for (const l of file.lanes) {
    if (!l.shown || l.hidden) continue;
    for (const b of l.boxes) {
      const r = b.resolved;
      if (b.shown && !b.hidden && r && (r.finish < start || r.start > end)) n++;
    }
  }
  return n;
}

/** «Mar 2026» eller «uke 10 2026»: kolonnen dagen ligger i. */
export function columnLabel(iso: IsoDate, mode: Mode): string {
  const t = parseIso(iso);
  if (mode === 'month') return `${MONTHS_NB[month(t)]} ${year(t)}`;
  const w = isoWeek(t);
  return `uke ${w.week} ${w.year}`;
}

/** Antall kolonner mellom to dager, begge med. */
export function columnCount(start: IsoDate, end: IsoDate, mode: Mode): number {
  const a = parseIso(columnStart(start, mode));
  const b = parseIso(columnStart(end, mode));
  if (mode === 'week') return Math.round((b - a) / (7 * 86_400_000)) + 1;
  return (year(b) - year(a)) * 12 + month(b) - month(a) + 1;
}

/** Leser omfanget fra en fil. Gir null om det ikke har riktig form. */
export function readCalendarRange(v: unknown): CalendarRange | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const ok = (d: unknown) => d === undefined || (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parseIso(d)));
  if (!ok(o.start) || !ok(o.end)) return null;
  if (Object.keys(o).some((k) => k !== 'start' && k !== 'end')) return null;
  return { ...(o.start ? { start: o.start as IsoDate } : {}), ...(o.end ? { end: o.end as IsoDate } : {}) };
}
