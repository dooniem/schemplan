// Egen farge på deler av teksten i en boks eller milepæl.
// Fargene lagres som tegnområder i teksten slik den er skrevet (med "|", Enter og "*"),
// ved siden av teksten, så teksten selv er uendret for Project, søk og lister.
import type { HexColor, TextColorRun } from './types';

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
 * Flytter fargene med når teksten endres. Det som står likt foran og bak endringen, beholder fargen.
 * Tekst som skrives inn, får fargen til tegnet foran, som i et vanlig tekstprogram.
 */
export function remapRuns(runs: readonly TextColorRun[] | undefined, before: string, after: string): TextColorRun[] {
  if (!runs?.length) return [];
  if (before === after) return runsOf(charColors(after.length, runs));
  const old = charColors(before.length, runs);
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p++;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const added = after.length - p - s;
  const carry = p > 0 ? old[p - 1] : undefined;
  return runsOf([...old.slice(0, p), ...new Array<HexColor | undefined>(added).fill(carry), ...old.slice(before.length - s)]);
}

/** Har teksten noen farget del? */
export const hasTextColors = (runs: readonly TextColorRun[] | undefined) => !!runs?.some((r) => r.to > r.from);

/** Bit av en linje med egen farge. Uten farge har biten tekstens vanlige farge. */
export interface TextRun {
  text: string;
  color?: HexColor;
}

const BREAK = /\r\n|[\r\n|]/y;

/**
 * Tegnene som vises, i rekkefølge, med fargen sin. Mellomrom og linjeskift er ikke med, siden
 * teksten brytes på nytt i boksen. Følger det parseBoxText gjør: "*" først, "/|" og linjeskift.
 */
function visibleChars(text: string, runs: readonly TextColorRun[]): { ch: string; color?: HexColor }[] {
  const cs = charColors(text.length, runs);
  const out: { ch: string; color?: HexColor }[] = [];
  let i = text.startsWith('*') ? 1 : 0;
  while (i < text.length) {
    if (text.startsWith('/|', i)) {
      out.push({ ch: '|', color: cs[i + 1] ?? cs[i] });
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
    if (!/\s/.test(ch)) out.push({ ch, color: cs[i] });
    i += ch.length;
  }
  return out;
}

/**
 * Linjene slik de står i boksen, delt i biter med farge. Linjene er teksten brutt for boksen, så tegnene
 * følges i rekkefølge: et tegn som ikke finnes i teksten (som en bindestrek lagt til ved deling) får ingen farge.
 * Gir undefined når ingen del av teksten har egen farge.
 */
export function colorLines(text: string, runs: readonly TextColorRun[] | undefined, lines: readonly string[]): (TextRun[] | undefined)[] | undefined {
  if (!hasTextColors(runs)) return undefined;
  const seq = visibleChars(text, runs!);
  let k = 0;
  const out = lines.map((line) => {
    const parts: TextRun[] = [];
    let prev: HexColor | undefined;
    for (const ch of line) {
      let c: HexColor | undefined;
      if (/\s/.test(ch)) c = prev;
      else if (k < seq.length && seq[k].ch === ch) c = seq[k++].color;
      prev = c;
      const last = parts[parts.length - 1];
      if (last && last.color === c) last.text += ch;
      else parts.push(c ? { text: ch, color: c } : { text: ch });
    }
    return parts.some((p) => p.color) ? parts : undefined;
  });
  return out.some(Boolean) ? out : undefined;
}
