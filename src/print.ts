import { sheetSize, type Orientation, type Paper } from './sheet';

/**
 * Setter arkstørrelsen for utskrift (A4, A3, A2 eller A1) i riktig retning.
 * Nettleserne ser bare på den vanlige @page-regelen når de velger papir i utskriftsdialogen,
 * så regelen skrives inn i stilarket rett før utskrift (CSSOM, tillatt av sikkerhetssperren).
 */
export function setPrintPage(paper: Paper, orientation: Orientation): void {
  const sheet = Array.from(document.styleSheets).find((s) => {
    try {
      return s.cssRules.length >= 0 && (s.href === null || s.href.startsWith(location.origin));
    } catch {
      return false;
    }
  });
  if (!sheet) return;
  for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
    const r = sheet.cssRules[i];
    if (r instanceof CSSPageRule && r.selectorText === '') sheet.deleteRule(i);
  }
  // Mål i mm: nettleserne kjenner ikke alle arknavn (A2 og A1 mangler i Chrome)
  const { width, height } = sheetSize(paper, orientation);
  sheet.insertRule(`@page { size: ${width}mm ${height}mm; margin: 0; }`, sheet.cssRules.length);
}
