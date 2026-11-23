// «Tegn fremst»: valg i høyreklikkmenyen og bryter i panelet. Gjelder én eller flere bokser.
// Bare tegnerekkefølgen endres; plassen i lanen er den samme.
import type { Box, PlanFile } from "./format/types";
import { findBox } from "./editmodel";
import type { CtxItem } from "./ctxmenu";

export const FRONT_HINT =
  "Legger boksen over alle andre bokser, også vanlige bokser. Plassen i lanen endres ikke.";

/** Alle boksene er merket. */
export const allFront = (boxes: readonly Box[]) =>
  boxes.length > 0 && boxes.every((b) => !!b.front);

/** Merker eller fjerner merket på boksene. */
export function setFront(
  pl: PlanFile,
  ids: readonly string[],
  on: boolean,
): void {
  for (const id of ids) {
    const b = findBox(pl, id);
    if (!b) continue;
    if (on) b.front = true;
    else delete b.front;
  }
}

/** Av/på i høyreklikkmenyen. */
export function frontMenuItem(
  boxes: readonly Box[],
  set: (on: boolean) => void,
): CtxItem {
  const on = allFront(boxes);
  return {
    label: "Tegn fremst",
    icon: "front",
    checked: on,
    hint: FRONT_HINT,
    onSelect: () => set(!on),
  };
}
