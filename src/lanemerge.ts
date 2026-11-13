// Slå sammen to lanes: bokser og milepæler i den ene flyttes til den andre, og den første blir borte.
// En lane fra Project kan ikke slettes, for den kommer tilbake ved «Oppdater fra Project». Den skjules
// i stedet og husker hvor den er slått sammen til (`mergedInto`), så nye bokser fra Project i den
// lanen også havner der.
import type { Box, Lane, PlanFile } from './format/types';

/** Lanen boksene i `id` hører hjemme i nå: følger sammenslåinger, også flere etter hverandre. */
export function homeLane(plan: PlanFile, id: string): Lane | null {
  const byId = new Map(plan.lanes.map((l) => [l.id, l]));
  let lane = byId.get(id) ?? null;
  const seen = new Set<string>();
  while (lane?.mergedInto && !seen.has(lane.id)) {
    seen.add(lane.id);
    const next = byId.get(lane.mergedInto);
    if (!next) break;
    lane = next;
  }
  return lane;
}

/** Lanes som kan slås sammen med `id`: de som vises, unntatt den selv. */
export const mergeTargets = (plan: PlanFile, id: string) => plan.lanes.filter((l) => l.id !== id && l.shown && !l.hidden);

/**
 * Flytter alt i lanen `fromId` til `toId` og fjerner `fromId`. Festede bokser beholder plassen seg
 * imellom, men flyttes `offset` tekstlinjer ned, så de havner under det som står i lanen fra før.
 * Gir boksene som ble flyttet, eller null om det ikke går.
 */
export function mergeLanes(plan: PlanFile, fromId: string, toId: string, offset = 0): Box[] | null {
  const from = plan.lanes.find((l) => l.id === fromId);
  const to = plan.lanes.find((l) => l.id === toId);
  if (!from || !to || from === to) return null;
  const moved = from.boxes;
  const toAt = plan.lanes.indexOf(to);

  for (const b of moved) {
    // Som moveBox: en boks fra Project husker lanen den kom fra, så «Oppdater fra Project» finner den igjen
    if (!b.manual) {
      if (!b.fromLane) b.fromLane = from.id;
      if (b.fromLane === to.id) delete b.fromLane;
    }
    if (b.top !== undefined) b.top = Math.round((b.top + offset) * 100) / 100;
    // Kompakt pakker lanen på nytt uansett
    delete b.compactTop;
    if (b.spanTo === to.id) dropSpan(b);
  }
  if (to.order) to.order = [...to.order, ...(from.order ?? moved.map((b) => b.id))];
  to.boxes = [...to.boxes, ...moved];
  from.boxes = [];
  delete from.order;

  // Multi Lane-bokser som gikk ned til lanen som blir borte, går ned til den nye lanen hvis den ligger
  // under dem. Ellers blir de vanlige bokser.
  plan.lanes.forEach((l, i) => {
    for (const b of l.boxes) if (b.spanTo === from.id) {
      if (toAt > i) b.spanTo = to.id;
      else dropSpan(b);
    }
  });

  for (const l of plan.lanes) if (l.mergedInto === from.id) l.mergedInto = to.id;
  if (from.manual) plan.lanes.splice(plan.lanes.indexOf(from), 1);
  else {
    from.hidden = true;
    from.mergedInto = to.id;
  }
  return moved;
}

function dropSpan(b: Box) {
  delete b.spanTo;
  delete b.spanEnd;
  delete b.compactSpanEnd;
}

/**
 * Etter «Oppdater fra Project»: bokser fra Project som ligger i en sammenslått lane (nye, eller lagt dit
 * i Project), flyttes dit lanen er slått sammen til. Er den lanen borte, vises lanen igjen.
 * Gir navnene på lanene som ble vist igjen.
 */
export function followMerged(plan: PlanFile): string[] {
  const shownAgain: string[] = [];
  for (const lane of plan.lanes) {
    if (!lane.mergedInto) continue;
    const home = homeLane(plan, lane.id);
    if (!home || home === lane) {
      delete lane.mergedInto;
      delete lane.hidden;
      shownAgain.push(lane.name);
      continue;
    }
    if (!lane.boxes.length) continue;
    for (const b of lane.boxes) if (!b.manual && !b.fromLane) b.fromLane = lane.id;
    home.boxes.push(...lane.boxes);
    if (home.order) home.order.push(...lane.boxes.map((b) => b.id));
    lane.boxes = [];
  }
  return shownAgain;
}
