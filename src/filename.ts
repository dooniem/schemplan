// Filnavn fra planen som er åpnet. Fra Project kan navnet være en hel sti eller nettadresse
// (for eksempel når Project-filen ligger i SharePoint); da brukes bare selve filnavnet.

/** Siste del av en sti eller adresse, uten ?… og #…, med %20 og lignende gjort om til tegn. */
export function lastPart(name: string): string {
  const noQuery = name.trim().replace(/[?#].*$/, '');
  const part = noQuery.split(/[\\/]/).filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Grunnlag for filnavnene appen foreslår: filnavnet uten filtype og uten appens egne endelser. */
export function fileTitle(name: string, fallback = 'skjematisk-plan'): string {
  const t = lastPart(name)
    .replace(/\.(pdf|json|mpp|mpt|xml|xlsx?)$/i, '')
    .replace(/_(arbeidsfil|kompakt)$/i, '')
    // Tegn som ikke er lov i filnavn på Windows
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .trim();
  return t || fallback;
}
