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

/** Ordet delt etter hver bindestrek, med bindestreken på slutten av delen: «A-B» → «A-», «B». */
export const hyphenParts = (word: string) => word.split(/(?<=-)(?=.)/);

/**
 * Som wrapLines, men for navn i smale felt: en bindestrek i ordet er foretrukket delested,
 * og et ord som likevel er for langt, deles med bindestrek på slutten av linjen.
 */
export function wrapHyphenated(lines: string[], maxWidth: number, size: number, measure: Measure, bold = false): string[] {
  const out: string[] = [];
  const fits = (s: string) => measure(s, size, bold) <= maxWidth + 1e-6;
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let cur = '';
    for (const word of words) {
      hyphenParts(word).forEach((part, k) => {
        // Første del av et ord står etter et mellomrom, resten henger på ordet
        const candidate = cur ? cur + (k === 0 ? ' ' : '') + part : part;
        if (fits(candidate)) {
          cur = candidate;
          return;
        }
        if (cur) out.push(cur);
        let rest = part;
        while (!fits(rest) && rest.length > 1) {
          let n = rest.length - 1;
          while (n > 1 && !fits(`${rest.slice(0, n)}-`)) n--;
          // Ikke la bare ett eller to tegn stå igjen på neste linje («Beto-ng»)
          if (rest.length - n < 3 && n > 3) n = Math.max(3, rest.length - 3);
          // Delen slutter allerede på bindestrek: ikke legg til en til
          out.push(rest[n - 1] === '-' ? rest.slice(0, n) : `${rest.slice(0, n)}-`);
          rest = rest.slice(n);
        }
        cur = rest;
      });
    }
    out.push(cur);
  }
  return out;
}
