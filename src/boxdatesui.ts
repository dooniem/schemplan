// Datoer på boksene i redigeringen: bryter i panelet og valg i høyreklikkmenyen.
// Gjelder én eller flere bokser; valget for hele planen står under Innstillinger › Vis på arket.
import type { Box, PlanFile } from './format/types';
import { datesShown } from './layout/boxdates';
import type { CtxItem } from './ctxmenu';

const HINT = 'Start og slutt som egen rad under teksten, litt mindre og dempet.';

/** Alle boksene viser datoene. */
export const allDated = (plan: PlanFile, boxes: readonly Box[]) => boxes.length > 0 && boxes.every((b) => datesShown(b, plan));

interface Kit {
  switchRow(label: string, on: boolean, onChange: (v: boolean) => void, title?: string): HTMLElement;
  el(tag: string, attrs?: Record<string, string>, text?: string): HTMLElement;
}

/** Bryteren i panelet, med en linje om at boksen avviker fra planen når den gjør det. */
export function datesRows(kit: Kit, plan: PlanFile, boxes: readonly Box[], set: (on: boolean) => void): HTMLElement[] {
  const plain = boxes.filter((b) => !b.resolved?.isMilestone);
  if (!plain.length) return [];
  const rows = [kit.switchRow('Vis datoer', allDated(plan, plain), set, HINT)];
  const planOn = !!plan.plan.layout.showDates;
  const own = plain.filter((b) => b.showDates !== undefined && b.showDates !== planOn).length;
  if (own) {
    const text =
      plain.length === 1
        ? planOn
          ? 'Skjult her, men vist på resten av planen.'
          : 'Vist her, men ikke på resten av planen.'
        : `${own} av boksene avviker fra valget for planen (Innstillinger › Vis på arket).`;
    rows.push(kit.el('p', { class: 'hint' }, text));
  }
  return rows;
}

/** Av/på i høyreklikkmenyen. */
export function datesMenuItem(plan: PlanFile, boxes: readonly Box[], set: (on: boolean) => void): CtxItem {
  const on = allDated(plan, boxes);
  return { label: 'Vis datoer', icon: 'calendar', checked: on, hint: HINT, onSelect: () => set(!on) };
}
