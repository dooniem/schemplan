/**
 * Egendefinert planområde: toppkanten og bunnkanten er hver sin brutte linje fra venstre til høyre.
 * Lanene står som før, men bokser må ligge mellom kantene der de står i tid.
 * Punktene lagres som andeler av arket ([x, y]), så formen følger med ved bytte av ark.
 */

export type Pt = [number, number];

export interface PlanArea {
  top?: Pt[];
  bottom?: Pt[];
}

/** Kantene i mm, med punktene sortert fra venstre og rettet inn mellom grensene. */
export interface AreaEdges {
  top: Pt[];
  bottom: Pt[];
  /** Høyeste toppkant lanene kan ha (rett under kalenderen). */
  minTop: number;
  /** Laveste bunnkant lanene kan ha (rett over forklaringen). */
  maxBottom: number;
  left: number;
  right: number;
}

/** Minste avstand mellom toppkanten og bunnkanten, i mm. */
export const MIN_AREA_H = 10;

/** Kanten fra arkets andeler til mm, sortert og strukket ut til begge sider. Uten punkter: rett linje på y. */
export function edgeMm(pts: Pt[] | undefined, W: number, H: number, left: number, right: number, y: number, lo: number, hi: number): Pt[] {
  const raw: Pt[] = pts?.length ? pts.map(([x, v]) => [Math.min(right, Math.max(left, x * W)), Math.min(hi, Math.max(lo, v * H))]) : [[left, y], [right, y]];
  // Stabil sortering, så to punkter rett over hverandre (loddrett kant) beholder rekkefølgen
  const out = raw.map((p, i) => ({ p, i })).sort((a, b) => a.p[0] - b.p[0] || a.i - b.i).map((e) => e.p);
  // Endepunktene står i sidene. Står de nesten der (avrunding), flyttes de helt ut.
  if (out[0][0] > left + 0.5) out.unshift([left, out[0][1]]);
  else out[0] = [left, out[0][1]];
  const n = out.length - 1;
  if (out[n][0] < right - 0.5) out.push([right, out[n][1]]);
  else out[n] = [right, out[n][1]];
  return out;
}

/** Kantens høyde ved x. Ved en loddrett kant gjelder punktet som kommer først. */
export function edgeAt(edge: Pt[], x: number): number {
  if (x <= edge[0][0]) return edge[0][1];
  for (let i = 1; i < edge.length; i++) {
    const [ax, ay] = edge[i - 1];
    const [bx, by] = edge[i];
    if (x <= bx) return bx - ax < 1e-9 ? ay : ay + ((x - ax) / (bx - ax)) * (by - ay);
  }
  return edge[edge.length - 1][1];
}

/** Største (max) eller minste (min) høyde på kanten mellom a og b, iberegnet punktene imellom. */
export function edgeRange(edge: Pt[], a: number, b: number, kind: 'max' | 'min'): number {
  const f = kind === 'max' ? Math.max : Math.min;
  let v = f(edgeAt(edge, a), edgeAt(edge, b));
  for (const [x, y] of edge) if (x > a + 1e-6 && x < b - 1e-6) v = f(v, y);
  return v;
}

/** Omrisset: toppkanten fra venstre, bunnkanten tilbake fra høyre. */
export function areaPolygon(e: { top: Pt[]; bottom: Pt[] }): Pt[] {
  return [...e.top, ...e.bottom.slice().reverse()];
}

/** Kanten er en rett, vannrett linje. */
export function isStraight(edge: Pt[]): boolean {
  return edge.every((p) => Math.abs(p[1] - edge[0][1]) < 1e-6);
}
