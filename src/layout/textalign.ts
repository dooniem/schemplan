import type { Box, TextAlign } from '../format/types';

/** Justeringen kan velges for alle bokser med vannrett tekst, ikke milepæler. Uten valg er teksten midtstilt. */
export const canAlign = (b: Box) => !b.resolved?.isMilestone && b.rotation === 0;

/** Justeringen som gjelder for boksen. */
export const alignOf = (b: Box): TextAlign => (canAlign(b) && b.textAlign ? b.textAlign : 'center');

/** x og anker for teksten i en boks fra x0 med bredden w (uten ikonene), og luften pad på sidene. */
export function alignedText(align: TextAlign, x0: number, w: number, pad: number): { x: number; anchor: 'start' | 'middle' | 'end' } {
  if (align === 'left') return { x: x0 + pad, anchor: 'start' };
  if (align === 'right') return { x: x0 + w - pad, anchor: 'end' };
  return { x: x0 + w / 2, anchor: 'middle' };
}

/**
 * Rotert tekst i en boks som er høyere enn teksten: hvor stor del av den ekstra høyden som legges over teksten
 * (0 oppe, 1 nede). Uten valg står teksten i midten. Multi Lane-bokser har eget valg (Øverst/I midten).
 */
export const textAtOf = (b: Box): number | undefined => (b.rotation !== 0 && b.spanTo === undefined && b.textAt ? (b.textAt === 'top' ? 0 : 1) : undefined);
