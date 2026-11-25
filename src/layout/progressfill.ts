// Fremdrift som felt i boksen: den ferdige delen av boksen, regnet fra venstre, får en mørkere tone,
// brede skrå bånd, en lys kant øverst (som en pregning) og en kraftig strek der fremdriften står.
// Det skal ikke kunne forveksles med vanlig skravering, som er tynne streker i en farge brukeren
// velger: her er båndene tre ganger så brede, i boksens egen tone, og feltet har en front.
// Båndene holder seg unna teksten, så teksten er like lett å lese som før.
// Alt regnes ut som enkle former med klipping til feltet, så skjerm og PDF tegner det samme.

import { ARROW_MM, type BoxItem } from './layout';
import { autoTextColor, mixColor } from './color';
import { insetOutline } from './inneredge';
import { boxGaps, stripes, subtractSpans, type Pt } from './hatch';
import type { Measure } from './text';

/** Bredden på båndene og avstanden mellom dem, i mm. */
export const BAND_WIDTH = 0.9;
const BAND_STEP = 2.1;
/** Kortere bånd enn dette (mm) mellom tekstlinjene tegnes svakt, som bak teksten. */
const MIN_BAND = 2.5;
/** Hvor mye av skraveringen under båndene som dekkes av fyllfargen. */
export const KNOCK = 0.85;
/** Hvor sterke båndene er bak teksten, mot ellers. */
export const UNDER_BAND = 0.4;
/** Fronten: loddrett strek der fremdriften står. Den brytes rundt teksten. */
export const FRONT_WIDTH = 0.45;
/** Den lyse kanten øverst og den mørke nederst, innenfor konturen. */
export const BEVEL_WIDTH = 0.35;

export interface ProgressFill {
  /** Det ferdige feltet: boksens omriss innenfor kanten, kuttet ved fremdriften. */
  poly: Pt[];
  /** Båndene som én sti (M og L), strøket med BAND_WIDTH. */
  bands: string;
  /** Båndene bak teksten, tegnet svakt (UNDER_BAND av band). */
  bandsUnder: string;
  /** Svart på lyse fyll, hvit på mørke. Tonen og båndene tegnes i denne fargen, gjennomsiktig. */
  ink: '#000000' | '#FFFFFF';
  wash: number;
  band: number;
  /** Fronten som stykker av en loddrett strek (M og L), tom når boksen er ferdig. */
  front: string;
  /** Fargen på fronten: fyllet, kraftig mørknet (lyst fyll) eller lysnet (mørkt fyll). */
  frontColor: string;
  /** Andel ferdig, 0–1. */
  done: number;
  /** Boksen har vanlig skravering: båndene tegnes først i fyllfargen, så skraveringen dempes der de krysser. */
  knock?: string;
}

const r = (v: number) => Math.round(v * 1000) / 1000;


/** Delen av den konvekse mangekanten som ligger til venstre for x = cut (Sutherland–Hodgman). */
export function clipLeft(poly: readonly Pt[], cut: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = a[0] <= cut;
    const bin = b[0] <= cut;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (cut - a[0]) / (b[0] - a[0]);
      out.push([cut, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Feltet for den ferdige delen av boksen, eller null når ingenting er ferdig. */
/** xDone er der fremdriften står i mm (arbeidstid); uten den regnes andelen av bredden. */
export function boxProgressFill(it: BoxItem, done: number, xDone: number | null, ny: boolean, measure: Measure): ProgressFill | null {
  if (!(done > 0) || it.h <= 0 || it.x1 <= it.x0) return null;
  const d = Math.min(1, done);
  const inset = it.border ? (ny ? 0.3 : 0.25) / 2 : 0;
  const tip = Math.min(ARROW_MM, (it.x1 - it.x0) / 3);
  const outline = insetOutline(it.x0, it.x1, it.y, it.h, tip, it.arrowLeft, it.arrowRight, inset);
  const cut = d >= 1 ? it.x1 : (xDone ?? it.x0 + (it.x1 - it.x0) * d);
  const poly = d >= 1 ? outline : clipLeft(outline, cut);
  if (poly.length < 3) return null;
  // Fyll som får hvit tekst (mørke og mellommørke) får lyse bånd: mørke bånd forsvinner der
  const dark = autoTextColor(it.fill) === '#FFFFFF';
  const gaps = boxGaps(it, measure);
  // Endene på de brede båndene skal heller ikke nå inn i feltet rundt teksten
  // Korte biter mellom tekstlinjene ser ødelagte ut; de tegnes svakt sammen med resten bak teksten
  const pad = BAND_WIDTH * 0.75;
  const { out: bands, under: bandsUnder } = stripes([45], BAND_STEP, poly, gaps.map(([a, b, c, e]) => [a - pad, b - pad, c + pad, e + pad]), MIN_BAND);
  let front = '';
  if (d < 1) {
    const x = cut;
    const fp = FRONT_WIDTH / 2;
    const cuts = gaps.filter((g) => g[0] - fp < x && g[2] + fp > x).map((g): [number, number] => [g[1], g[3]]);
    front = subtractSpans([it.y + inset, it.y + it.h - inset], cuts)
      .filter(([a, b]) => b - a > 0.2)
      .map(([a, b]) => `M${r(x)} ${r(a)}L${r(x)} ${r(b)}`)
      .join('');
  }
  return {
    poly,
    bands,
    bandsUnder,
    ink: dark ? '#FFFFFF' : '#000000',
    wash: dark ? 0.16 : 0.12,
    band: dark ? 0.32 : 0.2,
    front,
    frontColor: dark ? mixColor(it.fill, '#FFFFFF', 0.7) : mixColor(it.fill, '#000000', 0.62),
    done: d,
    ...(it.hatch ? { knock: it.fill } : {}),
  };
}
