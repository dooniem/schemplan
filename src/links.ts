// Egne bokser som følger datoene til en annen boks. Når den andre boksen flytter seg
// (oppdatering fra Project eller nye datoer i appen), flyttes den egne boksen like mange dager.
// Lengden på den egne boksen beholdes.
import type { Box, BoxFollow, PlanFile } from './format/types';
import { addDays, daysBetween, parseIso, toIso } from './layout/dates';

export type Edge = BoxFollow['edge'];

const boxesOf = (plan: PlanFile) => new Map(plan.lanes.flatMap((l) => l.boxes.map((b) => [b.id, b] as const)));

/** Datoen boksen følger: start eller slutt på den andre boksen. */
export const edgeDate = (b: Box, edge: Edge): string | null => (b.resolved ? b.resolved[edge] : null);

/** Kan `id` følge `target`? Ikke seg selv, og ikke en boks som selv følger `id` (rundt i ring). */
export function canFollow(plan: PlanFile, id: string, target: string): boolean {
  if (id === target) return false;
  const boxes = boxesOf(plan);
  const t = boxes.get(target);
  if (!t?.resolved || !boxes.get(id)?.manual) return false;
  const seen = new Set<string>();
  for (let cur: Box | undefined = t; cur?.follows; cur = boxes.get(cur.follows.box)) {
    if (cur.follows.box === id || seen.has(cur.id)) return false;
    seen.add(cur.id);
  }
  return true;
}

/** Setter boksen til å følge `target`. Datoene endres ikke nå, bare når den andre flytter seg. */
export function setFollow(plan: PlanFile, id: string, target: string, edge: Edge): boolean {
  if (!canFollow(plan, id, target)) return false;
  const boxes = boxesOf(plan);
  const at = edgeDate(boxes.get(target)!, edge)!;
  boxes.get(id)!.follows = { box: target, edge, at };
  return true;
}

/**
 * Flytter alle bokser som følger en annen boks, så langt den andre har flyttet seg siden sist.
 * Kjeder (A følger B som følger C) tas i riktig rekkefølge. Koblinger til bokser som er borte, fjernes.
 * Gir antall bokser som ble flyttet.
 */
export function applyFollows(plan: PlanFile): number {
  const boxes = boxesOf(plan);
  const done = new Set<string>();
  let moved = 0;
  const visit = (b: Box, depth: number) => {
    if (done.has(b.id) || !b.follows) return;
    done.add(b.id);
    const t = boxes.get(b.follows.box);
    if (!t || !b.manual || depth > boxes.size) {
      delete b.follows;
      return;
    }
    visit(t, depth + 1);
    const now = edgeDate(t, b.follows.edge);
    if (!now || !b.resolved) return;
    const d = daysBetween(parseIso(b.follows.at), parseIso(now));
    b.follows.at = now;
    if (!d) return;
    b.resolved.start = toIso(addDays(parseIso(b.resolved.start), d));
    b.resolved.finish = toIso(addDays(parseIso(b.resolved.finish), d));
    moved++;
  };
  for (const b of boxes.values()) visit(b, 0);
  return moved;
}

/** Bokser som følger denne boksen. */
export const followersOf = (plan: PlanFile, id: string): Box[] => plan.lanes.flatMap((l) => l.boxes.filter((b) => b.follows?.box === id));
