// Viser om sperren mot utgående trafikk faktisk virker, ved å prøve et kall
// som nettleseren skal nekte. Ingen data sendes: kallet stoppes før det går ut.
export async function checkOutboundBlocked(): Promise<boolean> {
  try {
    await fetch('https://example.invalid/csp-check', { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
    return false;
  } catch {
    // Blokkert av CSP, eller ingen nettverk. Skilles fra hverandre med meta-taggen under.
    return document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null;
  }
}
