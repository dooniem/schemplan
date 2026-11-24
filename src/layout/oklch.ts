// OKLCH: lyshet, metning og fargetone slik øyet oppfatter dem.
// Brukes der vi vil ha lik opplevd lyshet og metning på tvers av farger.

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export interface Oklch {
  /** Lyshet 0–1. */
  l: number;
  /** Metning, 0 er grå. Sterke skjermfarger ligger rundt 0,1–0,3. */
  c: number;
  /** Fargetone i grader. */
  h: number;
}

/** Fra #RRGGBB til OKLCH. */
export function toOklch(hex: string): Oklch {
  const s = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(s.slice(i, i + 2), 16) / 255));
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** Lineær RGB for en OKLCH-farge; kan ligge utenfor 0–1 når fargen ikke finnes på skjerm. */
function linearRgb({ l, c, h }: Oklch): number[] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** Finnes fargen på skjerm (sRGB)? */
export const inGamut = (x: Oklch) => linearRgb(x).every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/**
 * Fra OKLCH til #RRGGBB. Finnes ikke fargen på skjerm, senkes metningen til den gjør det,
 * så lyshet og fargetone beholdes.
 */
export function fromOklch(x: Oklch): string {
  let col = x;
  if (!inGamut(col)) {
    let lo = 0;
    let hi = x.c;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut({ ...x, c: mid })) lo = mid;
      else hi = mid;
    }
    col = { ...x, c: lo };
  }
  return (
    '#' +
    linearRgb(col)
      .map((v) => Math.round(Math.min(1, Math.max(0, gam(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}
