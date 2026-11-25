// Egen farge og understreking på deler av teksten i en boks eller milepæl.
// Begge lagres som tegnområder i teksten slik den er skrevet (med "|", Enter og "*"),
// ved siden av teksten, så teksten selv er uendret for Project, søk og lister.
import type { HexColor, TextColorRun, TextRange } from './types';

/** Fargen til hvert tegn i teksten, eller undefined der teksten har boksens vanlige farge. */
export function charColors(len: number, runs: readonly TextColorRun[] | undefined): (HexColor | undefined)[] {
  const out: (HexColor | undefined)[] = new Array(len).fill(undefined);
  for (const r of runs ?? []) for (let i = Math.max(0, r.from); i < Math.min(len, r.to); i++) out[i] = r.color;
  return out;
}

/** Områder fra fargen per tegn: sammenhengende tegn med samme farge blir ett område. */
export function runsOf(colors: readonly (HexColor | undefined)[]): TextColorRun[] {
  const out: TextColorRun[] = [];
  colors.forEach((c, i) => {
    if (!c) return;
    const last = out[out.length - 1];
    if (last && last.to === i && last.color === c) last.to = i + 1;
    else out.push({ from: i, to: i + 1, color: c });
  });
  return out;
}

/** Gir tegnene fra `from` til `to` fargen `color`, eller boksens vanlige farge med null. */
export function paintRuns(runs: readonly TextColorRun[] | undefined, len: number, from: number, to: number, color: HexColor | null): TextColorRun[] {
  const cs = charColors(len, runs);
  for (let i = Math.max(0, from); i < Math.min(len, to); i++) cs[i] = color ?? undefined;
  return runsOf(cs);
}

/**
 * Verdien per tegn etter at teksten er endret. Det som står likt foran og bak endringen, beholder verdien.
 * Tekst som skrives inn, får verdien til tegnet foran, som i et vanlig tekstprogram.
 */
function remapChars<T>(old: readonly T[], before: string, after: string, none: T): T[] {
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p++;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const added = after.length - p - s;
  const carry = p > 0 ? old[p - 1] : none;
  return [...old.slice(0, p), ...new Array<T>(added).fill(carry), ...old.slice(before.length - s)];
}

/** Flytter fargene med når teksten endres. */
export function remapRuns(runs: readonly TextColorRun[] | undefined, before: string, after: string): TextColorRun[] {
  if (!runs?.length) return [];
  if (before === after) return runsOf(charColors(after.length, runs));
  return runsOf(remapChars(charColors(before.length, runs), before, after, undefined));
}

/** Er hvert tegn i teksten understreket? */
export function charUnderlines(len: number, ranges: readonly TextRange[] | undefined): boolean[] {
  const out: boolean[] = new Array(len).fill(false);
  for (const r of ranges ?? []) for (let i = Math.max(0, r.from); i < Math.min(len, r.to); i++) out[i] = true;
  return out;
}

/** Områder fra understreking per tegn. */
export function rangesOf(on: readonly boolean[]): TextRange[] {
  const out: TextRange[] = [];
  on.forEach((u, i) => {
    if (!u) return;
    const last = out[out.length - 1];
    if (last && last.to === i) last.to = i + 1;
    else out.push({ from: i, to: i + 1 });
  });
  return out;
}

/** Understreker tegnene fra `from` til `to`, eller fjerner understrekingen med on = false. */
export function underlineRanges(ranges: readonly TextRange[] | undefined, len: number, from: number, to: number, on: boolean): TextRange[] {
  const us = charUnderlines(len, ranges);
  for (let i = Math.max(0, from); i < Math.min(len, to); i++) us[i] = on;
  return rangesOf(us);
}

/** Er all tekst (utenom mellomrom og linjeskift) fra `from` til `to` understreket? */
export function allUnderlined(text: string, ranges: readonly TextRange[] | undefined, from: number, to: number): boolean {
  const us = charUnderlines(text.length, ranges);
  let any = false;
  for (let i = Math.max(0, from); i < Math.min(text.length, to); i++) {
    if (/\s|\|/.test(text[i])) continue;
    if (!us[i]) return false;
    any = true;
  }
  return any;
}

/** Flytter understrekingen med når teksten endres. */
export function remapUnderlines(ranges: readonly TextRange[] | undefined, before: string, after: string): TextRange[] {
  if (!ranges?.length) return [];
  if (before === after) return rangesOf(charUnderlines(after.length, ranges));
  return rangesOf(remapChars(charUnderlines(before.length, ranges), before, after, false));
}

/** Tekst med farger og understreking på deler av den. */
interface StyledText {
  text: string;
  textColors?: TextColorRun[];
  underlines?: TextRange[];
}

/**
 * Flytter farger og understreking fra `src` med til teksten `next`, og legger dem på `dst`
 * (samme som `src` når det ikke er gitt). Teksten selv settes ikke.
 */
export function carryTextStyles(src: StyledText, next: string, dst: StyledText = src): void {
  const runs = remapRuns(src.textColors, src.text, next);
  const ranges = remapUnderlines(src.underlines, src.text, next);
  if (runs.length) dst.textColors = runs;
  else delete dst.textColors;
  if (ranges.length) dst.underlines = ranges;
  else delete dst.underlines;
}

/** Har teksten noe understreket? */
export const hasUnderlines = (ranges: readonly TextRange[] | undefined) => !!ranges?.some((r) => r.to > r.from);

/** Har teksten noen farget del? */
export const hasTextColors = (runs: readonly TextColorRun[] | undefined) => !!runs?.some((r) => r.to > r.from);

/** Bit av en linje med egen farge eller understreking. Uten farge har biten tekstens vanlige farge. */
export interface TextRun {
  text: string;
  color?: HexColor;
  underline?: true;
}

/** Utseendet til et tegn som vises. */
interface CharStyle {
  ch: string;
  color?: HexColor;
  underline: boolean;
}

const BREAK = /\r\n|[\r\n|]/y;

/**
 * Tegnene som vises, i rekkefølge, med farge og understreking. Mellomrom og linjeskift er ikke med, siden
 * teksten brytes på nytt i boksen. Følger det parseBoxText gjør: "*" først, "/|" og linjeskift.
 */
function visibleChars(text: string, runs: readonly TextColorRun[] | undefined, ranges: readonly TextRange[] | undefined): CharStyle[] {
  const cs = charColors(text.length, runs);
  const us = charUnderlines(text.length, ranges);
  const out: CharStyle[] = [];
  let i = text.startsWith('*') ? 1 : 0;
  while (i < text.length) {
    if (text.startsWith('/|', i)) {
      out.push({ ch: '|', color: cs[i + 1] ?? cs[i], underline: us[i + 1] || us[i] });
      i += 2;
      continue;
    }
    BREAK.lastIndex = i;
    const m = BREAK.exec(text);
    if (m) {
      i += m[0].length;
      continue;
    }
    const ch = String.fromCodePoint(text.codePointAt(i)!);
    if (!/\s/.test(ch)) out.push({ ch, color: cs[i], underline: us[i] });
    i += ch.length;
  }
  return out;
}

/**
 * Linjene slik de står i boksen, delt i biter med farge og understreking. Linjene er teksten brutt for boksen,
 * så tegnene følges i rekkefølge: et tegn som ikke finnes i teksten (som en bindestrek lagt til ved deling)
 * får ingen farge. Et mellomrom understrekes bare mellom to understrekede tegn på samme linje.
 * Gir undefined når ingen del av teksten har egen farge eller understreking.
 */
export function styleLines(
  text: string,
  runs: readonly TextColorRun[] | undefined,
  ranges: readonly TextRange[] | undefined,
  lines: readonly string[],
): (TextRun[] | undefined)[] | undefined {
  if (!hasTextColors(runs) && !hasUnderlines(ranges)) return undefined;
  const seq = visibleChars(text, runs, ranges);
  let k = 0;
  const out = lines.map((line) => {
    const chars = Array.from(line);
    const styled: { ch: string; color?: HexColor; underline: boolean }[] = [];
    let prev: CharStyle | undefined;
    for (const ch of chars) {
      if (/\s/.test(ch)) {
        styled.push({ ch, color: prev?.color, underline: false });
        continue;
      }
      const hit = k < seq.length && seq[k].ch === ch ? seq[k++] : undefined;
      styled.push({ ch, color: hit?.color, underline: !!hit?.underline });
      prev = hit;
    }
    // Mellomrom mellom to understrekede tegn understrekes også
    styled.forEach((c, i) => {
      if (!/\s/.test(c.ch)) return;
      let a = i - 1;
      while (a >= 0 && /\s/.test(styled[a].ch)) a--;
      let z = i + 1;
      while (z < styled.length && /\s/.test(styled[z].ch)) z++;
      c.underline = a >= 0 && z < styled.length && styled[a].underline && styled[z].underline;
    });
    const parts: TextRun[] = [];
    for (const c of styled) {
      const last = parts[parts.length - 1];
      if (last && last.color === c.color && !!last.underline === c.underline) last.text += c.ch;
      else parts.push({ text: c.ch, ...(c.color ? { color: c.color } : {}), ...(c.underline ? { underline: true as const } : {}) });
    }
    return parts.some((p) => p.color || p.underline) ? parts : undefined;
  });
  return out.some(Boolean) ? out : undefined;
}
