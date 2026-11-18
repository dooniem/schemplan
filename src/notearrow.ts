// Pil fra en fritekst i redigeringen: slå pilen av og på, dra pilspissen, og fest den til boksen
// den slippes på. Pilen tegnes på nytt mens teksten eller spissen dras, uten å tegne hele planen.
import type { NoteArrow, PlanFile, PlanImage } from './format/types';
import { itemRect, type Layout } from './layout/layout';
import { arrowStyleOf, arrowTip, bendThrough, nearestOnPoly, defaultTip, placeArrow, storeTip, targetAt, type Rect } from './layout/arrow';
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
  /** Dra i knotten midt på streken for å kurve den. */
  startBendDrag(id: string): { moveXY(x: number, y: number): void; end(): void } | null;
  /** Endrer utseendet (tykkelse, farge, pilspiss, kurve) som ett angresteg. Udefinert fjerner valget. */
  setStyle(id: string, change: Partial<Pick<NoteArrow, 'width' | 'color' | 'head' | 'bend'>>): void;
}

export function createNoteArrows(h: NoteArrowHost, nameOf: (plan: PlanFile, id: string) => string): NoteArrows {
  /** Pilspissen mens den dras, og boksen den står på. */
  let live: { id: string; tip: Pt; target: { id: string; rect: Rect } | null; bend?: number; line?: number } | null = null;
  /** Den kritiske linjen slik den er tegnet, eller null. */
  const linePts = () => {
    const pts = h.layout()?.critical?.points;
    return pts && pts.length >= 4 ? pts : null;
  };
  /** Står pilspissen på den kritiske linjen (nå, eller der den slippes)? */
  const onLine = (im: PlanImage) => (live?.id === im.id ? live.line !== undefined : im.note?.arrow?.line !== undefined && !!linePts());

  const rectOf = (id: string) => {
    const it = h.layout()?.items.find((i) => i.id === id);
    return it ? itemRect(it) : null;
  };
  const targets = () => (h.layout()?.items ?? []).map((it) => ({ id: it.id, rect: itemRect(it) }));
  const tipOf = (im: PlanImage): Pt | null => {
    const L = h.layout();
    if (live?.id === im.id) return live.tip;
    return L && im.note?.arrow ? arrowTip(im.note.arrow, L.width, L.height, rectOf, linePts()) : null;
  };

  /** Utseendet, med kurven slik den dras akkurat nå. */
  const styleOf = (im: PlanImage) => {
    const st = arrowStyleOf(im);
    return live?.id === im.id && live.bend !== undefined ? { ...st, bend: live.bend } : st;
  };
  const placedArrow = (im: PlanImage) => {
    const p = h.placedOf(im.id);
    const tip = tipOf(im);
    return p && tip ? placeArrow(p, tip, styleOf(im)) : null;
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
    const a = tip ? placeArrow(p, tip, styleOf(im)) : null;
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
        if (x?.note?.arrow) x.note.arrow = storeTip(tip, L.width, L.height, null, x.note.arrow);
      });
    },
    setStyle(id, change) {
      h.commit((pl) => {
        const a = h.findImage(pl, id)?.note?.arrow;
        if (!a) return;
        for (const [k, v] of Object.entries(change) as [keyof typeof change, unknown][]) {
          if (v === undefined) delete a[k];
          else Object.assign(a, { [k]: v });
        }
      });
    },
    targetOf(plan, im) {
      if (onLine(im)) return 'den kritiske linjen';
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
      const target = onLine(im) ? null : live?.id === im.id ? live.target : im.note.arrow.to ? { id: im.note.arrow.to.id, rect: rectOf(im.note.arrow.to.id) } : null;
      // Festet til den kritiske linjen: linjen markeres stiplet
      const pts = onLine(im) ? linePts() : null;
      if (pts) {
        const d = pts.reduce((acc, v, i) => acc + (i % 2 ? ` ${v}` : `${i ? ' L' : 'M'} ${v}`), '');
        add('path', { d, fill: 'none', stroke: h.accent, 'stroke-width': 3, 'stroke-opacity': 0.35, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' });
      }
      if (target?.rect) {
        const r = target.rect;
        const pad = 0.6;
        add('rect', { x: r.x - pad, y: r.y - pad, width: r.w + 2 * pad, height: r.h + 2 * pad, rx: 0.6, fill: 'none', stroke: h.accent, 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke' });
      }
      // Knotten midt på streken kurver den. En rute, så den ikke forveksles med spissen eller rotasjonen.
      const pa = placedArrow(im);
      if (pa) {
        const m = pa.mid;
        const s = 5 * k;
        const b = add('rect', { x: m.x - s, y: m.y - s, width: 2 * s, height: 2 * s, transform: `rotate(45 ${m.x} ${m.y})`, fill: '#FFFFFF', stroke: h.accent, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', class: 'edit-handle note-bend', 'pointer-events': 'all', cursor: 'move' });
        b.append(Object.assign(document.createElementNS(NS, 'title'), { textContent: 'Dra for å kurve streken. Dra tilbake til midten for rett strek.' }));
      }
      const c = add('circle', { cx: tip.x, cy: tip.y, r: 6 * k, fill: h.accent, 'fill-opacity': 0.18, stroke: h.accent, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', class: 'edit-handle note-tip', 'pointer-events': 'all', cursor: 'move' });
      c.append(Object.assign(document.createElementNS(NS, 'title'), { textContent: 'Dra pilspissen dit pilen skal peke. Slipp den på en boks eller den kritiske linjen for at pilen skal følge den. Alt: ikke fest.' }));
    },
    startBendDrag(id) {
      const plan = h.getPlan();
      const im = plan ? h.findImage(plan, id) : null;
      const tip = im ? tipOf(im) : null;
      const p = h.placedOf(id);
      if (!im?.note?.arrow || !tip || !p) return null;
      const to = im.note.arrow.to;
      const r = to ? rectOf(to.id) : null;
      const target = to && r ? { id: to.id, rect: r } : null;
      const line = im.note.arrow.line !== undefined && linePts() ? im.note.arrow.line : undefined;
      return {
        moveXY(x, y) {
          live = { id, tip, target, line, bend: bendThrough(p, tip, { x, y }) };
          redraw(id);
          h.overlay();
        },
        end() {
          const done = live;
          live = null;
          if (done?.bend === undefined) return h.overlay();
          h.commit((pl) => {
            const a = h.findImage(pl, id)?.note?.arrow;
            if (!a) return;
            if (done.bend) a.bend = done.bend;
            else delete a.bend;
          });
        },
      };
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
          // Nær den kritiske linjen (omtrent åtte skjermpunkter) fanges spissen av den, foran boksene den går langs
          const pts = h.snapOff() ? null : linePts();
          const near = pts ? nearestOnPoly(pts, tip) : null;
          if (near && near.dist <= 8 * h.mmPerPx()) {
            live = { id, tip: near.pt, target: null, line: near.t };
          } else live = { id, tip, target: h.snapOff() ? null : targetAt(tip, targets()) };
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
            if (x?.note?.arrow) x.note.arrow = storeTip(done.tip, L.width, L.height, done.target, x.note.arrow, done.line);
          });
        },
      };
    },
  };
}
