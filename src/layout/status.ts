// Statuslinjen: en loddrett strek gjennom planen på statusdatoen. Det som ligger til venstre
// for streken skal være utført.
//
// Statusdatoen fra Project regnes som utført ut dagen, så streken står ved slutten av den
// dagen. Mandag denne uken og egendefinert dato er starten av dagen. I arbeidstid er slutten av fredag og starten av mandag samme punkt.

import type { HexColor, IsoDate, PlanFile, ProgressFront, StatusLine } from '../format/types';
import { addDays, parseIso, toIso, weekday } from './dates';

/** Mørkere rød enn den kritiske linjen (#E00000), så de to skiller seg fra hverandre. */
export const STATUS_RED: HexColor = '#A8003A';
export const STATUS_DEFAULT: StatusLine = { on: false, source: 'monday', width: 0.5, color: STATUS_RED, label: true };
export const FRONT_DEFAULT: ProgressFront = { on: false, against: 'plan', late: false, deviation: false };
export const STATUS_WIDTHS: [number, string][] = [[0.3, 'Tynn'], [0.5, 'Middels'], [0.9, 'Tykk']];
export const STATUS_COLORS: [HexColor, string][] = [[STATUS_RED, 'Mørk rød'], ['#E00000', 'Rød'], ['#FF6600', 'Oransje'], ['#0050D0', 'Blå'], ['#000000', 'Svart']];

export interface StatusMoment {
  /** Dagen streken hører til. */
  day: IsoDate;
  /** true: streken står ved slutten av dagen (dagen er utført). false: ved starten. */
  endOfDay: boolean;
  /** Tidspunktet som første dag etter det utførte, ms UTC. */
  t: number;
}

/** Hvor streken står etter valget, eller null om valget ikke kan brukes (ingen statusdato fra Project). */
export function resolveStatus(rule: StatusLine, file: PlanFile, today: IsoDate): StatusMoment | null {
  if (rule.source === 'project') {
    // Tåler tekst som ikke er en dato («NA», tom tekst): da finnes det ingen statusdato
    const d = file.plan.statusDate;
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(parseIso(d))) return null;
    return { day: d, endOfDay: true, t: addDays(parseIso(d), 1) };
  }
  const day = rule.source === 'custom' && rule.date ? rule.date : toIso(addDays(parseIso(today), -weekday(parseIso(today))));
  return { day, endOfDay: false, t: parseIso(day) };
}

const WEEKDAYS = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const dm = (iso: IsoDate) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;
/** «fredag 6.11» */
export const dayName = (iso: IsoDate) => `${WEEKDAYS[weekday(parseIso(iso))]} ${dm(iso)}`;
/** Teksten på streken: «Status 6.11» */
export const statusLabel = (m: StatusMoment) => `Status ${dm(m.day)}`;

/** Forklaringen under datovalget i menyen. */
export function statusHelp(rule: StatusLine, m: StatusMoment | null, file?: PlanFile): string {
  const help = helpText(rule, m);
  if (!m || !file) return help;
  const cal = file.plan.calendar;
  if (m.day < cal.start) return `${help} Planen starter senere, så linjen vises ikke.`;
  if (m.day > cal.end) return `${help} Planen er ferdig før, så linjen vises ikke.`;
  return help;
}

function helpText(rule: StatusLine, m: StatusMoment | null): string {
  if (rule.source === 'project') {
    return m
      ? `Linjen står ved slutten av ${dayName(m.day)}, fordi Project regner statusdagen som utført.`
      : 'Planen har ingen statusdato fra Project. Velg et annet valg, eller sett statusdato i Project og oppdater.';
  }
  if (!m) return '';
  if (rule.source === 'monday') return `Linjen står ved starten av ${dayName(m.day)}. Det som er gjort til og med fredag regnes som utført.`;
  return `Linjen står ved starten av ${dayName(m.day)}. Velg dagen etter for å ta med hele dagen.`;
}

/** Leser valget fra en fil. Gir null om det ikke har riktig form. */
export function readStatusLine(v: unknown): StatusLine | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.on !== 'boolean' || typeof o.label !== 'boolean') return null;
  if (!['project', 'monday', 'custom'].includes(o.source as string)) return null;
  if (!(typeof o.width === 'number' && o.width > 0 && o.width <= 5)) return null;
  if (!(typeof o.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(o.color))) return null;
  if (o.date !== undefined && !(typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && !Number.isNaN(parseIso(o.date)))) return null;
  if (o.source === 'custom' && o.date === undefined) return null;
  let front: ProgressFront | undefined;
  if (o.front !== undefined) {
    const f = o.front as Record<string, unknown>;
    if (typeof f !== 'object' || f === null || typeof f.on !== 'boolean' || typeof f.late !== 'boolean' || typeof f.deviation !== 'boolean' || !['plan', 'baseline'].includes(f.against as string)) return null;
    front = { on: f.on, against: f.against as ProgressFront['against'], late: f.late, deviation: f.deviation };
  }
  return { on: o.on, source: o.source as StatusLine['source'], ...(o.date !== undefined ? { date: o.date as string } : {}), width: o.width, color: o.color as string, label: o.label, ...(front ? { front } : {}) };
}
