// Skravering i panelet til bokser: mønster, tetthet og farge, i en del som kan foldes sammen.
// Mønstrene vises som små ruter med strekene slik de blir på arket, i fargen som er valgt.
import type { Box, HatchDensity, HatchPattern } from './format/types';
import { DENSITY_NAMES, HATCH_DEFAULT_COLOR, HATCH_DENSITIES, HATCH_NAMES, HATCH_PATTERNS, hatchOf, hatchPath, setHatch, type Pt } from './layout/hatch';
import { NOTE_COLORS } from './note';
import { joinSummary, type Fold } from './panelfold';

type Trial = { key: string; run: (fn: () => void, live?: boolean) => void; pick: (fill: string, live?: boolean) => void };

export interface HatchKit {
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>, text?: string) => HTMLElementTagNameMap[K];
  section(title: string, fold?: Fold): HTMLElement;
  segmented<T extends string | number>(label: string, value: T, options: [T, string][], onPick: (v: T) => void): HTMLElement;
  swatches(current: string | null, list: [string, string][], t: Trial): HTMLElement;
  colorRow(value: string, t: Trial): DocumentFragment;
  trial(key: string, now: string, set: (fill: string) => void): Trial;
}

/** Strekfargene: standardfargene fra Office, som for fritekst. */
const HATCH_COLORS: [string, string][] = NOTE_COLORS;

/** Verdien når alle boksene har den samme, ellers null. */
const same = <T>(boxes: readonly Box[], get: (b: Box) => T): T | null =>
  boxes.length && boxes.every((b) => get(b) === get(boxes[0])) ? get(boxes[0]) : null;

const colorName = (c: string) => HATCH_COLORS.find(([k]) => k === c.toUpperCase())?.[1] ?? 'egen farge';

/** Oppsummeringen når delen er lukket: mønsteret og fargen, ellers Ingen. */
export function hatchFold(boxes: readonly Box[]): Fold {
  if (!boxes.some((b) => b.hatch)) return { summary: 'Ingen' };
  const pattern = same(boxes, (b) => hatchOf(b)?.pattern ?? null);
  const color = same(boxes, (b) => hatchOf(b)?.color ?? null);
  if (!pattern) return { summary: 'Ulike', changed: true };
  return { summary: joinSummary([HATCH_NAMES[pattern], color && colorName(color).toLowerCase()]), changed: true };
}

const NS = 'http://www.w3.org/2000/svg';
/** Liten rute med mønsteret, tegnet med de samme strekene som på arket (forstørret). */
function patternIcon(pattern: HatchPattern | null, color: string, fill: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 12 9');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'hatch-ico');
  const bg = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({ width: '12', height: '9', fill })) bg.setAttribute(k, v);
  svg.append(bg);
  if (pattern) {
    const poly: Pt[] = [[0, 0], [12, 0], [12, 9], [0, 9]];
    const p = document.createElementNS(NS, 'path');
    for (const [k, v] of Object.entries({ d: hatchPath(pattern, 'normal', poly), fill: 'none', stroke: color, 'stroke-width': '0.55' })) p.setAttribute(k, v);
    svg.append(p);
  }
  return svg;
}

/**
 * Delen «Skravering» for boksene. apply endrer alle boksene som ett angresteg; key skiller fargeprøvingen
 * fra andre fargevalg. fill er fargen boksene har nå (eller null når de er ulike), til rutene med mønstrene.
 */
export function hatchSection(kit: HatchKit, boxes: readonly Box[], key: string, fill: string | null, apply: (fn: (b: Box) => void) => void): void {
  const { el } = kit;
  const s = kit.section('Skravering', hatchFold(boxes));
  const pattern = same(boxes, (b) => hatchOf(b)?.pattern ?? null);
  const mixed = !boxes.every((b) => (hatchOf(b)?.pattern ?? null) === pattern);
  const color = same(boxes, (b) => hatchOf(b)?.color ?? null) ?? HATCH_DEFAULT_COLOR;
  const density = same(boxes, (b) => hatchOf(b)?.density ?? null);
  /** Endrer skraveringen og beholder det som ikke er valgt på nytt. */
  const update = (patch: { pattern?: HatchPattern | null; color?: string; density?: HatchDensity }) =>
    apply((b) => {
      const now = hatchOf(b);
      const p = patch.pattern === undefined ? (now?.pattern ?? null) : patch.pattern;
      setHatch(b, p ? { pattern: p, color: patch.color ?? now?.color ?? color, density: patch.density ?? now?.density } : null);
    });

  // Mønstrene som ruter, med navnet til det valgte over
  const wrap = el('div', { class: 'prop hatch-patterns' });
  const head = el('div', { class: 'prop-head' });
  head.append(el('span', { class: 'prop-label', id: 'hatch-label' }, 'Mønster'), el('span', { class: 'range-value' }, mixed ? 'Ulike' : pattern ? HATCH_NAMES[pattern] : 'Ingen'));
  const grid = el('div', { class: 'hatch-grid', role: 'group', 'aria-labelledby': 'hatch-label' });
  for (const p of [null, ...HATCH_PATTERNS]) {
    const name = p ? HATCH_NAMES[p] : 'Ingen';
    const b = el('button', { type: 'button', class: 'hatch-tile', title: name, 'aria-label': name, 'aria-pressed': String(!mixed && p === pattern) });
    b.append(patternIcon(p, color, fill ?? '#FFFFFF'));
    b.addEventListener('click', () => update({ pattern: p }));
    grid.append(b);
  }
  wrap.append(head, grid);
  s.append(wrap);
  if (!pattern && !mixed) {
    s.append(el('p', { class: 'hint' }, 'Streker over fargen i boksen, for eksempel røde skrå streker på hvit boks for et område som er stengt. Teksten får et felt uten streker rundt seg.'));
    return;
  }

  s.append(kit.segmented<HatchDensity | ''>('Tetthet', density ?? '', HATCH_DENSITIES.map((d): [HatchDensity, string] => [d, DENSITY_NAMES[d]]), (v) => v && update({ density: v })));
  const t = kit.trial(`hatch:${key}`, color, (c) => update({ color: c }));
  const sc = el('div', { class: 'prop' });
  sc.append(el('span', { class: 'prop-label' }, 'Strekfarge'), kit.swatches(same(boxes, (b) => hatchOf(b)?.color ?? null), HATCH_COLORS, t));
  s.append(sc, kit.colorRow(color, t));
}
