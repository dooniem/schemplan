import type { Box, TextAlign } from '../format/types';

/** Justeringen kan velges for alle bokser, ikke milepæler. Uten valg er teksten midtstilt. */
export const canAlign = (b: Box) => !b.resolved?.isMilestone;

/** Justeringen som gjelder for boksen. */
export const alignOf = (b: Box): TextAlign => (canAlign(b) && b.textAlign ? b.textAlign : 'center');

/** x og anker for teksten i en boks fra x0 med bredden w (uten ikonene), og luften pad på sidene. */
export function alignedText(align: TextAlign, x0: number, w: number, pad: number): { x: number; anchor: 'start' | 'middle' | 'end' } {
  if (align === 'left') return { x: x0 + pad, anchor: 'start' };
  if (align === 'right') return { x: x0 + w - pad, anchor: 'end' };
  return { x: x0 + w / 2, anchor: 'middle' };
}

/** Midten av rotert tekst: linjene står side om side og fyller `block` i bredden, så hele blokken flyttes mot kanten. */
export function rotatedX(align: TextAlign, x0: number, w: number, pad: number, block: number): number {
  const half = Math.min(block, w - 2 * pad) / 2;
  if (align === 'left') return x0 + pad + half;
  if (align === 'right') return x0 + w - pad - half;
  return x0 + w / 2;
}
