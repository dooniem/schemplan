// Tolker bokstekst: linjeskift, loddrett strek og tvunget callout.
export interface BoxText {
  lines: string[];
  forcedCallout: boolean;
}

const PIPE = '\u0000';

/** Teksten på én linje, som i lister og meldinger: uten linjeskift, streker og tvunget callout. */
export const plainText = (s: string) => s.replace(/\/?\|/g, ' ').replace(/^\*/, '').replace(/\s+/g, ' ').trim();

/** Lane-navn: "|" er linjeskift og "/|" en loddrett strek, som i boksteksten. */
export function splitLines(raw: string): string[] {
  return raw.replaceAll('/|', PIPE).split('|').map((l) => l.replaceAll(PIPE, '|').trim());
}

export function parseBoxText(raw: string): BoxText {
  let s = raw;
  let forcedCallout = false;
  if (s.startsWith('*')) {
    forcedCallout = true;
    s = s.slice(1);
  }
  s = s.replaceAll('/|', PIPE);
  const lines = s.split('|').map((l) => l.replaceAll(PIPE, '|'));
  return { lines, forcedCallout };
}
