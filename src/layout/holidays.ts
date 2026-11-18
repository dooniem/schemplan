import type { Holiday } from '../format/types';
import { addDays, daysBetween, parseIso, weekday } from './dates';

/** Standard for minste ferielengde i dager: tor–søn i påsken kommer med, enkeltstående fridager ikke. */
export const DEFAULT_MIN_HOLIDAY_DAYS = 4;
export const MAX_MIN_HOLIDAY_DAYS = 31;

/** Minste ferielengde i hele dager, 1–31. */
export function minHolidayDays(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_MIN_HOLIDAY_DAYS;
  return Math.min(MAX_MIN_HOLIDAY_DAYS, Math.max(1, Math.round(v)));
}

/** Sammenhengende friperiode, første og siste dag (UTC-midnatt). */
export interface HolidaySpan {
  s: number;
  e: number;
}

/**
 * Fridagene slått sammen til sammenhengende perioder, og bare de som er minst `minDays` lange.
 * Fridager som ligger inntil hverandre eller overlapper, blir én periode. Helgedager (dager utenfor
 * arbeidsuka) inntil en fridag regnes med, så skjærtorsdag og langfredag blir tor–søn, og
 * tor–fre + 2. påskedag blir tor–man.
 */
export function holidaySpans(holidays: Holiday[], minDays: number, workDays = 5): HolidaySpan[] {
  const offDay = (t: number) => weekday(t) >= workDays;
  const raw = holidays
    .map((h) => ({ s: parseIso(h.start), e: parseIso(h.end) }))
    .filter((h) => Number.isFinite(h.s) && Number.isFinite(h.e) && h.e >= h.s)
    .map((h) => {
      let { s, e } = h;
      while (offDay(addDays(s, -1))) s = addDays(s, -1);
      while (offDay(addDays(e, 1))) e = addDays(e, 1);
      return { s, e };
    })
    .sort((a, b) => a.s - b.s);
  const merged: HolidaySpan[] = [];
  for (const h of raw) {
    const last = merged[merged.length - 1];
    if (last && h.s <= addDays(last.e, 1)) last.e = Math.max(last.e, h.e);
    else merged.push({ ...h });
  }
  return merged.filter((h) => daysBetween(h.s, h.e) + 1 >= minDays);
}
