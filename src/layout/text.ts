/** Måler tekstbredde i mm for en gitt skriftstørrelse i mm. */
export type Measure = (text: string, sizeMm: number, bold?: boolean) => number;

export const PT_TO_MM = 25.4 / 72;
export const LINE_HEIGHT = 1.18;

/** Grov måling uten nettleser (tester). Snittbredde for en vanlig sans-serif. */
export const approxMeasure: Measure = (text, size, bold) => text.length * size * (bold ? 0.56 : 0.52);

/**
 * Bryter tekst til linjer som får plass i maxWidth. Eksisterende linjeskift beholdes.
 * Ord som er lengre enn bredden deles på tegn, slik Excel gjør.
 */
export function wrapLines(lines: string[], maxWidth: number, size: number, measure: Measure, bold = false): string[] {
  const out: string[] = [];
  const fits = (s: string) => measure(s, size, bold) <= maxWidth + 1e-6;
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let cur = '';
    for (let word of words) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (fits(candidate)) {
        cur = candidate;
        continue;
      }
      if (cur) out.push(cur);
      cur = '';
      // Ordet alene er for langt: del det
      while (!fits(word) && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && !fits(word.slice(0, n))) n--;
        out.push(word.slice(0, n));
        word = word.slice(n);
      }
      cur = word;
    }
    out.push(cur);
  }
  return out;
}

export function widest(lines: string[], size: number, measure: Measure, bold = false): number {
  return lines.reduce((w, l) => Math.max(w, measure(l, size, bold)), 0);
}
