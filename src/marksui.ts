// Høylytt arbeid og nattarbeid i redigeringen: brytere i panelet og valg i høyreklikkmenyen.
import type { Box, PlanFile } from './format/types';
import { findBox } from './editmodel';
import { MARK_KINDS, MARK_NAMES, MARK_SCALES, markScaleOf, type MarkKind } from './layout/marks';
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
  segmented<T extends string | number>(label: string, value: T, options: [T, string][], onPick: (v: T) => void): HTMLElement;
}

/** Størrelsen på alle ikonene i planen. Fast trinn, så de verken blir for små eller for store. */
export function markScaleRow(kit: Kit, plan: PlanFile, set: (v: number | undefined) => void): HTMLElement {
  const row = kit.segmented('Størrelse', markScaleOf(plan.plan.layout.markScale), [...MARK_SCALES], (v) => set(v === 1 ? undefined : v));
  row.title = 'Gjelder ikonene på alle boksene. Standard er like høyt som en tekstlinje, og følger tekststørrelsen i planen.';
  return row;
}

/** «Merking» i panelet for én eller flere bokser. */
export function marksSection(kit: Kit, plan: PlanFile, boxes: readonly Box[], set: (kind: MarkKind, on: boolean) => void, setScale: (v: number | undefined) => void): void {
  const s = kit.section('Merking');
  for (const k of MARK_KINDS) s.append(kit.switchRow(MARK_NAMES[k], allMarked(boxes, k), (v) => set(k, v), HINTS[k]));
  // Størrelsen vises når noen bokser i planen er merket
  if (plan.lanes.some((l) => l.boxes.some((b) => b.loud || b.night))) s.append(markScaleRow(kit, plan, setScale));
  s.append(kit.el('p', { class: 'hint' }, 'Merkene står i forklaringen. Når du ikke redigerer, klikker du et merke i forklaringen for å fremheve boksene med det (Shift-klikk tar med begge).'));
}

/** Av/på-valgene i høyreklikkmenyen til en boks. */
export function marksMenuItems(boxes: readonly Box[], set: (kind: MarkKind, on: boolean) => void): CtxItem[] {
  return MARK_KINDS.map((k) => {
    const on = allMarked(boxes, k);
    return { label: MARK_NAMES[k], icon: ICON[k], checked: on, hint: HINTS[k] + '.', onSelect: () => set(k, !on) };
  });
}
