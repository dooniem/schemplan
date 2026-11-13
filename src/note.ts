// Fritekst på arket. Teksten tegnes som et bilde (PNG i høy oppløsning), så den kan flyttes,
// roteres, skaleres og festes til en dato akkurat som bilder, og kommer med i PDF-en uten ekstra tegnekode.
import type { NoteFont, PlanNote } from './format/types';
import { FONT_FAMILY } from './render/svg';

/** Piksler per millimeter i bildet. Gir skarp tekst også på A1. */
export const PX_PER_MM = 16;
const PT_TO_MM = 25.4 / 72;
const LINE = 1.2;

export const NOTE_DEFAULT: PlanNote = { text: 'Tekst', sizePt: 12, frame: false, bold: false };

/** Tekstfarger: standardfargene fra Office, uten de lyseste. */
export const NOTE_COLORS: [string, string][] = [
  ['#000000', 'Svart'], ['#595959', 'Mørk grå'], ['#C00000', 'Mørk rød'], ['#FF0000', 'Rød'], ['#E46C0A', 'Oransje'],
  ['#00B050', 'Grønn'], ['#0070C0', 'Blå'], ['#002060', 'Mørk blå'], ['#7030A0', 'Lilla'], ['#FFFFFF', 'Hvit'],
];

/** Skriftene en fritekst kan ha, med navn til menyen. Alle er pakket inn i appen. */
export const NOTE_FONTS: [NoteFont | '', string, string][] = [
  ['', 'Carlito (som Calibri)', FONT_FAMILY],
  ['arimo', 'Arimo (som Arial)', "Arimo, Arial, sans-serif"],
  ['tinos', 'Tinos (som Times New Roman)', "Tinos, 'Times New Roman', serif"],
  ['cousine', 'Cousine (som Courier, fast bredde)', "Cousine, 'Courier New', monospace"],
];

const family = (note: PlanNote) => NOTE_FONTS.find(([k]) => k === (note.font ?? ''))?.[2] ?? FONT_FAMILY;
/** CSS-skrift for teksten i størrelsen size (i samme enhet som tegningen). */
const fontOf = (note: PlanNote, size: number) => `${note.italic ? 'italic ' : ''}${note.bold ? 'bold ' : ''}${size}px ${family(note)}`;

/**
 * Skriftene lastes først når de brukes. Teksten tegnes på et lerret, som ikke venter på skriften,
 * så den må være lastet før teksten tegnes. document.fonts.check kan ikke brukes til dette: Chrome
 * svarer ja også før skriften er lastet. Derfor ser vi på selve skriftfilene i stilarket.
 */
export function noteFontReady(note: PlanNote): boolean {
  const name = family(note).split(',')[0].trim();
  const style = note.italic ? 'italic' : 'normal';
  const weight = note.bold ? '700' : '400';
  const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === name && f.style === style && String(f.weight) === weight);
  return !faces.length || faces.some((f) => f.status === 'loaded');
}
export const loadNoteFont = (note: PlanNote): Promise<unknown> => document.fonts.load(fontOf(note, 12)).catch(() => []);

/** Tegner teksten. Gir bildet som data-URL og størrelsen i piksler og millimeter. */
export function renderNote(note: PlanNote): { data: string; px: [number, number]; mm: [number, number] } {
  const size = note.sizePt * PT_TO_MM;
  const pad = note.frame ? size * 0.5 : size * 0.15;
  const lines = (note.text || ' ').split('\n');
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = fontOf(note, size * PX_PER_MM);
  const widths = lines.map((l) => ctx.measureText(l).width / PX_PER_MM);
  const textW = Math.max(...widths);
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
  const color = note.color ?? '#000000';
  g.font = fontOf(note, size);
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  lines.forEach((l, i) => {
    const x = pad + (note.align === 'center' ? (textW - widths[i]) / 2 : note.align === 'right' ? textW - widths[i] : 0);
    const base = pad + size * (i * LINE + 0.95);
    g.fillText(l, x, base);
    // Lerretet kan ikke understreke, så streken tegnes for hånd
    if (note.underline && widths[i] > 0) {
      const t = size * (note.bold ? 0.075 : 0.055);
      g.fillRect(x, base + size * 0.1, widths[i], t);
    }
  });
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
