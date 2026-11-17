// Høylytt arbeid og nattarbeid i redigeringen: brytere i panelet og valg i høyreklikkmenyen.
import type { Box, PlanFile } from './format/types';
import { findBox } from './editmodel';
import { MARK_KINDS, MARK_NAMES, MARK_SCALES, markScaleOf, markShapes, type MarkKind } from './layout/marks';
import type { CtxItem, IconName } from './ctxmenu';

const HINTS: Record<MarkKind, string> = {
  loud: 'Høyttaler på gul bunn på høyre kant av boksen',
  night: 'Halvmåne på høyre kant av boksen',
};
const ICON: Record<MarkKind, IconName> = { loud: 'speaker', night: 'moon' };

/** Gir boksene merket, eller tar det bort. Milepæler merkes ikke. */
export function setMarks(plan: PlanFile, ids: readonly string[], kind: MarkKind, on: boolean): void {
  for (const id of ids) {
    const b = findBox(plan, id);
    if (!b || b.resolved?.isMilestone) continue;
    if (on) b[kind] = true;
    else delete b[kind];
  }
}

/** Alle boksene har merket. */
export const allMarked = (boxes: readonly Box[], kind: MarkKind) => boxes.length > 0 && boxes.every((b) => !!b[kind]);

interface Kit {
  section(title: string): HTMLElement;
  switchRow(label: string, on: boolean, onChange: (v: boolean) => void, title?: string): HTMLElement;
  el(tag: string, attrs?: Record<string, string>, text?: string): HTMLElement;
}

const NS = 'http://www.w3.org/2000/svg';
/** Ikonet slik det står på arket, i liten utgave foran navnet. */
function markIcon(kind: MarkKind): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-0.05 -0.05 1.1 1.1');
  svg.setAttribute('class', 'mark-ico');
  svg.setAttribute('aria-hidden', 'true');
  for (const sh of markShapes(kind, 0, 0, 1)) {
    const p = document.createElementNS(NS, sh.tag);
    for (const [k, v] of Object.entries(sh.attrs)) p.setAttribute(k, String(v));
    svg.append(p);
  }
  return svg;
}

/**
 * Størrelsen på alle ikonene i planen, som − 100 % +. Faste trinn (75–150 %), så de verken blir for små eller for store.
 * Standard er én tekstlinje i planen, så ikonene følger arket og tekststørrelsen.
 */
export function markScaleRow(kit: Kit, plan: PlanFile, set: (v: number | undefined) => void): HTMLElement {
  const steps = MARK_SCALES.map(([v]) => v);
  const cur = markScaleOf(plan.plan.layout.markScale);
  const i = Math.max(0, steps.findIndex((v) => Math.abs(v - cur) < 1e-3));
  const pick = (v: number) => set(v === 1 ? undefined : v);
  const wrap = kit.el('div', { class: 'prop prop-inline', title: 'Gjelder ikonene på alle boksene. 100 % er like høyt som en tekstlinje i planen.' });
  wrap.append(kit.el('span', { class: 'prop-label' }, 'Ikoner'));
  const g = kit.el('div', { class: 'group stepper', role: 'group', 'aria-label': 'Størrelse på ikonene' });
  const down = kit.el('button', { type: 'button', 'aria-label': 'Mindre ikoner', title: 'Mindre ikoner' }, '−') as HTMLButtonElement;
  const up = kit.el('button', { type: 'button', 'aria-label': 'Større ikoner', title: 'Større ikoner' }, '+') as HTMLButtonElement;
  const val = kit.el('output', { class: 'step-val', 'aria-live': 'polite' }, `${Math.round(steps[i] * 100)} %`);
  down.disabled = i === 0;
  up.disabled = i === steps.length - 1;
  down.addEventListener('click', () => pick(steps[i - 1]));
  up.addEventListener('click', () => pick(steps[i + 1]));
  g.append(down, val, up);
  wrap.append(g);
  return wrap;
}

/** «Merking» i panelet for én eller flere bokser. */
export function marksSection(kit: Kit, plan: PlanFile, boxes: readonly Box[], set: (kind: MarkKind, on: boolean) => void, setScale: (v: number | undefined) => void): void {
  const s = kit.section('Merking');
  for (const k of MARK_KINDS) {
    const row = kit.switchRow(MARK_NAMES[k], allMarked(boxes, k), (v) => set(k, v), HINTS[k]);
    row.querySelector('span')?.prepend(markIcon(k));
    s.append(row);
  }
  // Størrelsen gjelder hele planen, så den vises først når noen bokser er merket
  if (plan.lanes.some((l) => l.boxes.some((b) => b.loud || b.night))) s.append(markScaleRow(kit, plan, setScale));
  s.append(kit.el('p', { class: 'hint' }, 'Merkene står i forklaringen. Klikk dem der når du ikke redigerer, for å fremheve boksene.'));
}

/** Av/på-valgene i høyreklikkmenyen til en boks. */
export function marksMenuItems(boxes: readonly Box[], set: (kind: MarkKind, on: boolean) => void): CtxItem[] {
  return MARK_KINDS.map((k) => {
    const on = allMarked(boxes, k);
    return { label: MARK_NAMES[k], icon: ICON[k], checked: on, hint: HINTS[k] + '.', onSelect: () => set(k, !on) };
  });
}
