// Grupper av lanes: lanes som står etter hverandre får en smal bar med rotert tekst til venstre for
// lane-navnene. Baren tar plass fra navnene i gruppen, så lane-kolonnen blir ikke bredere.
// Gruppen husker lane-id-ene. Den tegnes over lanene som vises og står etter hverandre; en lane
// utenfor gruppen midt i den deler baren i to.
import type { LaneGroup, PlanFile } from './format/types';

/** Standardfargen på en ny gruppe: oransje blant lanefargene (nr. 4). */
export const GROUP_DEFAULT_FILL = '#FCC781';

const shownLanes = (plan: PlanFile) => plan.lanes.filter((l) => l.shown && !l.hidden);

/** Gruppen lanen er med i, om noen. */
export const groupOfLane = (plan: PlanFile, laneId: string): LaneGroup | undefined =>
  plan.plan.layout.laneGroups?.find((g) => g.lanes.includes(laneId));

export const findGroup = (plan: PlanFile, id: string): LaneGroup | undefined => plan.plan.layout.laneGroups?.find((g) => g.id === id);

/** Lanes som vises, fra `a` til `b` (begge med), i rekkefølgen på arket. */
export function laneRange(plan: PlanFile, a: string, b: string): string[] {
  const ids = shownLanes(plan).map((l) => l.id);
  const i = ids.indexOf(a);
  const j = ids.indexOf(b);
  if (i < 0 || j < 0) return [];
  return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
}

/** Lanes `id` kan grupperes med: de som vises, unntatt den selv og lanene i gruppen den alt er i. */
export function groupTargets(plan: PlanFile, id: string) {
  const own = groupOfLane(plan, id)?.lanes ?? [id];
  return shownLanes(plan).filter((l) => l.id !== id && !own.includes(l.id));
}

/** Tar lanene ut av gruppene de er i. Grupper uten lanes blir borte. */
function takeOut(plan: PlanFile, ids: string[]) {
  const gs = plan.plan.layout.laneGroups;
  if (!gs) return;
  for (const g of gs) g.lanes = g.lanes.filter((x) => !ids.includes(x));
  prune(plan);
}

/** Fjerner lanes som ikke finnes lenger, og grupper uten lanes. */
function prune(plan: PlanFile) {
  const gs = plan.plan.layout.laneGroups;
  if (!gs) return;
  const ids = new Set(plan.lanes.map((l) => l.id));
  for (const g of gs) g.lanes = g.lanes.filter((x) => ids.has(x));
  const left = gs.filter((g) => g.lanes.length);
  if (left.length) plan.plan.layout.laneGroups = left;
  else delete plan.plan.layout.laneGroups;
}

/**
 * Lager en gruppe av lanene fra `a` til `b`. Lanene tas ut av grupper de var i fra før.
 * Navnet og fargen tas fra `like` når den er gitt.
 */
export function createLaneGroup(plan: PlanFile, a: string, b: string, like?: Pick<LaneGroup, 'name' | 'fill'>): LaneGroup | null {
  const ids = laneRange(plan, a, b);
  if (!ids.length) return null;
  takeOut(plan, ids);
  const used = new Set((plan.plan.layout.laneGroups ?? []).map((g) => g.id));
  let n = 1;
  while (used.has(`grp_${n}`)) n++;
  const g: LaneGroup = { id: `grp_${n}`, name: like?.name ?? 'Gruppe', fill: like?.fill ?? GROUP_DEFAULT_FILL, lanes: ids };
  (plan.plan.layout.laneGroups ??= []).push(g);
  return g;
}

/** Oppløser gruppen. Lanene står der de står. */
export function dissolveLaneGroup(plan: PlanFile, id: string): void {
  const gs = plan.plan.layout.laneGroups;
  if (!gs) return;
  plan.plan.layout.laneGroups = gs.filter((g) => g.id !== id);
  prune(plan);
}

/**
 * Tar lanen ut av gruppen sin. Står den midt i gruppen, deles gruppen i to med samme tekst og farge,
 * så hver del får sin egen bar.
 */
export function removeFromLaneGroup(plan: PlanFile, laneId: string): void {
  const g = groupOfLane(plan, laneId);
  if (!g) return;
  takeOut(plan, [laneId]);
  if (!g.lanes.length) return;
  const vis = shownLanes(plan).map((l) => l.id);
  const runs = groupRuns([g], vis);
  if (runs.length < 2) return;
  // Den øverste delen beholder gruppen; resten blir nye grupper
  for (const r of runs.slice(1)) {
    const ids = vis.slice(r.start, r.end + 1);
    g.lanes = g.lanes.filter((x) => !ids.includes(x));
    createLaneGroup(plan, ids[0], ids[ids.length - 1], g);
  }
}

/**
 * «Grupper med …»: er `from` i en gruppe, utvides gruppen til og med `to`. Ellers lages en ny
 * gruppe av lanene fra `from` til `to`. Gir gruppen.
 */
export function groupLanes(plan: PlanFile, from: string, to: string): LaneGroup | null {
  const g = groupOfLane(plan, from);
  if (!g) return createLaneGroup(plan, from, to);
  const vis = shownLanes(plan).map((l) => l.id);
  const at = [...g.lanes, to].map((x) => vis.indexOf(x)).filter((i) => i >= 0);
  const ids = vis.slice(Math.min(...at), Math.max(...at) + 1);
  takeOut(plan, ids.filter((x) => !g.lanes.includes(x)));
  for (const x of ids) if (!g.lanes.includes(x)) g.lanes.push(x);
  return g;
}

/** Lanene i rekkefølgen på arket som gruppen vil dekke om `from` grupperes med `to`. */
export function groupPreview(plan: PlanFile, from: string, to: string): string[] {
  const g = groupOfLane(plan, from);
  const vis = shownLanes(plan).map((l) => l.id);
  const at = [...(g ? g.lanes : [from]), to].map((x) => vis.indexOf(x)).filter((i) => i >= 0);
  return at.length ? vis.slice(Math.min(...at), Math.max(...at) + 1) : [];
}

/** Lanen rett over (-1) eller under (1) gruppen, blant lanene som vises og ikke er i gruppen. */
export function laneBeside(plan: PlanFile, id: string, dir: -1 | 1): string | null {
  const g = findGroup(plan, id);
  if (!g) return null;
  const vis = shownLanes(plan).map((l) => l.id);
  const at = vis.map((x, i) => (g.lanes.includes(x) ? i : -1)).filter((i) => i >= 0);
  if (!at.length) return null;
  return vis[dir < 0 ? Math.min(...at) - 1 : Math.max(...at) + 1] ?? null;
}

/** Tar med lanen rett over eller under gruppen. Er den i en annen gruppe, tas den ut av den. */
export function growLaneGroup(plan: PlanFile, id: string, dir: -1 | 1): boolean {
  const next = laneBeside(plan, id, dir);
  if (!next) return false;
  takeOut(plan, [next]);
  const g = findGroup(plan, id);
  if (!g) return false;
  g.lanes.push(next);
  return true;
}

/**
 * Etter at en lane er flyttet eller laget: står den ikke lenger inntil en annen lane i gruppen sin,
 * går den ut av gruppen. Står den mellom to lanes i samme gruppe, blir den med i den.
 */
export function settleLaneGroups(plan: PlanFile, laneId: string): void {
  const gs = plan.plan.layout.laneGroups;
  if (!gs) return;
  prune(plan);
  const vis = shownLanes(plan).map((l) => l.id);
  const i = vis.indexOf(laneId);
  if (i < 0) return;
  const above = vis[i - 1];
  const below = vis[i + 1];
  const own = groupOfLane(plan, laneId);
  if (own && own.lanes.length > 1 && !own.lanes.includes(above) && !own.lanes.includes(below)) takeOut(plan, [laneId]);
  if (groupOfLane(plan, laneId)) return;
  const g = above && groupOfLane(plan, above);
  if (g && below && g.lanes.includes(below)) g.lanes.push(laneId);
}

/** Lanene i en gruppe som står etter hverandre på arket: første og siste plass i `ids`. */
export interface GroupRun {
  group: LaneGroup;
  start: number;
  end: number;
}

/** Finner barene som skal tegnes: én per rekke av lanes etter hverandre i samme gruppe. */
export function groupRuns(groups: LaneGroup[] | undefined, ids: string[]): GroupRun[] {
  if (!groups?.length) return [];
  const of = new Map<string, LaneGroup>();
  for (const g of groups) for (const x of g.lanes) if (!of.has(x)) of.set(x, g);
  const runs: GroupRun[] = [];
  ids.forEach((id, i) => {
    const g = of.get(id);
    if (!g) return;
    const last = runs[runs.length - 1];
    if (last && last.group === g && last.end === i - 1) last.end = i;
    else runs.push({ group: g, start: i, end: i });
  });
  return runs;
}
