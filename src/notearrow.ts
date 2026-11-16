// Pil fra en fritekst i redigeringen: slå pilen av og på, dra pilspissen, og fest den til boksen
// den slippes på. Pilen tegnes på nytt mens teksten eller spissen dras, uten å tegne hele planen.
import type { PlanFile, PlanImage } from './format/types';
import { itemRect, type Layout } from './layout/layout';
import { arrowTip, defaultTip, placeArrow, storeTip, targetAt, type Rect } from './layout/arrow';
import type { PlacedImage, Pt } from './layout/image';
import { drawArrow } from './render/svg';

const NS = 'http://www.w3.org/2000/svg';

export interface NoteArrowHost {
  accent: string;
  getPlan(): PlanFile | null;
  layout(): Layout | null;
  svg(): SVGSVGElement | null;
  findImage(plan: PlanFile, id: string): PlanImage | null;
  /** Teksten slik den står på arket, også mens den dras. */
  placedOf(id: string): PlacedImage | null;
  /** Lagrer en endring som ett angresteg og tegner planen på nytt. */
  commit(fn: (plan: PlanFile) => void): void;
  /** Millimeter per skjermpunkt. */
  mmPerPx(): number;
  /** Alt holdt nede: pilspissen festes ikke til boksen under den. */
  snapOff(): boolean;
  /** Tegn markeringene på nytt. */
  overlay(): void;
}

export interface NoteArrows {
  /** Slår pilen på (pekende ned og til høyre) eller av. */
  toggle(id: string, on: boolean): void;
  /** Løsner pilspissen fra boksen; den blir stående der den er. */
  detach(id: string): void;
  /** Navnet på det pilen er festet til, eller null. */
  targetOf(plan: PlanFile, im: PlanImage): string | null;
  /** Tegner pilen på nytt slik teksten står nå (mens den dras). */
  redraw(id: string): void;
  /** Håndtaket på pilspissen og boksen den er festet til. */
  draw(g: SVGGElement, im: PlanImage): void;
  /** Dra i pilspissen til den valgte friteksten. */
  startTipDrag(id: string): { moveXY(x: number, y: number): void; end(): void } | null;
}

export function createNoteArrows(h: NoteArrowHost, nameOf: (plan: PlanFile, id: string) => string): NoteArrows {
  /** Pilspissen mens den dras, og boksen den står på. */
  let live: { id: string; tip: Pt; target: { id: string; rect: Rect } | null } | null = null;

  const rectOf = (id: string) => {
    const it = h.layout()?.items.find((i) => i.id === id);
    return it ? itemRect(it) : null;
  };
  const targets = () => (h.layout()?.items ?? []).map((it) => ({ id: it.id, rect: itemRect(it) }));
  const tipOf = (im: PlanImage): Pt | null => {
    const L = h.layout();
    if (live?.id === im.id) return live.tip;
    return L && im.note?.arrow ? arrowTip(im.note.arrow, L.width, L.height, rectOf) : null;
  };

  const redraw = (id: string) => {
    const plan = h.getPlan();
    const svg = h.svg();
    const im = plan ? h.findImage(plan, id) : null;
    const p = h.placedOf(id);
    const layer = svg?.querySelector('g.note-arrows');
    if (!im?.note || !p || !layer) return;
    const old = layer.querySelector(`g[data-arrow="${CSS.escape(id)}"]`);
    const tip = tipOf(im);
    const a = tip ? placeArrow(p, tip, im.note.sizePt, im.note.color ?? '#000000') : null;
    if (!a) return old?.remove();
    const g = drawArrow(a, layer);
    if (old) old.replaceWith(g);
  };

  return {
    toggle(id, on) {
      const L = h.layout();
      const p = h.placedOf(id);
      if (!L || !p) return;
      h.commit((pl) => {
        const im = h.findImage(pl, id);
        if (!im?.note) return;
        if (!on) delete im.note.arrow;
        else {
          const tip = defaultTip(p, L.width, L.height);
          im.note.arrow = storeTip(tip, L.width, L.height, null);
        }
      });
    },
    detach(id) {
      const L = h.layout();
      const plan = h.getPlan();
      const im = plan ? h.findImage(plan, id) : null;
      const tip = im ? tipOf(im) : null;
      if (!L || !tip) return;
      h.commit((pl) => {
        const x = h.findImage(pl, id);
        if (x?.note?.arrow) x.note.arrow = storeTip(tip, L.width, L.height, null);
      });
    },
    targetOf(plan, im) {
      const to = im.note?.arrow?.to;
      return to && rectOf(to.id) ? nameOf(plan, to.id) : null;
    },
    redraw,
    draw(g, im) {
      const tip = tipOf(im);
      if (!tip || !im.note?.arrow) return;
      const k = h.mmPerPx();
      const add = (tag: string, attrs: Record<string, string | number>) => {
        const e = document.createElementNS(NS, tag);
        for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, String(v));
        g.append(e);
        return e;
      };
      // Boksen pilen er festet til (eller blir festet til når den slippes)
      const target = live?.id === im.id ? live.target : im.note.arrow.to ? { id: im.note.arrow.to.id, rect: rectOf(im.note.arrow.to.id) } : null;
      if (target?.rect) {
        const r = target.rect;
        const pad = 0.6;
        add('rect', { x: r.x - pad, y: r.y - pad, width: r.w + 2 * pad, height: r.h + 2 * pad, rx: 0.6, fill: 'none', stroke: h.accent, 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke' });
      }
      const c = add('circle', { cx: tip.x, cy: tip.y, r: 6 * k, fill: h.accent, 'fill-opacity': 0.18, stroke: h.accent, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', class: 'edit-handle note-tip', 'pointer-events': 'all', cursor: 'move' });
      c.append(Object.assign(document.createElementNS(NS, 'title'), { textContent: 'Dra pilspissen dit pilen skal peke. Slipp den på en boks for at pilen skal følge boksen. Alt: ikke fest.' }));
    },
    startTipDrag(id) {
      const plan = h.getPlan();
      const im = plan ? h.findImage(plan, id) : null;
      const tip0 = im ? tipOf(im) : null;
      if (!im?.note?.arrow || !tip0) return null;
      return {
        // Knotten sitter på spissen, så spissen følger musen
        moveXY(x, y) {
          const tip = { x, y };
          live = { id, tip, target: h.snapOff() ? null : targetAt(tip, targets()) };
          redraw(id);
          h.overlay();
        },
        end() {
          const L = h.layout();
          const done = live;
          live = null;
          if (!done || !L) return h.overlay();
          h.commit((pl) => {
            const x = h.findImage(pl, id);
            if (x?.note?.arrow) x.note.arrow = storeTip(done.tip, L.width, L.height, done.target);
          });
        },
      };
    },
  };
}
