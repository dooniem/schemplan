// Lanefargen som dempet bakgrunn i planområdet til lanen.
// Annenhver tidsenhet er fortsatt mørk og lys, men i to nyanser av lanefargen i stedet for grått.

import { fromOklch, inGamut, toOklch } from './oklch';

/** Hvor mye mørkere enn de grå feltene en nyanse kan bli for å få plass til metningen. */
const MAX_DARKEN = 0.04;

/**
 * Nyanse med gitt lyshet og metning i OKLCH, i lanefargens fargetone.
 * Lik lyshet og metning gir like tydelig tone på alle farger: mørk petrol blir like synlig som lys grønn,
 * og sterk gul blir ikke sterkere enn de andre. Farger med lite metning (blågrå) får aldri mer enn de har,
 * og grå forblir grå.
 * Nær hvitt rommer skjermen lite metning i blått og rødt, så der senkes lysheten litt (høyst MAX_DARKEN)
 * til metningen får plass. Teksten rundt boksene er fortsatt mørk på svært lys bakgrunn.
 */
function shade(fill: string, lum: number, chroma: number): string {
  const src = toOklch(fill);
  // For grå er OKLCH-lysheten kubikkroten av luminansen; da treffer vi samme lyshet som de grå feltene.
  const c = Math.min(chroma, src.c);
  let l = Math.cbrt(lum);
  const floor = l - MAX_DARKEN;
  while (l > floor && !inGamut({ l, c, h: src.h })) l -= 0.002;
  return fromOklch({ l: Math.max(l, floor), c, h: src.h });
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
 * så bakgrunnen ikke tar oppmerksomheten fra boksene, og like mettet uansett lanefarge. Hvit eller manglende farge gir ingen nyanser.
 */
export function laneTint(fill: string | null | undefined, ny: boolean): LaneTint | null {
  if (!fill || !/^#[0-9A-Fa-f]{6}$/.test(fill) || fill.toUpperCase() === '#FFFFFF') return null;
  // Omtrent luminansen til de grå feltene: ny #FFFFFF / #F3F3F3 / #F9F9F9, Excel #F7F7F7 / #EBEBEB / #F2F2F2.
  // Lyst felt i ny stil er hvitt, så her må det litt under for at fargen skal synes.
  const [light, dark, darkAlt] = ny ? [0.96, 0.89, 0.935] : [0.93, 0.83, 0.885];
  return {
    light: shade(fill, light, 0.016),
    dark: shade(fill, dark, 0.04),
    darkAlt: shade(fill, darkAlt, 0.03),
  };
}
