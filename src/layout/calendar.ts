import type { PlanSettings } from '../format/types';
import { addDays, day, daysInMonth, isoWeek, month, monthStart, MONTHS_NB, parseIso, weekday, year } from './dates';

/** Én kolonne i kalenderen: en måned eller en uke. */
export interface Column {
  start: number; // første dag (ms, UTC)
  end: number; // første dag etter kolonnen
  label: string; // "Jan" eller "23"
  monthLabel: string; // måned kolonnen hører til (ukesvisning: måneden torsdagen ligger i)
  monthYear: number; // året til måneden over
  /** Excel-lik ukesvisning: uken hører til startmåneden når minst tre av dagene ligger der. */
  excelMonth: string;
  excelMonthYear: number;
  year: number;
  x0: number; // mm
  x1: number; // mm
}

export interface TimeAxis {
  mode: 'month' | 'week';
  columns: Column[];
  x0: number;
  x1: number;
  start: number;
  end: number; // første dag etter kalenderen
  /** x for starten av en dag (venstre kant). */
  xStart(t: number): number;
  /** x for slutten av en dag (høyre kant). Milepæler og sluttdatoer bruker denne. */
  xEnd(t: number): number;
}

export function buildTimeAxis(cal: PlanSettings['calendar'], x0: number, x1: number): TimeAxis {
  const cols: Omit<Column, 'x0' | 'x1'>[] = [];
  const startT = parseIso(cal.start);
  const endT = addDays(parseIso(cal.end), 1);

  if (cal.mode === 'month') {
    let y = year(startT);
    let m = month(startT);
    for (let t = monthStart(y, m); t < endT; ) {
      const next = monthStart(m === 11 ? y + 1 : y, (m + 1) % 12);
      cols.push({ start: t, end: next, label: MONTHS_NB[m], monthLabel: MONTHS_NB[m], monthYear: y, excelMonth: MONTHS_NB[m], excelMonthYear: y, year: y });
      t = next;
      m = (m + 1) % 12;
      if (m === 0) y++;
    }
  } else {
    // Ukesvisning starter på mandagen i første uke
    for (let t = addDays(startT, -weekday(startT)); t < endT; t = addDays(t, 7)) {
      const thursday = addDays(t, 3);
      const w = isoWeek(t);
      // Mandag til onsdag i startmåneden er tre dager: da hører uken til startmåneden
      const excelDay = month(addDays(t, 2)) === month(t) ? t : addDays(t, 6);
      cols.push({
        start: t,
        end: addDays(t, 7),
        label: String(w.week),
        monthLabel: MONTHS_NB[month(thursday)],
        monthYear: year(thursday),
        excelMonth: MONTHS_NB[month(excelDay)],
        excelMonthYear: year(excelDay),
        year: w.year,
      });
    }
  }

  const width = (x1 - x0) / Math.max(1, cols.length);
  const columns: Column[] = cols.map((c, i) => ({ ...c, x0: x0 + i * width, x1: x0 + (i + 1) * width }));
  const workDays = Math.min(7, Math.max(1, Math.round(cal.workingDaysPerWeek || 5)));

  const find = (t: number) => {
    if (t < columns[0].start) return -1;
    if (t >= columns[columns.length - 1].end) return columns.length;
    // Kolonnene har lik bredde, men månedene ulik lengde: søk lineært er raskt nok (maks noen hundre)
    return columns.findIndex((c) => t >= c.start && t < c.end);
  };

  const fraction = (t: number, endOfDay: boolean): number => {
    if (cal.mode === 'month') {
      const dim = daysInMonth(year(t), month(t));
      return (day(t) - (endOfDay ? 0 : 1)) / dim;
    }
    // Uke: fordelt på arbeidsdagene, helg legges til slutten av siste arbeidsdag
    const wd = Math.min(weekday(t), workDays - 1);
    return (wd + (endOfDay ? 1 : 0)) / workDays;
  };

  const xAt = (t: number, endOfDay: boolean) => {
    const i = find(t);
    if (i < 0) return x0;
    if (i >= columns.length) return x1;
    const c = columns[i];
    return c.x0 + fraction(t, endOfDay) * (c.x1 - c.x0);
  };

  return {
    mode: cal.mode,
    columns,
    x0,
    x1,
    start: columns.length ? columns[0].start : startT,
    end: columns.length ? columns[columns.length - 1].end : endT,
    xStart: (t) => xAt(t, false),
    xEnd: (t) => xAt(t, true),
  };
}
