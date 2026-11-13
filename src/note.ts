// Fritekst på arket. Teksten tegnes som et bilde (PNG i høy oppløsning), så den kan flyttes,
// roteres, skaleres og festes til en dato akkurat som bilder, og kommer med i PDF-en uten ekstra tegnekode.
import type { PlanNote } from './format/types';
import { FONT_FAMILY } from './render/svg';

/** Piksler per millimeter i bildet. Gir skarp tekst også på A1. */
export const PX_PER_MM = 16;
const PT_TO_MM = 25.4 / 72;
const LINE = 1.2;

export const NOTE_DEFAULT: PlanNote = { text: 'Tekst', sizePt: 12, frame: false, bold: false };

/** Tegner teksten. Gir bildet som data-URL og størrelsen i piksler og millimeter. */
export function renderNote(note: PlanNote): { data: string; px: [number, number]; mm: [number, number] } {
  const size = note.sizePt * PT_TO_MM;
  const pad = note.frame ? size * 0.5 : size * 0.15;
  const lines = (note.text || ' ').split('\n');
  const font = `${note.bold ? 'bold ' : ''}${size * PX_PER_MM}px ${FONT_FAMILY}`;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width)) / PX_PER_MM;
  const wMm = textW + pad * 2;
  const hMm = lines.length * size * LINE + pad * 2;
  c.width = Math.max(1, Math.ceil(wMm * PX_PER_MM));
  c.height = Math.max(1, Math.ceil(hMm * PX_PER_MM));
  const g = c.getContext('2d')!;
  g.scale(PX_PER_MM, PX_PER_MM);
  if (note.frame) {
    const lw = 0.3;
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, wMm, hMm);
    g.strokeStyle = '#000000';
    g.lineWidth = lw;
    g.strokeRect(lw / 2, lw / 2, wMm - lw, hMm - lw);
  }
  g.font = `${note.bold ? 'bold ' : ''}${size}px ${FONT_FAMILY}`;
  g.fillStyle = note.color ?? '#000000';
  g.textBaseline = 'alphabetic';
  lines.forEach((l, i) => g.fillText(l, pad, pad + size * (i * LINE + 0.95)));
  return { data: c.toDataURL('image/png'), px: [c.width, c.height], mm: [wMm, hMm] };
}

/** Minste og største skriftstørrelse en fritekst kan ha. */
export const NOTE_MIN_PT = 4;
export const NOTE_MAX_PT = 200;

/** Halve pt, innenfor grensene. */
export const roundNotePt = (pt: number) => Math.min(NOTE_MAX_PT, Math.max(NOTE_MIN_PT, Math.round(pt * 2) / 2));

/**
 * Skriftstørrelsen teksten faktisk har på arket. Tegningen er laget for `sizePt`; er den dratt
 * større eller mindre, er teksten det også. W er arkets bredde i mm.
 */
export function shownPt(note: PlanNote, px: [number, number], w: number, W: number): number {
  const k = (w * W) / (px[0] / PX_PER_MM);
  return roundNotePt(note.sizePt * k);
}
