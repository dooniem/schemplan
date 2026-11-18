// «Omplasser» og «Størst mulig tekst» i redigeringen: menyen, forslaget, og linjen under verktøyene
// der endringen kan beholdes eller angres. Boksene som ble flyttet, merkes til det er avgjort.
import type { PlanFile } from './format/types';
import type { ArrangeOptions, ArrangeResult, Item, Layout } from './layout/layout';
import { plainText } from './format/text';
import { resetTextSizes, type FitTextResult, type FitTextScope } from './layout/fittext';
import { bounds, findBox, findLane, inHeaderBox, laneOf, lines, samePlanApartFromImages, snapshotOf, unpinBox } from './editmodel';

export interface ArrangeHost {
  getPlan(): PlanFile | null;
  setPlan(p: PlanFile): void;
  redraw(): void;
  /** Planen slik den er tegnet nå. Ny etter hver tegning. */
  layout(): Layout | null;
  /** Det som er valgt: flere bokser, én boks eller en lane. */
  selection(): { group: string[]; selected: string | null; selectedLane: string | null };
  arrange(p: PlanFile, laneIds: string[], how: ArrangeOptions): ArrangeResult;
  fitText(p: PlanFile, scope: FitTextScope): FitTextResult;
  /** Tar vare på planen før endringen, så den blir ett angresteg. */
  beginStep(): void;
  undo(): void;
  /** Tegn markeringene på nytt. */
  overlay(): void;
  /** Oppdater panelet og verktøylinjen. */
  refresh(): void;
}

export interface ArrangeUi {
  /** Boksene som ble flyttet sist, merket til endringen beholdes eller angres. */
  readonly moved: ReadonlySet<string>;
  /** Merker boksene som ble flyttet. */
  mark(ids: Iterable<string>): void;
  /** Viser linjen med teksten, med «Behold» og «Angre», eller bare «Lukk». */
  show(text: string, canUndo: boolean): void;
  /** Godtar endringen: linjen og merkingen blir borte. */
  end(): void;
}

export function createArrangeUi(h: ArrangeHost): ArrangeUi {
  const bar = document.querySelector<HTMLElement>('#arrange-bar');
  let moved = new Set<string>();
  const arrangeMenu = document.querySelector<HTMLElement>('#menu-arrange');
  const arrangeUnpin = document.querySelector<HTMLInputElement>('#arrange-unpin');

  /** Lanene omplasseringen gjelder, og hvilke bokser som kan løsnes (null = alle i lanene).
      titles: tekstknappene gjelder også lane-navnene (hele planen, eller når et lane-navn er valgt). */
  const arrangeScope = (plan: PlanFile, { group, selected, selectedLane } = h.selection()): { laneIds: string[]; boxIds: Set<string> | null; text: string; whole?: boolean; titles?: boolean } => {
    const shownLanes = plan.lanes.filter((l) => l.shown && !l.hidden);
    if (group.length > 1) {
      const lanes = shownLanes.filter((l) => l.boxes.some((b) => group.includes(b.id)));
      return { laneIds: lanes.map((l) => l.id), boxIds: new Set(group), text: `Gjelder ${lanes.length === 1 ? 'lanen' : `de ${lanes.length} lanene`} med de ${group.length} valgte boksene. Bare de valgte løsnes.` };
    }
    const lane = selectedLane ? findLane(plan, selectedLane) : selected ? laneOf(plan, selected) : null;
    // Lane-navnene har én felles størrelse, så med et lane-navn valgt gjelder tekstknappene alle navnene
    if (lane && selectedLane)
      return { laneIds: [lane.id], boxIds: null, text: `Gjelder lanen «${plainText(lane.name)}». Tekstknappene gjelder også navnene på alle lanes.`, titles: true };
    if (lane) return { laneIds: [lane.id], boxIds: null, text: `Gjelder lanen «${plainText(lane.name)}».` };
    return { laneIds: shownLanes.map((l) => l.id), boxIds: null, text: 'Gjelder hele planen. Velg en lane eller bokser først for at det bare skal gjelde dem.', whole: true, titles: true };
  };

  const end = () => {
    if (bar) bar.hidden = true;
    if (!moved.size) return;
    moved = new Set();
    h.overlay();
  };

  const show = (text: string, canUndo: boolean) => {
    if (!bar) return;
    bar.querySelector('.arrange-text')!.textContent = text;
    bar.querySelector<HTMLButtonElement>('#arrange-keep')!.textContent = canUndo ? 'Behold' : 'Lukk';
    bar.querySelector<HTMLButtonElement>('#arrange-undo')!.hidden = !canUndo;
    bar.hidden = false;
  };

  /** Plass i lanen, i tekstlinjer, så før og etter kan sammenlignes selv om teksten har endret størrelse. */
  const placeOf = (L: Layout) => {
    const out = new Map<string, { lane: string; y: number; side: string }>();
    for (const it of L.items) {
      const r = bounds(it);
      const ln = L.lanes.find((l) => r.y0 >= l.y0 - 1e-6 && r.y0 < l.y1 + 1e-6);
      // Callout eller milepælstekst på den andre siden regnes også som flyttet
      const side = it.kind === 'box' ? (it.callout ? (it.callout.box.x < it.x0 ? 'v' : 'h') : '') : it.labelBox.x < it.x ? 'v' : 'h';
      if (ln) out.set(it.id, { lane: ln.id, y: (r.y0 - ln.top) / L.unit, side });
    }
    return out;
  };
  // Litt slingringsmonn: teksten kan bli større etter omplassering og bryte annerledes
  const samePlace = (a: { lane: string; y: number; side: string } | undefined, b: { lane: string; y: number; side: string }) =>
    !!a && a.lane === b.lane && a.side === b.side && Math.abs(a.y - b.y) < 0.5;
  const contentLines = (L: Layout, ids: Set<string>) => L.lanes.filter((l) => ids.has(l.id)).reduce((s, l) => s + l.minH / L.unit, 0);

  const arrange = (mode: 'tight' | 'chrono') => {
    const plan = h.getPlan();
    const before = h.layout();
    if (!plan || !before) return;
    end();
    const { laneIds, boxIds } = arrangeScope(plan);
    const next = snapshotOf(plan);
    const unpin = !!arrangeUnpin?.checked;
    // Overskriftsbokser flyttes med boksene som ligger inni dem
    const groups = new Map<string, { id: string; dy: number }[]>();
    if (unpin)
      for (const id of laneIds) {
        const l = findLane(next, id);
        for (const b of l?.boxes ?? []) {
          if (!b.header || (boxIds && !boxIds.has(b.id))) continue;
          const it = before.items.find((x) => x.id === b.id);
          if (!it) continue;
          const r = bounds(it);
          const kids = l!.boxes
            .filter((k) => k.id !== b.id)
            .map((k) => before.items.find((x) => x.id === k.id))
            .filter((o): o is Item => !!o)
            .filter((o) => inHeaderBox(it, o))
            .map((o) => ({ id: o.id, dy: lines(bounds(o).y0 - r.y0, before.unit) }));
          groups.set(b.id, kids);
        }
      }
    // En overskriftsboks inne i en annen følger den ytterste
    for (const kids of [...groups.values()]) for (const k of kids) groups.delete(k.id);
    const inGroup = new Set([...groups.keys(), ...[...groups.values()].flat().map((k) => k.id)]);
    for (const id of laneIds) {
      const l = findLane(next, id);
      if (!l) continue;
      delete l.order;
      if (unpin) for (const b of l.boxes) if (inGroup.has(b.id) || (!b.header && (!boxIds || boxIds.has(b.id)))) unpinBox(b);
    }
    if (mode === 'tight' || groups.size) {
      const res = h.arrange(next, laneIds, { mode, groups });
      for (const [id, order] of res.orders) {
        const l = findLane(next, id);
        if (l && order) l.order = order;
      }
      for (const [id, top] of res.pins) {
        const b = findBox(next, id);
        if (b) b.top = top;
      }
    }
    if (samePlanApartFromImages(next, plan)) {
      show(mode === 'tight' ? 'Fant ingen tettere plassering. Alt står som før.' : 'Boksene ligger allerede tidligst først.', false);
      return;
    }
    h.beginStep();
    h.setPlan(next);
    h.redraw();
    const after = h.layout()!;
    const p0 = placeOf(before);
    const p1 = placeOf(after);
    const ids = new Set(laneIds);
    const laneOfItem = new Map(next.lanes.flatMap((l) => l.boxes.map((b) => [b.id, l.id] as const)));
    moved = new Set([...p1].filter(([id, pos]) => ids.has(laneOfItem.get(id) ?? '') && !samePlace(p0.get(id), pos)).map(([id]) => id));
    const saved = contentLines(before, ids) - contentLines(after, ids);
    const n = moved.size;
    const count = n ? `${n} ${n === 1 ? 'boks' : 'bokser'} flyttet` : 'Ingen bokser flyttet';
    const lower = saved > 0.05 ? `, ${saved.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} ${saved < 1.05 && saved > 0.95 ? 'linje' : 'linjer'} lavere` : '';
    const grew = after.textSizePt > before.textSizePt + 1e-6 ? `. Teksten ble ${after.textSizePt.toLocaleString('nb-NO')} pt` : '';
    show(`${count}${lower}${grew}.`, true);
    h.overlay();
    h.refresh();
  };

  // ---- Størst mulig tekst ----
  const ptText = (v: number) => `${v.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} pt`;
  const fitText = (reset: boolean) => {
    const plan = h.getPlan();
    if (!plan || !h.layout()) return;
    end();
    const s = arrangeScope(plan);
    const scope: FitTextScope = { laneIds: s.laneIds, boxIds: s.boxIds, laneTitles: !!s.titles };
    const res = reset ? null : h.fitText(plan, scope);
    const next = res ? res.plan : resetTextSizes(plan, scope);
    if (samePlanApartFromImages(next, plan)) {
      show(reset ? 'Teksten har allerede standard størrelse.' : 'Fant ikke plass til større tekst uten at planens tekst krymper. Gjør planen mindre tett, eller boksene bredere, først.', false);
      return;
    }
    h.beginStep();
    h.setPlan(next);
    h.redraw();
    if (res) {
      const n = res.grown;
      const boxes = n ? `${n} ${n === 1 ? 'boks' : 'bokser'} fikk større tekst, opptil ${ptText(res.maxPt)}` : 'Ingen bokser hadde plass til større tekst';
      const lanes = res.laneTitlePt && res.laneTitlePt > res.planPt + 1e-6 ? `. Lane-titlene er ${ptText(res.laneTitlePt)}` : '';
      show(`${boxes}${lanes}. Resten av planen har ${ptText(res.planPt)}.`, true);
    } else show('Teksten har standard størrelse igjen: boksene som planen, lane-navnene litt større.', true);
    h.refresh();
  };
  document.querySelector('#fit-text')?.addEventListener('click', () => fitText(false));
  document.querySelector('#fit-text-reset')?.addEventListener('click', () => fitText(true));

  arrangeMenu?.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState !== 'open') return;
    const plan = h.getPlan();
    const scope = document.querySelector('#arrange-scope');
    if (plan && scope) scope.textContent = arrangeScope(plan).text;
  });
  document.querySelector('#arrange-tight')?.addEventListener('click', () => arrange('tight'));
  document.querySelector('#arrange-chrono')?.addEventListener('click', () => arrange('chrono'));
  bar?.querySelector('#arrange-keep')?.addEventListener('click', () => end());
  bar?.querySelector('#arrange-undo')?.addEventListener('click', () => h.undo());

  return {
    get moved() {
      return moved;
    },
    mark(ids) {
      moved = new Set(ids);
    },
    show,
    end,
  };
}
