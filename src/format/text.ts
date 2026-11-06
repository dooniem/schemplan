// Tolker bokstekst slik DrawBox gjør i VBA.
export interface BoxText {
  lines: string[];
  forcedCallout: boolean;
}

const PIPE = '\u0000';

export function parseBoxText(raw: string): BoxText {
  let s = raw;
  let forcedCallout = false;
  // VBA bytter "|" før den sjekker "*", men "*" kan bare stå først, så rekkefølgen spiller ingen rolle
  if (s.startsWith('*')) {
    forcedCallout = true;
    s = s.slice(1);
  }
  s = s.replaceAll('/|', PIPE);
  const lines = s.split('|').map((l) => l.replaceAll(PIPE, '|'));
  return { lines, forcedCallout };
}
