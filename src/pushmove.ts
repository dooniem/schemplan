// Ctrl + dra: boksen legges der den slippes, og boksene den treffer i lanen skyves ned, sammen med
// det de igjen treffer. Boksene som skyves, og løse bokser som ellers ville hoppet til en ny plass
// når lanen pakkes på nytt, festes der de står. Resten av lanen er løs som før.
import type { Box, PlanFile } from './format/types';
import type { Item, Layout } from './layout/layout';
import { bounds, laneOf } from './editmodel';

export interface PushRect {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const EPS = 1e-6;
const overlaps = (a: PushRect, b: PushRect) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;

/**
 * Skyver ned bokser i `others` som overlapper en av `movers`, til rett under den. En boks som er
 * skjøvet, skyver videre det den treffer. Gir ny topp (samme mål som rektanglene) for hver boks som
 * ble skjøvet. Bokser skyves bare nedover.
 */
export function pushDown(movers: PushRect[], others: PushRect[]): Map<string, number> {
  const cur = new Map(others.map((o) => [o.id, { ...o }]));
  const pushers: PushRect[] = movers.map((m) => ({ ...m }));
  const out = new Map<string, number>();
  // Hver runde skyver minst én boks lenger ned; taket er bare en sikring
  for (let round = 0; round < 10_000; round++) {
    let changed = false;
    for (const o of cur.values()) {
      for (const p of pushers) {
        if (p.id === o.id || !overlaps(o, p)) continue;
        const h = o.y1 - o.y0;
        o.y0 = p.y1;
        o.y1 = p.y1 + h;
        out.set(o.id, o.y0);
        if (!pushers.includes(o)) pushers.push(o);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

/**
 * Hvor mye lavere enn ytterkanten (bounds) plassen i lanen regnes fra. For en milepæl regner bounds med
 * et felt på hele symbolstørrelsen over midten, mens lanen regner fra toppen av symbolet eller teksten.
 */
export function pinOffset(it: Item): number {
  if (it.kind === 'box') return 0;
  return Math.max(0, Math.min(it.y - it.size / 2, it.labelBox.y) - bounds(it).y0);
}

/** Høyden en milepæl (symbol og tekst) eller boks (med callout) tar i lanen. */
export function pieceHeight(it: Item): number {
  const b = bounds(it);
  if (it.kind === 'box') return b.y1 - b.y0;
  const top = b.y0 + pinOffset(it);
  return Math.max(it.y + it.size / 2, it.labelBox.y + it.labelBox.h) - top;
}

/** Plassen boksen eller milepælen tar i lanen, som rektangel. */
export function pieceRect(it: Item): PushRect {
  const b = bounds(it);
  const y0 = b.y0 + pinOffset(it);
  return { id: it.id, x0: b.x0, x1: b.x1, y0, y1: y0 + pieceHeight(it) };
}

/** Callouten (eller milepælsteksten) står til venstre eller høyre. */
export type Side = 'left' | 'right' | '';

/** Plassen til hver boks i lanen sin, i tekstlinjer fra toppen av lanen, og siden callouten står på. */
export function placesOf(L: Layout, plan: PlanFile): Map<string, { lane: string; y: number; side: Side }> {
  const out = new Map<string, { lane: string; y: number; side: Side }>();
  for (const it of L.items) {
    const lane = laneOf(plan, it.id);
    const ln = lane && L.lanes.find((l) => l.id === lane.id);
    if (!ln) continue;
    const side: Side = it.kind === 'box' ? (it.callout ? (it.callout.box.x < it.x0 ? 'left' : 'right') : '') : it.labelBox.x < it.x ? 'left' : 'right';
    out.set(it.id, { lane: ln.id, y: (bounds(it).y0 + pinOffset(it) - ln.top) / L.unit, side });
  }
  return out;
}

/**
 * Løse bokser i `laneIds` som står et annet sted i `after` enn i `before` (eller har fått callouten på
 * den andre siden). Litt slingringsmonn, så små forskjeller i tekstbryting ikke teller.
 */
export function hopped(
  before: Map<string, { lane: string; y: number; side: Side }>,
  after: Map<string, { lane: string; y: number; side: Side }>,
  loose: Set<string>,
  tol = 0.25,
): string[] {
  const out: string[] = [];
  for (const id of loose) {
    const a = before.get(id);
    const b = after.get(id);
    if (!a || !b) continue;
    if (a.lane !== b.lane || a.side !== b.side || Math.abs(a.y - b.y) > tol) out.push(id);
  }
  return out;
}

/** Fester boksen `at` tekstlinjer fra toppen av lanen, i visningen som vises (Kompakt eller Fyll). */
export function pinAt(b: Box, at: number, compact: boolean): void {
  if (compact) b.compactTop = at;
  else b.top = at;
}

/**
 * Finner løse bokser i lanene som ville hoppet når planen tegnes på nytt etter flyttingen, og fester dem
 * der de stod. Gjentas til ingen flere hopper, siden en ny festet boks kan flytte andre. `trial` endres.
 * Gir plassen (tekstlinjer) og eventuelt siden for callouten til hver boks som ble festet. For skjøvne
 * bokser som bare får låst siden, er plassen NaN.
 */
export function settle(
  trial: PlanFile,
  before: Layout,
  laneIds: Set<string>,
  layoutOf: (p: PlanFile) => Layout,
  /** Bokser som er skjøvet ned: festet allerede, men callouten skal ikke bytte side. */
  pushed: Set<string> = new Set(),
): Map<string, { at: number; side?: 'left' | 'right' }> {
  const p0 = placesOf(before, trial);
  const out = new Map<string, { at: number; side?: 'left' | 'right' }>();
  const round = (v: number) => Math.round(v * 100) / 100;
  for (let i = 0; i < 6; i++) {
    const after = layoutOf(trial);
    const p1 = placesOf(after, trial);
    const loose = new Set(
      trial.lanes
        .filter((l) => laneIds.has(l.id))
        .flatMap((l) => l.boxes)
        // Overskrifts- og Multi Lane-bokser følger egne regler
        .filter((b) => !b.header && b.spanTo === undefined && (before.compact ? (b.compactTop ?? b.top) : b.top) === undefined)
        .map((b) => b.id),
    );
    // En boks som bare har byttet side på callouten, festes med callouten på den gamle siden
    const ids = [...hopped(p0, p1, loose), ...[...pushed].filter((id) => !out.has(id) && p0.get(id)?.side && p0.get(id)?.side !== p1.get(id)?.side)];
    if (!ids.length) break;
    for (const id of ids) {
      const b = trial.lanes.flatMap((l) => l.boxes).find((x) => x.id === id);
      const was = p0.get(id)!;
      if (!b) continue;
      const side = was.side && was.side !== p1.get(id)?.side && b.callout !== 'off' ? was.side : undefined;
      if (side) b.calloutSide = side;
      if (pushed.has(id)) {
        // Plassen er satt alt; bare siden låses
        if (side) out.set(id, { at: NaN, side });
        continue;
      }
      const at = round(was.y);
      pinAt(b, at, before.compact);
      out.set(id, side ? { at, side } : { at });
    }
  }
  return out;
}

/** Den korte forklaringen som vises nederst mens en boks dras. */
export function createPushHint(): { show(on: boolean): void; hide(): void } {
  let el: HTMLElement | null = null;
  return {
    show(on) {
      if (!el) {
        el = document.createElement('div');
        el.className = 'drag-hint no-print';
        el.setAttribute('role', 'status');
        document.body.append(el);
      }
      el.classList.toggle('on', on);
      el.textContent = on
        ? 'Boksene under skyves ned like langt og blir stående. Slipp Ctrl for vanlig flytting.'
        : 'Hold Ctrl mens du drar for å skyve boksene under ned i stedet for at lanen pakkes på nytt.';
    },
    hide() {
      el?.remove();
      el = null;
    },
  };
}
