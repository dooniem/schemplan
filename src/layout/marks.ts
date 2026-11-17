// Merking av bokser med høylytt arbeid og nattarbeid: navn, mål og ikonene som tegnes på høyre kant.
// Ikonene er små merker (høyttaler på gult, halvmåne på mørkeblått) som stikker litt ut av boksen.

export type MarkKind = 'loud' | 'night';

/** Rekkefølgen ikonene står i, ovenfra (eller fra venstre når de står på rad). */
export const MARK_KINDS: readonly MarkKind[] = ['loud', 'night'];

export const MARK_NAMES: Record<MarkKind, string> = { loud: 'Høylytt arbeid', night: 'Nattarbeid' };

/** Nøklene i plan.layout.legendItems, så oppføringene kan skjules eller få egen tekst. */
export const MARK_KEYS: Record<MarkKind, string> = { loud: '(høylytt)', night: '(natt)' };

/** Merket som hører til en nøkkel i forklaringen, eller null. */
export const markOfKey = (key: string): MarkKind | null => MARK_KINDS.find((k) => MARK_KEYS[k] === key) ?? null;

/** Merkene boksen har, i fast rekkefølge. */
export const boxMarks = (b: { loud?: boolean; night?: boolean }): MarkKind[] => MARK_KINDS.filter((k) => b[k]);

/** Merkene med vanlige ord, til datafanen: «Høylytt arbeid, nattarbeid». */
export function markText(b: { loud?: boolean; night?: boolean }): string {
  return boxMarks(b)
    .map((k, i) => (i ? MARK_NAMES[k].toLowerCase() : MARK_NAMES[k]))
    .join(', ');
}

/** Ikonene på en boks. Plassen regnes ut ved tegning, så de følger boksen når den flyttes. */
export interface BoxMarks {
  kinds: MarkKind[];
  /** Siden på ikonet, i mm. */
  size: number;
  /** Side om side langs toppen i stedet for under hverandre. */
  row: boolean;
}

/** Andelen av ikonet som stikker ut av boksen. */
export const MARK_OUT = 0.3;
/** Luft mellom ikonene, i forhold til ikonet. */
const GAP = 0.15;
/** Luft mellom teksten og ikonene, i mm. */
const TEXT_PAD = 0.4;

/** Ikonet er litt lavere enn en tekstlinje, så én rad med ikoner får plass i en boks med én linje. */
export const markSize = (lineH: number): number => lineH * 0.92;

/** Valgene for størrelsen på alle ikonene, i forhold til standard. */
export const MARK_SCALES: readonly [number, string][] = [[0.75, 'Liten'], [1, 'Standard'], [1.25, 'Stor'], [1.5, 'Større']];
/** Egen størrelse fra planen, holdt innenfor valgene. */
export const markScaleOf = (v: number | undefined): number => Math.min(1.5, Math.max(0.75, v ?? 1));

/** Høyden ikonene trenger, med luft over og under som i en boks med én tekstlinje. */
export function marksHeight(m: Pick<BoxMarks, 'kinds' | 'size' | 'row'>, oneLineH: number): number {
  const n = m.row ? 1 : m.kinds.length;
  return n * m.size + (n - 1) * m.size * GAP + Math.max(oneLineH - m.size, m.size * 0.2);
}

/** Bredden teksten må holde seg unna på høyre side, i mm. */
export function marksInset(m: Pick<BoxMarks, 'kinds' | 'size' | 'row'>): number {
  const n = m.row ? m.kinds.length : 1;
  return n * m.size + (n - 1) * m.size * GAP - m.size * MARK_OUT + TEXT_PAD;
}

/**
 * Hvor ikonene står. `edge` er høyre kant av boksen (innenfor pilspissen når boksen fortsetter),
 * `y` og `h` er boksens topp og høyde, `oneLineH` høyden på en boks med én tekstlinje.
 * Ikonene står øverst, på høyde med første tekstlinje, eller midt i når boksen er lavere.
 */
export function markRects(m: BoxMarks, edge: number, y: number, h: number, oneLineH: number): { kind: MarkKind; x: number; y: number; s: number }[] {
  const s = m.size;
  const g = s * GAP;
  const n = m.row ? 1 : m.kinds.length;
  const stack = n * s + (n - 1) * g;
  const top = y + Math.max(0, Math.min((oneLineH - s) / 2, (h - stack) / 2));
  const right = edge + s * MARK_OUT - s;
  return m.kinds.map((kind, i) =>
    m.row
      ? { kind, x: right - (m.kinds.length - 1 - i) * (s + g), y: top, s }
      : { kind, x: right, y: top + i * (s + g), s },
  );
}

/** En del av et ikon, som SVG-attributter. Bare enkle stier og absolutte koordinater, så PDF-en kan tegne dem. */
export interface MarkShape {
  tag: 'path';
  attrs: Record<string, string | number>;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Avrundet kvadrat som sti, med kurver i hjørnene. */
function roundedSquare(x: number, y: number, s: number, rad: number): string {
  const k = rad * 0.4477; // avstanden fra hjørnet til kontrollpunktene for en kvart sirkel
  const x1 = x + s;
  const y1 = y + s;
  return [
    `M${r3(x + rad)} ${r3(y)}`,
    `L${r3(x1 - rad)} ${r3(y)}`,
    `C${r3(x1 - k)} ${r3(y)} ${r3(x1)} ${r3(y + k)} ${r3(x1)} ${r3(y + rad)}`,
    `L${r3(x1)} ${r3(y1 - rad)}`,
    `C${r3(x1)} ${r3(y1 - k)} ${r3(x1 - k)} ${r3(y1)} ${r3(x1 - rad)} ${r3(y1)}`,
    `L${r3(x + rad)} ${r3(y1)}`,
    `C${r3(x + k)} ${r3(y1)} ${r3(x)} ${r3(y1 - k)} ${r3(x)} ${r3(y1 - rad)}`,
    `L${r3(x)} ${r3(y + rad)}`,
    `C${r3(x)} ${r3(y + k)} ${r3(x + k)} ${r3(y)} ${r3(x + rad)} ${r3(y)}`,
    'Z',
  ].join(' ');
}

/** Punkter langs en sirkelbue, fra vinkel a0 til a1 (radianer, med klokka siden y går nedover). */
function arc(cx: number, cy: number, rad: number, a0: number, a1: number, steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return out;
}

const poly = (pts: [number, number][], close: boolean) =>
  pts.map(([px, py], i) => `${i ? 'L' : 'M'}${r3(px)} ${r3(py)}`).join(' ') + (close ? ' Z' : '');

const LOUD_FILL = '#FFC928';
const LOUD_EDGE = '#7A5A00';
const NIGHT_FILL = '#1D2B57';
const NIGHT_EDGE = '#0C1430';
const INK = '#1A1A1A';
const MOON = '#FFE58A';

/**
 * Ikonet i kvadratet (x, y) med siden s.
 * Høylytt arbeid: høyttaler med lydbølger på gul bunn. Nattarbeid: halvmåne og en liten stjerne på mørkeblå bunn.
 */
export function markShapes(kind: MarkKind, x: number, y: number, s: number): MarkShape[] {
  const P = (u: number, v: number): [number, number] => [x + u * s, y + v * s];
  const badge: MarkShape = {
    tag: 'path',
    attrs: { d: roundedSquare(x, y, s, s * 0.22), fill: kind === 'loud' ? LOUD_FILL : NIGHT_FILL, stroke: kind === 'loud' ? LOUD_EDGE : NIGHT_EDGE, 'stroke-width': r3(s * 0.045) },
  };
  if (kind === 'loud') {
    // Høyttaleren: en liten boks og en trakt som åpner seg mot høyre
    const body = poly([P(0.17, 0.39), P(0.31, 0.39), P(0.5, 0.22), P(0.5, 0.78), P(0.31, 0.61), P(0.17, 0.61)], true);
    const waves = [0.15, 0.27].map((rad) => {
      const pts = arc(x + 0.5 * s, y + 0.5 * s, rad * s, -0.85, 0.85, 10);
      return poly(pts, false);
    });
    return [
      badge,
      { tag: 'path', attrs: { d: body, fill: INK, stroke: INK, 'stroke-width': r3(s * 0.03), 'stroke-linejoin': 'round' } },
      ...waves.map((d): MarkShape => ({ tag: 'path', attrs: { d, fill: 'none', stroke: INK, 'stroke-width': r3(s * 0.075), 'stroke-linecap': 'round' } })),
    ];
  }
  // Halvmånen: en sirkel med en mindre sirkel skåret ut oppe til høyre
  const [cx, cy, R] = [x + 0.45 * s, y + 0.53 * s, 0.31 * s];
  const [ix, iy, r] = [x + 0.6 * s, y + 0.4 * s, 0.26 * s];
  // Skjæringspunktene mellom sirklene
  const dx = ix - cx;
  const dy = iy - cy;
  const d = Math.hypot(dx, dy);
  const a = (R * R - r * r + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, R * R - a * a));
  const mx = cx + (a * dx) / d;
  const my = cy + (a * dy) / d;
  const p1: [number, number] = [mx + (hh * dy) / d, my - (hh * dx) / d];
  const p2: [number, number] = [mx - (hh * dy) / d, my + (hh * dx) / d];
  // Ytre bue: delen utenfor den innerste sirkelen, altså den som går gjennom punktet lengst fra den.
  // Indre bue: delen inne i den ytre sirkelen, gjennom punktet nærmest sentrum av den ytre.
  const far = Math.atan2(-dy, -dx);
  const norm = (v: number) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  /** Vinklene fra p til q langs sirkelen, i den retningen som går gjennom vinkelen `via`. */
  const span = (p: [number, number], q: [number, number], ox: number, oy: number, via: number): [number, number] => {
    const a0 = Math.atan2(p[1] - oy, p[0] - ox);
    const up = norm(Math.atan2(q[1] - oy, q[0] - ox) - a0);
    return norm(via - a0) <= up ? [a0, a0 + up] : [a0, a0 - (2 * Math.PI - up)];
  };
  const [o0, o1] = span(p1, p2, cx, cy, far);
  const [i0, i1] = span(p2, p1, ix, iy, far);
  const moon = poly([...arc(cx, cy, R, o0, o1, 24), ...arc(ix, iy, r, i0, i1, 16).slice(1)], true);
  // Fireuddet stjerne oppe til høyre
  const [sx, sy, sr] = [x + 0.76 * s, y + 0.27 * s, 0.1 * s];
  const star = poly([[sx, sy - sr], [sx + sr * 0.3, sy - sr * 0.3], [sx + sr, sy], [sx + sr * 0.3, sy + sr * 0.3], [sx, sy + sr], [sx - sr * 0.3, sy + sr * 0.3], [sx - sr, sy], [sx - sr * 0.3, sy - sr * 0.3]], true);
  return [
    badge,
    { tag: 'path', attrs: { d: moon, fill: MOON, stroke: 'none' } },
    { tag: 'path', attrs: { d: star, fill: MOON, stroke: 'none' } },
  ];
}

/** Merkene en boks må ha for å være med i et utvalg: ett av dem, eller alle når `all` er satt. Tomt utvalg tar med alle. */
export function marksMatch(kinds: readonly MarkKind[], pick: readonly MarkKind[], all: boolean): boolean {
  if (!pick.length) return true;
  return all ? pick.every((k) => kinds.includes(k)) : pick.some((k) => kinds.includes(k));
}

/** Utvalget med vanlige ord: «høylytt arbeid», «høylytt arbeid eller nattarbeid», «høylytt arbeid og nattarbeid». */
export function marksLabel(pick: readonly MarkKind[], all: boolean): string {
  const names = MARK_KINDS.filter((k) => pick.includes(k)).map((k) => MARK_NAMES[k].toLowerCase());
  return names.join(all ? ' og ' : ' eller ');
}
