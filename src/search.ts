// Søk i planen: bokser og milepæler der teksten eller aktivitetene passer, markeres i tegningen.
// Markeringen ligger i et eget lag som ikke kommer med i PDF eller utskrift.
import { plainText } from './format/text';
import type { PlanFile } from './format/types';

const NS = 'http://www.w3.org/2000/svg';
const HIT = '#F5A000';

const norm = (s: string) => plainText(s).toLocaleLowerCase('nb');

/**
 * Id-ene til boksene som passer. Alle ordene må finnes i boksteksten, aktivitetsnavnene, faget
 * eller lanenavnet, og minst ett av dem i selve boksen. Lanenavnet snevrer altså bare inn
 * («Bygg A betong»); et søk som bare passer lanenavnet, gjør ikke hele lanen til treff.
 */
export function findMatches(plan: PlanFile, query: string): string[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const names = new Map(plan.tasks.map((t) => [t.uid, t.name]));
  const out: string[] = [];
  for (const l of plan.lanes) {
    if (!l.shown || l.hidden) continue;
    const lane = norm(l.name);
    for (const b of l.boxes) {
      if (!b.shown || b.hidden) continue;
      const own = norm([b.text, ...b.taskIds.map((id) => names.get(id) ?? ''), b.trade ?? b.resolved?.trade ?? ''].join(' '));
      if (words.every((w) => own.includes(w) || lane.includes(w)) && words.some((w) => own.includes(w))) out.push(b.id);
    }
  }
  return out;
}

/** Lanene der hele søket står i navnet, til meldingen når ingen bokser passer. */
export function matchingLanes(plan: PlanFile, query: string): string[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  return plan.lanes.filter((l) => l.shown && !l.hidden && words.every((w) => norm(l.name).includes(w))).map((l) => plainText(l.name));
}

export interface Search {
  /** Kalles etter hver tegning, så markeringen legges på den nye SVG-en. */
  afterDraw(svg: SVGSVGElement): void;
  /** Ny plan er åpnet. */
  reset(): void;
}

export function createSearch(input: HTMLInputElement, count: HTMLElement, getPlan: () => PlanFile | null): Search {
  let svg: SVGSVGElement | null = null;
  let hits: string[] = [];
  let current = -1;

  const paint = () => {
    svg?.querySelector('g.search-hits')?.remove();
    const plan = getPlan();
    const lanes = !hits.length && plan ? matchingLanes(plan, input.value) : [];
    count.textContent = input.value.trim()
      ? hits.length
        ? `${current + 1 > 0 ? `${current + 1} av ` : ''}${hits.length} treff`
        : lanes.length
          ? `Ingen bokser. Passer lanen ${lanes[0]}${lanes.length > 1 ? ` og ${lanes.length - 1} til` : ''}`
          : 'Ingen treff'
      : '';
    if (!svg || !hits.length) return;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'edit-overlay search-hits');
    g.setAttribute('pointer-events', 'none');
    hits.forEach((id, i) => {
      const item = svg!.querySelector<SVGGElement>(`g[data-id="${CSS.escape(id)}"]`);
      if (!item) return;
      const b = item.getBBox();
      const pad = 0.8;
      const r = document.createElementNS(NS, 'rect');
      const on = i === current;
      for (const [k, v] of Object.entries({ x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad, rx: 0.8, fill: HIT, 'fill-opacity': on ? 0.25 : 0.12, stroke: HIT, 'stroke-width': on ? 3 : 2, 'vector-effect': 'non-scaling-stroke' }))
        r.setAttribute(k, String(v));
      g.append(r);
    });
    svg.append(g);
  };

  const run = () => {
    const plan = getPlan();
    hits = plan ? findMatches(plan, input.value) : [];
    current = -1;
    paint();
  };

  /** Hopper til neste (eller forrige) treff og ruller det fram. */
  const step = (dir: 1 | -1) => {
    if (!hits.length) return;
    current = (current + dir + hits.length) % hits.length;
    paint();
    svg?.querySelector(`g[data-id="${CSS.escape(hits[current])}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  };

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      input.value = '';
      run();
      input.blur();
    }
  });
  // Ctrl+F søker i planen når en plan er åpen
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && getPlan() && !input.disabled) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  return {
    afterDraw(next) {
      svg = next;
      // Treffene regnes ut på nytt, for teksten kan ha blitt endret
      const keep = current >= 0 ? hits[current] : null;
      const plan = getPlan();
      hits = plan ? findMatches(plan, input.value) : [];
      current = keep ? hits.indexOf(keep) : -1;
      paint();
    },
    reset() {
      input.value = '';
      hits = [];
      current = -1;
      paint();
    },
  };
}
