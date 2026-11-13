// Valgmodus for «Slå sammen med …»: lanen som skal bli borte er merket, og neste klikk på en
// annen lane slår dem sammen. Linjen øverst har også en liste, så det går uten mus og når lanen
// ligger langt unna på arket.
import type { PlanFile } from './format/types';
import type { Layout } from './layout/layout';
import { plainText } from './format/text';
import { mergeTargets } from './lanemerge';

const NS = 'http://www.w3.org/2000/svg';

export interface LanePick {
  /** Lanen som skal slås sammen med en annen, eller null når valget ikke er i gang. */
  readonly from: string | null;
  start(from: string): void;
  end(): void;
  /** Lanen musen er over. Gir true når merkingen må tegnes på nytt. */
  hover(lane: string | null): boolean;
  /** Klikk på arket: slår sammen med lanen, eller sier hvorfor det ikke går. */
  click(lane: string | null): void;
  /** Merker lanen som blir borte (stiplet) og lanen boksene flyttes til (heltrukket). */
  draw(g: SVGGElement, L: Layout): void;
}

export const laneName = (name: string) => `«${plainText(name.replace(/\|/g, ' ')) || 'Uten navn'}»`;

/** «7 bokser og 2 milepæler», «1 boks», «ingenting». */
export function contentWords(plan: PlanFile, id: string): string {
  const boxes = plan.lanes.find((l) => l.id === id)?.boxes ?? [];
  const ms = boxes.filter((b) => b.resolved?.isMilestone).length;
  const bx = boxes.length - ms;
  const parts = [bx && `${bx} ${bx === 1 ? 'boks' : 'bokser'}`, ms && `${ms} ${ms === 1 ? 'milepæl' : 'milepæler'}`].filter(Boolean);
  return parts.length ? parts.join(' og ') : 'ingenting';
}

export function createLanePick(o: {
  bar: HTMLElement;
  accent: string;
  getPlan: () => PlanFile | null;
  onMerge: (from: string, to: string) => void;
  /** Valget startet, sluttet eller fikk nytt mål: oppdater verktøylinje, markør og merking. */
  onChange: () => void;
}): LanePick {
  const text = o.bar.querySelector<HTMLElement>('.lanemerge-text')!;
  const select = o.bar.querySelector<HTMLSelectElement>('#lanemerge-select')!;
  const go = o.bar.querySelector<HTMLButtonElement>('#lanemerge-go')!;
  let from: string | null = null;
  let target: string | null = null;

  const prompt = () => {
    const plan = o.getPlan();
    const lane = plan?.lanes.find((l) => l.id === from);
    if (!plan || !lane) return;
    text.textContent = `Klikk lanen ${laneName(lane.name)} skal slås sammen med. ${capital(contentWords(plan, lane.id))} flyttes dit, og lanen blir borte.`;
  };
  const setTarget = (id: string | null) => {
    target = id;
    select.value = id ?? '';
    go.disabled = !id;
  };
  const merge = (to: string) => {
    const f = from;
    end();
    if (f) o.onMerge(f, to);
  };

  const start = (id: string) => {
    const plan = o.getPlan();
    if (!plan) return;
    from = id;
    select.replaceChildren(new Option('Velg lane …', ''), ...mergeTargets(plan, id).map((l) => new Option(plainText(l.name.replace(/\|/g, ' ')) || 'Uten navn', l.id)));
    setTarget(null);
    prompt();
    o.bar.hidden = false;
    o.onChange();
  };
  function end() {
    if (from === null) return;
    from = null;
    target = null;
    o.bar.hidden = true;
    o.onChange();
  }

  // Merkingen på arket viser hvilken lane som er valgt i listen
  select.addEventListener('input', () => {
    setTarget(select.value || null);
    o.onChange();
  });
  go.addEventListener('click', () => target && merge(target));
  o.bar.querySelector('#lanemerge-cancel')?.addEventListener('click', end);

  return {
    get from() {
      return from;
    },
    start,
    end,
    hover(lane) {
      if (from === null || lane === target || (lane !== null && lane === from)) return false;
      // Musen over arket overstyrer listen, men tom plass fjerner ikke det som er valgt der
      if (lane === null) return false;
      setTarget(lane);
      return true;
    },
    click(lane) {
      const plan = o.getPlan();
      if (from === null || !plan || !lane) return;
      if (lane === from) {
        text.textContent = 'Det er lanen som skal slås sammen. Klikk en annen lane.';
        return;
      }
      if (mergeTargets(plan, from).some((l) => l.id === lane)) merge(lane);
    },
    draw(g, L) {
      if (from === null) return;
      for (const ln of L.lanes) {
        const src = ln.id === from;
        if (!src && ln.id !== target) continue;
        const r = document.createElementNS(NS, 'rect');
        const attrs = src
          ? { fill: o.accent, 'fill-opacity': 0.06, stroke: o.accent, 'stroke-width': 0.5, 'stroke-dasharray': '1.6 1' }
          : { fill: o.accent, 'fill-opacity': 0.1, stroke: o.accent, 'stroke-width': 0.7 };
        for (const [k, v] of Object.entries({ x: L.laneTitleX + 0.35, y: ln.y0 + 0.35, width: L.plot.x1 - L.laneTitleX - 0.7, height: ln.y1 - ln.y0 - 0.7, rx: 0.6, ...attrs }))
          r.setAttribute(k, String(v));
        g.append(r);
      }
    },
  };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
