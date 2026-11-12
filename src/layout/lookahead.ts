// Utkikk: planen tegnes bare for en periode på noen uker. Perioden er en regel («denne uken
// og 3 uker fram»), ikke faste datoer, så den ruller videre neste gang filen åpnes.
// Selve planen endres ikke: appen lager en kopi med kalenderen satt til perioden, og
// tegningen pakker boksene på nytt ut fra den.

import type { Lookahead, PlanFile } from '../format/types';
import { addDays, isoWeek, parseIso, toIso, weekday } from './dates';

export const LOOKAHEAD_DEFAULT: Lookahead = { on: false, from: null, prevWeek: false, length: { weeks: 3 }, hideEmptyLanes: true };
/** Lengste utkikk, i uker. */
export const LOOKAHEAD_MAX_WEEKS = 52;

export interface LookaheadWindow {
  /** Første dag (mandag) og første dag etter perioden (mandag), ms UTC. */
  start: number;
  end: number;
  weeks: number;
  /** «Uke 45–47 2026» */
  label: string;
  /** Kort, til filnavn: «u45-47» */
  tag: string;
  /** Satt når perioden er flyttet eller kuttet for å treffe planen. */
  note: string | null;
}

const WEEK = 7;
/** Mandagen i uken t ligger i. */
export const mondayOf = (t: number) => addDays(t, -weekday(t));
/** Mandagen i ISO-uke `week` i ISO-året `isoYear`. */
export function isoWeekMonday(isoYear: number, week: number): number {
  const jan4 = Date.UTC(isoYear, 0, 4);
  return addDays(mondayOf(jan4), (week - 1) * WEEK);
}
/** 52 eller 53. */
export const weeksInIsoYear = (isoYear: number) => isoWeek(Date.UTC(isoYear, 11, 28)).week;

/** Dagens dato der brukeren er (ikke UTC), som ren dato. */
export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function weekLabel(start: number, end: number): string {
  const a = isoWeek(start);
  const b = isoWeek(addDays(end, -1));
  if (a.year !== b.year) return `Uke ${a.week} ${a.year} – uke ${b.week} ${b.year}`;
  return a.week === b.week ? `Uke ${a.week} ${a.year}` : `Uke ${a.week}–${b.week} ${a.year}`;
}
function weekTag(start: number, end: number): string {
  const a = isoWeek(start);
  const b = isoWeek(addDays(end, -1));
  return a.week === b.week && a.year === b.year ? `u${a.week}` : `u${a.week}-${b.week}`;
}
/** «de første 8 ukene», «den første uken» */
const firstLast = (which: 'første' | 'siste', n: number) => (n === 1 ? `den ${which} uken` : `de ${which} ${n} ukene`);

/**
 * Perioden regelen gir for planen. Ligger perioden før planen starter, vises de første ukene
 * av planen; ligger den etter at planen er slutt, de siste. Et tomt ark ser ut som en feil.
 */
export function resolveWindow(rule: Lookahead, file: PlanFile, today: string, statusDay?: string | null): LookaheadWindow {
  const planStart = mondayOf(parseIso(file.plan.calendar.start));
  const planEnd = addDays(mondayOf(parseIso(file.plan.calendar.end)), WEEK);
  // «Uken med statuslinjen» bruker denne uken når statuslinjen er av
  const from = rule.from && rule.from !== 'status' ? isoWeekMonday(rule.from.year, rule.from.week) : mondayOf(parseIso(rule.from === 'status' && statusDay ? statusDay : today));
  let end = 'weeks' in rule.length ? addDays(from, WEEK * rule.length.weeks) : addDays(isoWeekMonday(rule.length.year, rule.length.week), WEEK);
  if (end <= from) end = addDays(from, WEEK);
  let start = rule.prevWeek ? addDays(from, -WEEK) : from;
  const weeks = Math.min(LOOKAHEAD_MAX_WEEKS, Math.round((end - start) / (WEEK * 86_400_000)));
  end = addDays(start, WEEK * weeks);

  let note: string | null = null;
  const planWeek = (t: number) => {
    const w = isoWeek(t);
    return `uke ${w.week} ${w.year}`;
  };
  if (end <= planStart) {
    start = planStart;
    end = addDays(start, WEEK * weeks);
    note = `Planen starter ${planWeek(planStart)}. Viser ${firstLast('første', weeks)}.`;
  } else if (start >= planEnd) {
    end = planEnd;
    start = addDays(end, -WEEK * weeks);
    note = `Planen sluttet ${planWeek(addDays(planEnd, -1))}. Viser ${firstLast('siste', weeks)}.`;
  }
  if (start < planStart) {
    start = planStart;
    note ??= `Planen starter ${planWeek(planStart)}.`;
  }
  if (end > planEnd) {
    end = planEnd;
    note ??= `Planen slutter ${planWeek(addDays(planEnd, -1))}.`;
  }
  const n = Math.max(1, Math.round((end - start) / (WEEK * 86_400_000)));
  return { start, end, weeks: n, label: weekLabel(start, end), tag: weekTag(start, end), note };
}

const overlaps = (r: { start: string; finish: string } | null, s: string, e: string) => !!r && r.finish >= s && r.start <= e;

/**
 * Kopi av planen for tegning av perioden. Boksene utenfor faller bort av seg selv fordi
 * kalenderen bare dekker perioden, og bokser som stikker utenfor kuttes ved kanten og får
 * tekst og callout regnet ut etter den nye bredden.
 *
 * Festet plass (`top`) og fast lanehøyde brukes ikke i utkikken: med færre bokser ville de gi
 * hull. Unntaket er lanes med en overskriftsboks i perioden, der boksene inni er festet til den.
 */
export function applyLookahead(file: PlanFile, rule: Lookahead, today: string, statusDay?: string | null): { plan: PlanFile; window: LookaheadWindow; extras: LookaheadExtras } {
  const window = resolveWindow(rule, file, today, statusDay);
  const s = toIso(window.start);
  const e = toIso(addDays(window.end, -1));
  const visible = (b: PlanFile['lanes'][number]['boxes'][number]) => b.shown && !b.hidden && overlaps(b.resolved, s, e);
  const anyVisible = file.lanes.some((l) => l.shown && !l.hidden && l.boxes.some(visible));
  const lanes = file.lanes.map((lane) => {
    const keepPins = lane.boxes.some((b) => (b.header || b.spanTo !== undefined) && visible(b));
    const boxes = keepPins ? lane.boxes : lane.boxes.map((b) => (b.top === undefined && b.compactTop === undefined ? b : (({ top: _t, compactTop: _c, ...rest }) => rest)(b)));
    const empty = !lane.boxes.some(visible);
    const { height: _h, ...rest } = lane;
    return { ...rest, boxes, hidden: lane.hidden || (rule.hideEmptyLanes && anyVisible && empty) || undefined };
  });
  const title = file.plan.layout.title ?? file.plan.title;
  const plan: PlanFile = {
    ...file,
    plan: {
      ...file.plan,
      calendar: { ...file.plan.calendar, mode: 'week', start: s, end: e },
      layout: { ...file.plan.layout, title: `${title} – utkikk ${window.label.charAt(0).toLowerCase()}${window.label.slice(1)}` },
    },
    lanes,
  };
  return { plan, window, extras: lookaheadExtras(file, window, rule.showOverview !== false) };
}

/** Det som tegnes i tillegg i utkikken: hele planen i miniatyr og de neste milepælene. */
export interface LookaheadExtras {
  /** null når miniatyren er slått av. */
  overview: {
    /** Hele planen: første dag og første dag etter, ms UTC. */
    start: number;
    end: number;
    /** Perioden som vises. */
    winStart: number;
    winEnd: number;
    lanes: number;
    bars: { start: number; end: number; lane: number; trade: string; fill?: string }[];
  } | null;
  /** «Tett hus uke 52», de neste milepælene etter perioden. */
  upcoming: string[];
}

/** Milepæler etter perioden som nevnes, høyst. */
const UPCOMING_MAX = 3;

export function lookaheadExtras(file: PlanFile, window: LookaheadWindow, withOverview = true): LookaheadExtras {
  const lanes = file.lanes.filter((l) => l.shown && !l.hidden);
  const bars: NonNullable<LookaheadExtras['overview']>['bars'] = [];
  const after = toIso(window.end);
  const coming: { date: string; name: string }[] = [];
  lanes.forEach((l, i) => {
    for (const b of l.boxes) {
      const r = b.resolved;
      if (!b.shown || b.hidden || !r) continue;
      if (r.isMilestone) {
        if (r.finish >= after) coming.push({ date: r.finish, name: plainName(b.text) });
        continue;
      }
      bars.push({ start: parseIso(r.start), end: addDays(parseIso(r.finish), 1), lane: i, trade: b.trade ?? r.trade, fill: b.fill });
    }
  });
  const endYear = isoWeek(addDays(window.end, -1)).year;
  const upcoming = coming
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((m, i, all) => m.name && all.findIndex((n) => n.name === m.name && n.date === m.date) === i)
    .slice(0, UPCOMING_MAX)
    .map((m) => {
      const w = isoWeek(parseIso(m.date));
      return `${m.name} uke ${w.week}${w.year !== endYear ? ` ${w.year}` : ''}`;
    });
  return {
    overview: !withOverview ? null : {
      start: parseIso(file.plan.calendar.start),
      end: addDays(parseIso(file.plan.calendar.end), 1),
      winStart: window.start,
      winEnd: window.end,
      lanes: lanes.length,
      bars,
    },
    upcoming,
  };
}

/** Teksten i en boks på én linje: linjeskift og streker blir mellomrom, tvunget callout fjernes. */
const plainName = (s: string) => s.replace(/\/?\|/g, ' ').replace(/^\*/, '').replace(/\s+/g, ' ').trim();

/** Leser regelen fra en fil. Gir null om den ikke har riktig form. */
export function readLookahead(v: unknown): Lookahead | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const week = (w: unknown) => {
    if (typeof w !== 'object' || w === null) return null;
    const { year: y, week: k } = w as Record<string, unknown>;
    return Number.isInteger(y) && Number.isInteger(k) && (y as number) >= 1900 && (y as number) <= 2200 && (k as number) >= 1 && (k as number) <= weeksInIsoYear(y as number) ? { year: y as number, week: k as number } : null;
  };
  if (typeof o.on !== 'boolean' || typeof o.prevWeek !== 'boolean' || typeof o.hideEmptyLanes !== 'boolean') return null;
  const from = o.from === null || o.from === 'status' ? o.from : week(o.from);
  if (o.from !== null && !from) return null;
  const len = o.length as Record<string, unknown> | null;
  if (typeof len !== 'object' || len === null) return null;
  let length: Lookahead['length'];
  if ('weeks' in len) {
    if (!Number.isInteger(len.weeks) || (len.weeks as number) < 1 || (len.weeks as number) > LOOKAHEAD_MAX_WEEKS) return null;
    length = { weeks: len.weeks as number };
  } else {
    const w = week(len);
    if (!w) return null;
    length = w;
  }
  if (o.showOverview !== undefined && typeof o.showOverview !== 'boolean') return null;
  return { on: o.on, from, prevWeek: o.prevWeek, length, hideEmptyLanes: o.hideEmptyLanes, ...(o.showOverview === false ? { showOverview: false } : {}) };
}

/** ISO-uken en dato ligger i. */
export const weekOf = (iso: string) => isoWeek(parseIso(iso));
