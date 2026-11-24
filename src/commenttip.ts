// Kommentaren i detaljene ved musepeker, og et lite merke i hjørnet av bokser som har kommentar.
// Merket er en del av markeringene på skjermen (edit-overlay), så det kommer aldri med på arket.
import type { Box, CommentImage } from './format/types';
import type { Layout } from './layout/layout';
import { commentOf } from './comment';

const NS = 'http://www.w3.org/2000/svg';
/** Rødt som kommentarmerket i Excel, med hvit kant så det synes på røde bokser også. */
const MARK_FILL = '#C4262E';
/** Sidene i trekanten, i mm på arket. */
const MARK_MM = 1.6;

/** Største visning av bildene i detaljene, i skjermpunkter. */
const ONE = { w: 480, h: 360 };
const MANY = { w: 236, h: 177 };

/** Bildet skalert ned til å passe i rammen, uten å strekkes. */
export function fitSize(im: Pick<CommentImage, 'w' | 'h'>, max: { w: number; h: number }): { w: number; h: number } {
  const k = Math.min(1, max.w / im.w, max.h / im.h);
  return { w: Math.max(1, Math.round(im.w * k)), h: Math.max(1, Math.round(im.h * k)) };
}

/** Kommentaren til detaljene: teksten med linjeskift, så bildene. null når boksen ikke har kommentar. */
export function commentTip(b: Box): HTMLElement | null {
  const c = commentOf(b);
  if (!c) return null;
  const wrap = document.createElement('div');
  wrap.className = 'tip-comment';
  const text = c.text?.trim();
  if (text) {
    const p = document.createElement('p');
    p.className = 'tip-comment-text';
    p.textContent = text;
    wrap.append(p);
  }
  const imgs = c.images ?? [];
  if (imgs.length) {
    const grid = document.createElement('div');
    grid.className = imgs.length > 1 ? 'tip-imgs many' : 'tip-imgs';
    for (const im of imgs) {
      const img = document.createElement('img');
      // Fast størrelse før bildet er lest inn, så detaljene står på riktig plass med en gang
      const s = fitSize(im, imgs.length > 1 ? MANY : ONE);
      img.width = s.w;
      img.height = s.h;
      img.alt = '';
      img.decoding = 'async';
      img.src = im.data;
      grid.append(img);
    }
    wrap.append(grid);
  }
  return wrap;
}

/** Tegner merket på bokser og milepæler som har kommentar. Tegnes på nytt etter hver tegning av planen. */
export function drawCommentMarks(svg: SVGSVGElement, L: Layout, boxes: ReadonlyMap<string, Box>): void {
  svg.querySelector('g.edit-overlay.comment-marks')?.remove();
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'edit-overlay comment-marks');
  g.setAttribute('pointer-events', 'none');
  const s = MARK_MM;
  for (const it of L.items) {
    const b = boxes.get(it.id);
    if (!b || !commentOf(b)) continue;
    // Øverst til høyre på boksen, eller på teksten til milepælen
    const r = it.kind === 'box' ? { x: it.x1, y: it.y } : { x: it.labelBox.x + it.labelBox.w, y: it.labelBox.y };
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', `M${r.x - s} ${r.y}H${r.x}V${r.y + s}Z`);
    p.setAttribute('fill', MARK_FILL);
    p.setAttribute('stroke', '#FFFFFF');
    p.setAttribute('stroke-width', '0.2');
    p.setAttribute('stroke-linejoin', 'round');
    // Egen gruppe per merke, så det tones ned og skjules sammen med boksen når fag er i fokus
    const m = document.createElementNS(NS, 'g');
    m.setAttribute('data-for', it.id);
    m.append(p);
    g.append(m);
  }
  if (g.childElementCount) svg.append(g);
}
