import type { PlanFile } from './format/types';
import type { Item } from './layout/layout';
import { inHeaderBox } from './editmodel';

/**
 * «Vis bare kritiske aktiviteter» i tegnemodus for kritisk linje. Bokser og milepæler som ikke er
 * med i linjen, skjules. Planen endres ikke, og alt står på samme plass, så linjen ser lik ut med
 * og uten filteret. Visningen kan lagres som en PDF for deling.
 */

/** Id-ene til boksene og milepælene som er med i den kritiske linjen. */
export function criticalIds(plan: PlanFile): Set<string> {
  const ids = new Set<string>();
  for (const l of plan.lanes) for (const b of l.boxes) if (b.critical) ids.add(b.id);
  return ids;
}

/**
 * Det som vises med filteret på: boksene i linjen, og med `headers` også overskriftsboksene
 * de ligger i.
 */
export function criticalKeep(plan: PlanFile, items: readonly Item[], headers: boolean): Set<string> {
  const keep = criticalIds(plan);
  if (!headers) return keep;
  const inLine = items.filter((it) => keep.has(it.id));
  for (const h of items) if (h.kind === 'box' && h.header && inLine.some((it) => inHeaderBox(h, it))) keep.add(h.id);
  return keep;
}

/** Elementene som vises med filteret på. `keep` er null når filteret er av. */
export function shownItems<T extends { id: string }>(items: readonly T[], keep: Set<string> | null): T[] {
  return keep ? items.filter((it) => keep.has(it.id)) : [...items];
}

/** Boksene, og det som hører til dem andre steder i tegningen (linjer, fremdrift, endringsmerker, symbolbilder). */
const parts = (svg: SVGSVGElement): [Element, string][] => [
  ...[...svg.querySelectorAll('g.items > g[data-id]')].map((g): [Element, string] => [g, g.getAttribute('data-id')!]),
  ...[...svg.querySelectorAll('[data-for]')].map((g): [Element, string] => [g, g.getAttribute('data-for')!]),
];

/** Skjuler eller viser boksene i den tegnede planen. `keep` er null når filteret er av. */
export function paintCriticalOnly(svg: SVGSVGElement, keep: Set<string> | null): void {
  for (const [g, id] of parts(svg)) g.classList.toggle('crit-out', !!keep && !keep.has(id));
}

/** Tar bort boksene som ikke vises, fra en plan som er tegnet for PDF. */
export function dropHidden(svg: SVGSVGElement, keep: Set<string>): void {
  for (const [g, id] of parts(svg)) if (!keep.has(id)) g.remove();
}

/** Bildene som tegnes med filteret på: symbolet til en milepæl som er skjult, er ikke med. */
export function shownImages<T extends { milestone: string | null }>(images: readonly T[], keep: Set<string>): T[] {
  return images.filter((im) => !im.milestone || keep.has(im.milestone));
}
