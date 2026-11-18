// Gjennomsiktighet på bokser som ligger bak de andre: Multi Lane- og overskriftsbokser.
// Fyllet blir gjennomsiktig, så lanefeltene, ukelinjene og milepælslinjene bak synes gjennom.
// Kanten og teksten er hele, og teksten velges svart eller hvit etter fargen slik den faktisk ser ut.

import type { Box } from '../format/types';
import { mixColor } from './color';

/** Mest gjennomsiktig, i prosent. Litt farge blir alltid igjen, så boksen ikke forsvinner. */
export const MAX_TRANSPARENCY = 90;
/** Trinn på glideren, i prosent. */
export const TRANSPARENCY_STEP = 5;

/** Boksen ligger bak de andre og kan gjøres gjennomsiktig. */
export const canBeTransparent = (b: Box): boolean => b.spanTo !== undefined || !!b.header;

/** Gyldig verdi: et helt tall fra 0 til MAX_TRANSPARENCY. */
export const transparencyOk = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_TRANSPARENCY;

/** Gjennomsiktigheten som gjelder for boksen, i prosent. 0 for vanlige bokser og ugyldige verdier. */
export function transparencyOf(b: Box): number {
  if (!canBeTransparent(b) || b.transparency === undefined) return 0;
  return Math.min(MAX_TRANSPARENCY, Math.max(0, Math.round(b.transparency)));
}

/**
 * Fargen fyllet ser ut til å ha på arket. Bak ligger lyse lanefelt, så hvitt er godt nok til å
 * velge tekstfarge og dempet datofarge.
 */
export function seenFill(fill: string, transparency: number): string {
  return transparency > 0 ? mixColor(fill, '#FFFFFF', transparency / 100) : fill;
}

/** Setter gjennomsiktigheten. 0 fjerner valget. */
export function setTransparency(b: Box, v: number): void {
  const t = Math.min(MAX_TRANSPARENCY, Math.max(0, Math.round(v)));
  if (t > 0) b.transparency = t;
  else delete b.transparency;
}
