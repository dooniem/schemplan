import type { Box, TextAlign } from "../format/types";

/** Justeringen kan velges for overskrifts- og Multi Lane-bokser. Andre bokser er midtstilt. */
export const canAlign = (b: Box) => !!b.header || b.spanTo !== undefined;

/** Justeringen som gjelder for boksen. */
export const alignOf = (b: Box): TextAlign =>
  canAlign(b) && b.textAlign ? b.textAlign : "center";

/** x og anker for teksten i en boks fra x0 med bredden w (uten ikonene), og luften pad på sidene. */
export function alignedText(
  align: TextAlign,
  x0: number,
  w: number,
  pad: number,
): { x: number; anchor: "start" | "middle" | "end" } {
  if (align === "left") return { x: x0 + pad, anchor: "start" };
  if (align === "right") return { x: x0 + w - pad, anchor: "end" };
  return { x: x0 + w / 2, anchor: "middle" };
}
