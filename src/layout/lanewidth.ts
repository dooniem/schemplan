// Bredden på lane-kolonnen (navnefeltet til venstre).
// Automatisk: bred nok til at ingen ord deles, inntil 30 mm for hele navn, aldri over 40 mm.
// Valgt bredde lagres i forhold til lane-navnenes tekststørrelse (plan.layout.laneTitleWidth,
// antall ganger tekststørrelsen). Da deles navnene på samme sted uansett ark, tilpasning,
// kompakt eller tekststørrelse: blir teksten større, blir kolonnen like mye bredere.
// Med valgt bredde er en bindestrek i et navn foretrukket delested (se wrapHyphenated).
// Uten valgt bredde tegnes alt som før.

/** Minste og største automatiske bredde i mm. */
export const AUTO_MIN_MM = 18;
export const AUTO_WHOLE_MM = 30;
export const AUTO_MAX_MM = 40;
/** Valgt bredde kan ta inntil en tredjedel av arkets bredde. */
export const MAX_SHARE = 1 / 3;
/** Grenser for lagret verdi (ganger tekststørrelsen). Smalest er rundt sju tegn. */
export const MIN_WIDTH_EM = 4;
export const MAX_WIDTH_EM = 200;

export interface LaneWidthInput {
  /** Lengste ord i et lane-navn, i mm. */
  longestWord: number;
  /** Bredeste linje i et lane-navn, i mm. */
  widestName: number;
  /** Luft til venstre og høyre for navnet, i mm. */
  pad: number;
  /** Lane-navnenes tekststørrelse, i mm. */
  size: number;
  /** Bredden på arket, i mm. */
  sheetW: number;
  /** Valgt bredde, i ganger tekststørrelsen. */
  chosen?: number;
}

/** Det tegningen vet om kolonnen, til redigeringen. Alt i mm. */
export interface LaneColumn {
  /** Lane-navnenes tekststørrelse. */
  size: number;
  pad: number;
  /** Bredden kolonnen ville hatt automatisk. */
  auto: number;
  /** Grensene for valgt bredde. */
  min: number;
  max: number;
  /** Bredden er valgt i appen. */
  chosen: boolean;
}

/** Automatisk bredde, slik den var før man kunne velge selv. */
export function autoLaneWidth(i: LaneWidthInput): number {
  return Math.min(AUTO_MAX_MM, Math.max(AUTO_MIN_MM, i.longestWord + i.pad, Math.min(i.widestName + i.pad, AUTO_WHOLE_MM)));
}

/**
 * Kolonnens bredde i mm. Automatisk deles ingen ord. Med valgt bredde kan lange ord deles
 * (med bindestrek), og kolonnen tar aldri mer enn MAX_SHARE av arket.
 */
export function laneColumnWidth(i: LaneWidthInput): number {
  if (!i.chosen) return autoLaneWidth(i);
  return Math.max(minLaneWidth(i), Math.min(i.chosen * i.size, maxLaneWidth(i)));
}

/** Smaleste valgte bredde i mm. */
export const minLaneWidth = (i: Pick<LaneWidthInput, 'size' | 'pad'>) => MIN_WIDTH_EM * i.size + i.pad;
/** Bredeste valgte bredde i mm. */
export const maxLaneWidth = (i: Pick<LaneWidthInput, 'sheetW'>) => i.sheetW * MAX_SHARE;

/** Gjør en bredde i mm om til verdien som lagres, rundet til hundredeler. */
export function widthToEm(mm: number, size: number): number {
  return Math.round(Math.min(MAX_WIDTH_EM, Math.max(MIN_WIDTH_EM, mm / size)) * 100) / 100;
}

export const laneWidthOk = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= MIN_WIDTH_EM && v <= MAX_WIDTH_EM;

/** Grenser for valgt bredde på en gruppebar (ganger tekststørrelsen), og største andel av kolonnen. */
export const BAR_MIN_EM = 1;
export const BAR_MAX_SHARE = 0.6;

/**
 * Bredden på en gruppebar i mm. Automatisk like bred som teksten, men høyst en tredjedel av
 * kolonnen. Valgt bredde følger tekststørrelsen, som kolonnen, og tar høyst BAR_MAX_SHARE av den.
 */
export function groupBarWidth(chosen: number | undefined, auto: number, size: number, colW: number): number {
  if (!chosen) return Math.min(colW / 3, auto);
  return Math.max(BAR_MIN_EM * size, Math.min(chosen * size, colW * BAR_MAX_SHARE));
}

export const barWidthOk = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= BAR_MIN_EM && v <= MAX_WIDTH_EM;
