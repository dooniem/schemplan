// Arbeidsdager mellom to datoer etter planens kalender: dagene i arbeidsuka, minus fridagene
// (ferier og helligdager) som ligger i planen.
import type { PlanFile } from '../format/types';
import { addDays, parseIso, weekday } from './dates';

/** Antall arbeidsdager fra og med start til og med slutt. */
export function workDayCount(file: Pick<PlanFile, 'plan' | 'holidays'>, start: string, finish: string): number {
  const s = parseIso(start);
  const e = parseIso(finish);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  const workDays = Math.min(7, Math.max(1, Math.round(file.plan.calendar.workingDaysPerWeek || 5)));
  // Bare fridagene som overlapper perioden er interessante
  const off = file.holidays
    .map((h) => [parseIso(h.start), parseIso(h.end)] as const)
    .filter(([hs, he]) => Number.isFinite(hs) && Number.isFinite(he) && hs <= e && he >= s);
  let n = 0;
  for (let t = s; t <= e; t = addDays(t, 1)) {
    if (weekday(t) < workDays && !off.some(([hs, he]) => t >= hs && t <= he)) n++;
  }
  return n;
}
