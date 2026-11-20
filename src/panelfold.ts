// Deler av egenskapspanelet som kan foldes sammen. Lukket står overskriften og en kort oppsummering
// på én linje, så panelet får plass uten rulling og det som er endret, synes uten å åpne delen.
import { icon } from './ctxmenu';

/** Oppsummeringen av en lukket del. changed: noe avviker fra standard, og linjen fremheves. */
export interface Fold {
  summary: string;
  changed?: boolean;
}

/**
 * Delene som er åpne, etter navn. Valget huskes mens appen er åpen, så en del står åpen når panelet
 * tegnes på nytt eller en annen boks velges. Flere deler kan være åpne samtidig.
 */
const openParts = new Set<string>();

/** Del som kan foldes. Gir elementet som innholdet legges i. */
export function foldSection(title: string, fold: Fold): { root: HTMLElement; body: HTMLElement } {
  const d = document.createElement('details');
  d.className = 'psec pgroup pfold';
  d.open = openParts.has(title);
  const sum = document.createElement('summary');
  const head = document.createElement('span');
  head.className = 'pg-head';
  const h = document.createElement('h3');
  h.textContent = title;
  const s = document.createElement('span');
  s.className = fold.changed ? 'pg-sum changed' : 'pg-sum';
  s.textContent = fold.summary;
  if (fold.changed) s.title = 'Avviker fra standard';
  head.append(h, s);
  sum.append(icon('chevron', 'pico pg-chev'), head);
  const body = document.createElement('div');
  body.className = 'pg-body';
  d.append(sum, body);
  d.addEventListener('toggle', () => {
    if (d.open) openParts.add(title);
    else openParts.delete(title);
  });
  return { root: d, body };
}

/** Ordene satt sammen med midtprikk, uten de tomme. */
export const joinSummary = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' · ');
