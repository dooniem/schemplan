// Inntil tre kritiske linjer i samme plan. En boks kan være med i flere linjer, for eksempel der to
// linjer møtes. Linje 1 lagres som `critical: true`, som før, så eldre arbeidsfiler åpnes uendret.
import type { Box, PlanFile } from './format/types';

/** Så mange kritiske linjer en plan kan ha. */
export const MAX_CRITICAL = 3;
/** Linjenumrene, 1 til og med MAX_CRITICAL. */
export const CRITICAL_NUMBERS = Array.from({ length: MAX_CRITICAL }, (_, i) => i + 1);

export type CriticalDash = 'solid' | 'dashed' | 'dotted';
export interface CriticalStyle {
  width: number;
  color: string;
  dash?: CriticalDash;
}

/** Utseendet når ingenting er valgt: rød for linje 1, oransje og lilla for de neste. */
export const CRITICAL_DEFAULTS: Record<number, CriticalStyle> = {
  1: { width: 0.6, color: '#E00000' },
  2: { width: 0.6, color: '#FF6600' },
  3: { width: 0.6, color: '#C000C0' },
};

/** Linjene boksen er med i, i stigende rekkefølge. */
export function linesOf(b: Pick<Box, 'critical'>): number[] {
  if (b.critical === true) return [1];
  if (Array.isArray(b.critical)) return [...b.critical].sort((x, y) => x - y);
  return [];
}

export const inLine = (b: Pick<Box, 'critical'>, n: number) => linesOf(b).includes(n);

/** Tar boksen med i linje n eller ut av den. Bare linje 1 lagres som true, ingen linje som ingenting. */
export function setInLine(b: Box, n: number, on: boolean): void {
  const s = new Set(linesOf(b));
  if (on) s.add(n);
  else s.delete(n);
  const list = [...s].sort((x, y) => x - y);
  if (!list.length) delete b.critical;
  else if (list.length === 1 && list[0] === 1) b.critical = true;
  else b.critical = list;
}

/** Id-ene til boksene og milepælene i linje n. */
export function lineIds(plan: PlanFile, n: number): Set<string> {
  const ids = new Set<string>();
  for (const l of plan.lanes) for (const b of l.boxes) if (inLine(b, n)) ids.add(b.id);
  return ids;
}

/** Linjene som har minst én boks. */
export function usedLines(plan: PlanFile): number[] {
  const s = new Set<number>();
  for (const l of plan.lanes) for (const b of l.boxes) for (const n of linesOf(b)) s.add(n);
  return [...s].sort((x, y) => x - y);
}

type LayoutStyles = Pick<PlanFile['plan']['layout'], 'criticalLine' | 'criticalLine2' | 'criticalLine3'>;
const styleKey = (n: number) => (n === 2 ? 'criticalLine2' : n === 3 ? 'criticalLine3' : 'criticalLine') satisfies keyof LayoutStyles;

/** Utseendet til linje n: det som er valgt i appen, ellers standard for linjen. */
export function styleOf(layout: LayoutStyles, n: number): CriticalStyle {
  return layout[styleKey(n)] ?? CRITICAL_DEFAULTS[n] ?? CRITICAL_DEFAULTS[1];
}

/** Endrer utseendet til linje n. */
export function setStyle(layout: LayoutStyles, n: number, v: Partial<CriticalStyle>): void {
  layout[styleKey(n)] = { ...styleOf(layout, n), ...v } as LayoutStyles['criticalLine'];
}
