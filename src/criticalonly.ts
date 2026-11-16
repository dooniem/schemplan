import type { PlanFile } from './format/types';

/**
 * «Vis bare kritiske aktiviteter» i tegnemodus for kritisk linje. Bokser og milepæler som ikke er
 * med i linjen, skjules på skjermen. Planen endres ikke, og alt står på samme plass, så linjen
 * ser lik ut med og uten filteret.
 */

/** Id-ene til boksene og milepælene som er med i den kritiske linjen. */
export function criticalIds(plan: PlanFile): Set<string> {
  const ids = new Set<string>();
  for (const l of plan.lanes) for (const b of l.boxes) if (b.critical) ids.add(b.id);
  return ids;
}

/** Elementene som vises med filteret på. `keep` er null når filteret er av. */
export function shownItems<T extends { id: string }>(items: readonly T[], keep: Set<string> | null): T[] {
  return keep ? items.filter((it) => keep.has(it.id)) : [...items];
}

/** Skjuler eller viser boksene i den tegnede planen. `keep` er null når filteret er av. */
export function paintCriticalOnly(svg: SVGSVGElement, keep: Set<string> | null): void {
  svg.querySelectorAll<SVGGElement>('g.items > g[data-id]').forEach((g) => {
    g.classList.toggle('crit-out', !!keep && !keep.has(g.getAttribute('data-id')!));
  });
}
