// Lanefargen som dempet bakgrunn i planområdet til lanen.
// Annenhver tidsenhet er fortsatt mørk og lys, men i to nyanser av lanefargen i stedet for grått.

import { luminance } from './color';

const hex = (h: string) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
};
const toHex = (rgb: number[]) => '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Fargen blandet med hvitt; `share` er andelen av fargen (0 = hvit, 1 = fargen selv). */
function mix(fill: string, share: number): string {
  return toHex(hex(fill).map((c) => 1 - share * (1 - c)));
}

/**
 * Så lite av fargen som trengs for at nyansen blir omtrent like lys som det grå feltet den erstatter,
 * men aldri mer enn `cap`. Mørke farger (marineblå) trenger lite; lyse farger (gul) får taket,
 * så de blir svake og ikke sterkt gule.
 */
function shade(fill: string, targetLum: number, cap: number): string {
  if (luminance(mix(fill, cap)) >= targetLum) return mix(fill, cap);
  let lo = 0;
  let hi = cap;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(mix(fill, mid)) > targetLum) lo = mid;
    else hi = mid;
  }
  return mix(fill, lo);
}

export interface LaneTint {
  /** Lyse felt (annenhver tidsenhet). */
  light: string;
  /** Mørke felt. */
  dark: string;
  /** Mørke felt i annenhver lane, litt lysere, som de grå. */
  darkAlt: string;
}

/**
 * De tre nyansene for en lane med farge som bakgrunn. Like lyse som de grå feltene i samme stil,
 * så bakgrunnen ikke tar oppmerksomheten fra boksene. Hvit eller manglende farge gir ingen nyanser.
 */
export function laneTint(fill: string | null | undefined, ny: boolean): LaneTint | null {
  if (!fill || !/^#[0-9A-Fa-f]{6}$/.test(fill) || fill.toUpperCase() === '#FFFFFF') return null;
  // Omtrent luminansen til de grå feltene: ny #FFFFFF / #F3F3F3 / #F9F9F9, Excel #F7F7F7 / #EBEBEB / #F2F2F2.
  // Lyst felt i ny stil er hvitt, så her må det litt under for at fargen skal synes.
  const [light, dark, darkAlt] = ny ? [0.96, 0.89, 0.935] : [0.93, 0.83, 0.885];
  return {
    light: shade(fill, light, 0.12),
    dark: shade(fill, dark, 0.3),
    darkAlt: shade(fill, darkAlt, 0.22),
  };
}
