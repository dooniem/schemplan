// Fargeregler for lesbarhet. Ingen farger fjernes; vi velger bare tekst- og kantfarge smartere.

const hex = (h: string) => {
  const s = h.replace('#', '');
  const f = s.length === 3 ? s.replace(/./g, (c) => c + c) : s;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
};

/** Relativ luminans etter WCAG 2.x. */
export function luminance(h: string): number {
  const [r, g, b] = hex(h).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Opplevd kontrast etter APCA (0.0.98G), som brukes i utkastet til WCAG 3.
 * Positiv verdi: mørk tekst på lys bakgrunn. Negativ: lys tekst på mørk bakgrunn.
 * Den gamle WCAG 2-formelen overvurderer svart tekst på mellomtoner som rød og petrol.
 */
export function apca(text: string, bg: string): number {
  const y = (h: string) => {
    const [r, g, b] = hex(h).map((c) => c ** 2.4);
    const v = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    return v > 0.022 ? v : v + (0.022 - v) ** 1.414;
  };
  const yt = y(text);
  const yb = y(bg);
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}

/** Svart tekst velges når den er nesten like god som hvit; da holder lyse og mellomlyse fag seg rolige. */
const DARK_TEXT_BIAS = 20;

/** Svart eller hvit tekst etter opplevd kontrast mot fyllfargen. */
export function autoTextColor(fill: string): '#000000' | '#FFFFFF' {
  const black = Math.abs(apca('#000000', fill));
  const white = Math.abs(apca('#FFFFFF', fill));
  return black + DARK_TEXT_BIAS >= white ? '#000000' : '#FFFFFF';
}

const toHex = (rgb: number[]) => '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

/**
 * Ønsket kontrast mellom kant og fyll. Kanten er tynn (0,3 mm), så den trenger mer enn
 * WCAG-kravet på 3:1 for grafiske elementer for å skille to like bokser som ligger inntil hverandre.
 */
const BORDER_CONTRAST = 4.5;

/**
 * Kantfarge avledet av fyllet: samme fargetone, mørkere. Vi mørkner trinnvis til kanten har
 * ønsket kontrast, men aldri mer enn at fargetonen fortsatt synes. Er fyllet så mørkt at en mørkere
 * kant ikke synes (marineblå, svart, mørk brun), blir kanten i stedet lysere, i samme tone.
 */
export function derivedBorder(fill: string, target = BORDER_CONTRAST): string {
  const c = hex(fill);
  const steps = (f: (v: number, t: number) => number) => {
    const out: string[] = [];
    for (let t = 0.45; t <= 0.8001; t += 0.05) out.push(toHex(c.map((v) => f(v, t))));
    return out;
  };
  const darker = steps((v, t) => v * (1 - t));
  const lighter = steps((v, t) => v + (1 - v) * t);
  const hit = darker.find((d) => contrast(d, fill) >= target) ?? lighter.find((l) => contrast(l, fill) >= target);
  if (hit) return hit;
  // Ingen når målet: mørkeste kant om den holder 3:1, ellers den med best kontrast
  const dark = darker[darker.length - 1];
  const light = lighter[lighter.length - 1];
  return contrast(dark, fill) >= 3 || contrast(dark, fill) >= contrast(light, fill) ? dark : light;
}

/** Fargen a blandet med b: t = 0 gir a, t = 1 gir b. */
export function mixColor(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
