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

/** Svart eller hvit tekst, den som gir best kontrast mot fyllfargen. */
export function autoTextColor(fill: string): '#000000' | '#FFFFFF' {
  return contrast(fill, '#000000') >= contrast(fill, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

/** Kantfarge avledet av fyllet: samme fargetone, mørkere. Lyse fyll får tydelig kant, mørke fyll en nesten svart. */
export function derivedBorder(fill: string, amount = 0.45): string {
  const [r, g, b] = hex(fill).map((c) => Math.round(c * (1 - amount) * 255));
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
