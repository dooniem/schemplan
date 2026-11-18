// Panelet og høyreklikkmenyene for grupper av lanes. Editoren gir verktøyene (felt, fargeruter,
// fargeprøving og angresteg); her står bare hva som vises og hva knappene gjør.
import type { LaneGroup, PlanFile } from './format/types';
import type { CtxGroup, CtxItem, IconName } from './ctxmenu';
import { LANE_PALETTE, type Swatch } from './editmodel';
import { plainText } from './format/text';
import { groupOfLane, groupTargets, laneBeside } from './lanegroup';

type Trial = { key: string; run: (fn: () => void, live?: boolean) => void; pick: (fill: string, live?: boolean) => void };

export interface GroupKit {
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>, text?: string) => HTMLElementTagNameMap[K];
  panel: HTMLElement;
  panelHead: (title: string, sub?: string) => void;
  section: (title: string) => HTMLElement;
  textField: (id: string, label: string, value: string, rows: string, onInput: (v: string) => void, breaks?: boolean) => HTMLElement;
  btn: (text: string, ico: IconName | null, onClick: () => void, title?: string, cls?: string) => HTMLButtonElement;
  swatches: (current: string | null, list: Swatch[], t: Trial) => HTMLElement;
  colorRow: (value: string, t: Trial) => DocumentFragment;
  trial: (key: string, now: string, set: (fill: string) => void) => Trial;
  /** Endrer gruppen som ett angresteg (eller én skriveøkt). */
  change: (id: string, fn: (g: LaneGroup) => void, opts?: { typing?: boolean; rebuild?: boolean }) => void;
  /** Endrer planen som ett angresteg. */
  commit: (fn: (plan: PlanFile) => void) => void;
  grow: (id: string, dir: -1 | 1) => void;
  dissolve: (id: string) => void;
  ungroupLane: (laneId: string) => void;
  /** Starter «Grupper med …» fra lanen. */
  pick: (laneId: string) => void;
  selectGroup: (id: string) => void;
  selectLane: (id: string) => void;
}

const nameOf = (s: string) => plainText(s.replace(/\|/g, ' ')) || 'Uten navn';

/** Panelet for valgt gruppe: tekst, farge og lanene i den. */
export function buildLaneGroupPanel(k: GroupKit, plan: PlanFile, g: LaneGroup): void {
  const { el } = k;
  const members = plan.lanes.filter((l) => g.lanes.includes(l.id) && l.shown && !l.hidden);
  k.panelHead('Gruppe', `${members.length} ${members.length === 1 ? 'lane' : 'lanes'}`);

  const st = k.section('Tekst');
  st.append(
    k.textField('group-name', 'Tekst', g.name, '2', (v) => k.change(g.id, (x) => (x.name = v), { typing: true, rebuild: false }), true),
    el('p', { class: 'hint' }, 'Står loddrett i baren, lest nedenfra. Enter eller | gir linjeskift.'),
  );

  const sc = k.section('Farge');
  const now = g.fill.toUpperCase();
  const tl = k.trial(`group:${g.id}`, now, (f) => k.change(g.id, (x) => (x.fill = f)));
  const used: Swatch[] = [
    ...plan.lanes.filter((x) => x.fill).map((x): Swatch => [x.fill!, 'Brukt i planen']),
    ...(plan.plan.layout.laneGroups ?? []).map((x): Swatch => [x.fill, 'Brukt i planen']),
  ];
  sc.append(k.swatches(now, [...LANE_PALETTE, ...used], tl), k.colorRow(now, tl));

  const sl = k.section('Lanes');
  const list = el('ul', { class: 'group-lanes', 'aria-label': 'Lanes i gruppen' });
  for (const l of members) {
    const li = el('li');
    const name = el('button', { type: 'button', class: 'group-lane-name', title: 'Velg lanen' }, nameOf(l.name));
    name.addEventListener('click', () => k.selectLane(l.id));
    const out = k.btn('Ta ut', null, () => k.ungroupLane(l.id), members.length > 1 && l !== members[0] && l !== members[members.length - 1]
      ? 'Lanen går ut av gruppen, og gruppen deles i to'
      : 'Lanen går ut av gruppen', 'button small');
    li.append(name, out);
    list.append(li);
  }
  const above = laneBeside(plan, g.id, -1);
  const below = laneBeside(plan, g.id, 1);
  const row = el('div', { class: 'row' });
  const up = k.btn('Ta med lanen over', 'up', () => k.grow(g.id, -1), above ? `Tar med ${laneNameOf(plan, above)}` : 'Ingen lane over gruppen', 'button small');
  up.disabled = !above;
  const down = k.btn('Ta med lanen under', 'down', () => k.grow(g.id, 1), below ? `Tar med ${laneNameOf(plan, below)}` : 'Ingen lane under gruppen', 'button small');
  down.disabled = !below;
  row.append(up, down);
  sl.append(list, row);

  const foot = el('div', { class: 'panel-foot' });
  foot.append(k.btn('Oppløs gruppe', 'laneUngroup', () => k.dissolve(g.id), 'Baren blir borte. Lanene står der de står. Angre med Ctrl+Z.'));
  k.panel.append(foot);
}

const laneNameOf = (plan: PlanFile, id: string) => `«${nameOf(plan.lanes.find((l) => l.id === id)?.name ?? '')}»`;

/** Valgene for gruppering i høyreklikkmenyen på et lane-navn. */
export function laneGroupItems(k: GroupKit, plan: PlanFile, laneId: string): CtxItem[] {
  const g = groupOfLane(plan, laneId);
  const can = groupTargets(plan, laneId).length > 0;
  if (!g)
    return [{ label: 'Grupper med …', icon: 'laneGroup', hint: 'Klikk lanen den skal grupperes med. Lanene imellom blir også med, og gruppen får en smal bar med tekst.', disabled: !can, onSelect: () => k.pick(laneId) }];
  return [
    { label: 'Endre gruppen', icon: 'pencil', hint: 'Tekst, farge og lanene i gruppen, i panelet til høyre.', onSelect: () => k.selectGroup(g.id) },
    { label: 'Utvid gruppen til …', icon: 'laneGroup', hint: 'Klikk en lane utenfor gruppen. Den og lanene imellom blir med.', disabled: !can, onSelect: () => k.pick(laneId) },
    { label: 'Ta ut av gruppen', icon: 'laneUngroup', hint: 'Lanen går ut av gruppen. Står den midt i, deles gruppen i to.', onSelect: () => k.ungroupLane(laneId) },
  ];
}

/** Høyreklikkmenyen på en gruppebar. */
export function laneGroupMenu(k: GroupKit, plan: PlanFile, g: LaneGroup): CtxGroup[] {
  const above = laneBeside(plan, g.id, -1);
  const below = laneBeside(plan, g.id, 1);
  return [
    { items: [{ label: 'Endre tekst og farge', icon: 'pencil', kbd: 'Dobbeltklikk', hint: 'Åpner gruppen i panelet til høyre.', onSelect: () => k.selectGroup(g.id) }] },
    {
      items: [
        { label: 'Ta med lanen over', icon: 'up', hint: above ? `Tar med ${laneNameOf(plan, above)}.` : 'Ingen lane over gruppen.', disabled: !above, onSelect: () => k.grow(g.id, -1) },
        { label: 'Ta med lanen under', icon: 'down', hint: below ? `Tar med ${laneNameOf(plan, below)}.` : 'Ingen lane under gruppen.', disabled: !below, onSelect: () => k.grow(g.id, 1) },
      ],
    },
    { items: [{ label: 'Oppløs gruppe', icon: 'laneUngroup', kbd: 'Delete', hint: 'Baren blir borte. Lanene står der de står.', onSelect: () => k.dissolve(g.id) }] },
  ];
}
