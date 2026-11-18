// Start- og sluttdato som egen rad i boksene, under teksten (også i callouts).
// Valget gjelder hele planen, og hver boks kan ha sitt eget valg som går foran.
// Raden er litt mindre og i en dempet utgave av tekstfargen, så den ikke tar fokus fra teksten.
import type { Box, PlanFile } from '../format/types';
import { mixColor } from './color';
import { isoWeek, MONTHS_NB, parseIso } from './dates';
import { LINE_HEIGHT, type Measure } from './text';

const EPS = 1e-6;
/** Tankestreken mellom datoene. Raden kan brytes rett etter den når boksen er for smal. */
export const DATE_DASH = '–';
/** Datoraden i forhold til teksten i boksen. */
export const DATE_SCALE = 0.8;
/** Hvor langt tekstfargen blandes mot bakgrunnen, så datoen blir dempet men fortsatt lesbar. */
const DATE_MUTE = 0.35;

export type DateFormat = 'dm' | 'dmy' | 'dmon' | 'week';
export const DATE_FORMATS: readonly DateFormat[] = ['dm', 'dmy', 'dmon', 'week'];
export const DEFAULT_DATE_FORMAT: DateFormat = 'dm';

const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const one: Record<Exclude<DateFormat, 'week'>, (iso: string) => string> = {
  dm,
  dmy: (iso) => `${dm(iso)}.${iso.slice(2, 4)}`,
  dmon: (iso) => `${Number(iso.slice(8, 10))}. ${MONTHS_NB[Number(iso.slice(5, 7)) - 1].toLowerCase()}`,
};

/** Datoene som tekst i valgt format. Starter og slutter boksen samme dag (eller uke), står den bare én gang. */
export function dateText(start: string, finish: string, format: DateFormat = DEFAULT_DATE_FORMAT): string {
  if (format === 'week') {
    const a = isoWeek(parseIso(start)).week;
    const b = isoWeek(parseIso(finish)).week;
    return a === b ? `uke ${a}` : `uke ${a}${DATE_DASH}${b}`;
  }
  const f = one[format] ?? dm;
  return start === finish ? f(start) : `${f(start)}${DATE_DASH}${f(finish)}`;
}

/** Eksempel til valget av format. */
export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  dm: '03.11–14.11',
  dmy: '03.11.26–14.11.26',
  dmon: '3. nov–14. nov',
  week: 'uke 45–46',
};

type Shown = Pick<Box, 'showDates' | 'resolved'>;

/** Om boksen viser datoene: boksens eget valg, ellers valget for planen. Milepæler har sin egen dato. */
export function datesShown(box: Shown, plan: PlanFile): boolean {
  if (!box.resolved || box.resolved.isMilestone) return false;
  return box.showDates ?? !!plan.plan.layout.showDates;
}

/** Datoraden til boksen, eller null når den ikke vises. */
export function boxDateText(box: Shown, plan: PlanFile): string | null {
  if (!datesShown(box, plan)) return null;
  return dateText(box.resolved!.start, box.resolved!.finish, plan.plan.layout.dateFormat ?? DEFAULT_DATE_FORMAT);
}

/** Datoraden brutt for bredden: på én rad, eller delt etter tankestreken når den ikke får plass. */
export function dateRows(text: string, maxWidth: number, size: number, measure: Measure): string[] {
  const i = text.indexOf(DATE_DASH);
  if (i < 0 || measure(text, size) <= maxWidth + EPS) return [text];
  return [text.slice(0, i + 1), text.slice(i + 1)];
}

/** Bredden datoraden minst trenger, altså den lengste delen når den deles etter tankestreken. */
export function dateMinWidth(text: string, size: number, measure: Measure): number {
  const i = text.indexOf(DATE_DASH);
  if (i < 0) return measure(text, size);
  return Math.max(measure(text.slice(0, i + 1), size), measure(text.slice(i + 1), size));
}

/** Datoraden i en tekstblokk: radene fra og med `from` tegnes i størrelsen og fargen her. */
export interface DateSub {
  from: number;
  size: number;
  color: string;
}

/** Dempet tekstfarge for datoen: tekstfargen blandet litt mot bakgrunnen. */
export const dateColor = (text: string, bg: string) => mixColor(text, bg, DATE_MUTE);

/** Høyden på tekstlinjene, når de siste `subN` er datorader i størrelsen `subSize`. */
export const linesHeight = (n: number, size: number, subN = 0, subSize = size) => (n - subN) * size * LINE_HEIGHT + subN * subSize * LINE_HEIGHT;

/**
 * Viser eller skjuler datoene på boksene. Et valg som er likt valget for planen lagres ikke,
 * så boksen følger planen igjen hvis det endres senere.
 */
export function setBoxDates(plan: PlanFile, ids: readonly string[], on: boolean): void {
  const all = !!plan.plan.layout.showDates;
  const want = new Set(ids);
  for (const l of plan.lanes)
    for (const b of l.boxes) {
      if (!want.has(b.id) || b.resolved?.isMilestone) continue;
      if (on === all) delete b.showDates;
      else b.showDates = on;
    }
}

/**
 * Datoer på alle boksene, eller på ingen. Bokser med eget valg beholder det,
 * så datoene kan være slått av eller på for enkeltbokser.
 */
export function setPlanDates(plan: PlanFile, on: boolean): void {
  if (on) plan.plan.layout.showDates = true;
  else delete plan.plan.layout.showDates;
  // Eget valg som nå er likt valget for planen, trengs ikke lenger
  for (const l of plan.lanes) for (const b of l.boxes) if (b.showDates === on) delete b.showDates;
}

/** Datoformatet for planen. Standardformatet lagres ikke. */
export function setDateFormat(plan: PlanFile, f: DateFormat): void {
  if (f === DEFAULT_DATE_FORMAT) delete plan.plan.layout.dateFormat;
  else plan.plan.layout.dateFormat = f;
}
