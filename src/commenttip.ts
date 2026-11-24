// Kommentaren på skjermen: kort i detaljene ved musepeker, hele kommentaren i et kort når boksen
// klikkes, og bildet stort ved siden av når musen holdes over et lite bilde. Et lite merke i hjørnet
// viser hvilke bokser som har kommentar. Alt dette er bare på skjermen, aldri på arket eller i PDF-en.
import type { Box, CommentImage } from './format/types';
import type { Layout } from './layout/layout';
import { plainText } from './format/text';
import { icon } from './ctxmenu';
import { commentOf } from './comment';

const NS = 'http://www.w3.org/2000/svg';
/** Rødt som kommentarmerket i Excel, med hvit kant så det synes på røde bokser også. */
const MARK_FILL = '#C4262E';
/** Sidene i trekanten, i mm på arket. */
const MARK_MM = 1.6;

/** Små bilder i detaljene og i kortet, i skjermpunkter. */
const TIP_THUMB = { w: 64, h: 44 };
const CARD_THUMB = { w: 96, h: 72 };
/** Flest små bilder i detaljene før resten vises som «+2». */
const TIP_MAX_THUMBS = 3;
/** Største visning av et bilde ved siden av kortet. */
const PREVIEW_MAX = { w: 560, h: 420 };
const GAP = 8;

/** Bildet skalert ned til å passe i rammen, uten å strekkes. */
export function fitSize(im: Pick<CommentImage, 'w' | 'h'>, max: { w: number; h: number }): { w: number; h: number } {
  const k = Math.min(1, max.w / im.w, max.h / im.h);
  return { w: Math.max(1, Math.round(im.w * k)), h: Math.max(1, Math.round(im.h * k)) };
}

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Lite bilde med fast størrelse før det er lest inn, så ingenting hopper. */
function thumb(im: CommentImage, max: { w: number; h: number }, alt = ''): HTMLImageElement {
  const img = make('img');
  const s = fitSize(im, max);
  img.width = s.w;
  img.height = s.h;
  img.alt = alt;
  img.decoding = 'async';
  img.src = im.data;
  return img;
}

/**
 * Kommentaren i detaljene ved musepeker: høyst tre linjer tekst og noen små bilder, så detaljene
 * aldri dekker mye av planen. canOpen: boksen kan klikkes for å se hele kommentaren.
 */
export function commentTip(b: Box, canOpen = false): HTMLElement | null {
  const c = commentOf(b);
  if (!c) return null;
  const wrap = make('div', 'tip-comment');
  const text = c.text?.trim();
  if (text) wrap.append(make('p', 'tip-comment-text', text));
  const imgs = c.images ?? [];
  if (imgs.length) {
    const row = make('div', 'tip-thumbs');
    for (const im of imgs.slice(0, TIP_MAX_THUMBS)) row.append(thumb(im, TIP_THUMB));
    if (imgs.length > TIP_MAX_THUMBS) row.append(make('span', 'tip-more', `+${imgs.length - TIP_MAX_THUMBS}`));
    wrap.append(row);
  }
  if (canOpen) wrap.append(make('p', 'tip-open', imgs.length ? 'Klikk boksen for å se bildene større' : 'Klikk boksen for å lese alt'));
  return wrap;
}

/** Stort bilde ved siden av et element, uten å flytte noe annet. Brukes i kortet og i panelet. */
export interface Preview {
  show(im: CommentImage, beside: DOMRect, near: DOMRect): void;
  hide(): void;
}

export function createPreview(): Preview {
  const box = make('div', 'comment-preview');
  box.hidden = true;
  box.setAttribute('aria-hidden', 'true');
  document.body.append(box);
  return {
    show(im, beside, near) {
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      // På den siden av kortet (eller panelet) med mest plass
      const right = vw - beside.right - GAP * 2;
      const left = beside.left - GAP * 2;
      const room = Math.max(right, left);
      const s = fitSize(im, { w: Math.min(PREVIEW_MAX.w, room), h: Math.min(PREVIEW_MAX.h, vh - GAP * 2) });
      box.replaceChildren(thumb(im, s));
      const x = right >= left ? beside.right + GAP : beside.left - GAP - s.w;
      // Midt ut for det lille bildet, men innenfor vinduet
      const y = Math.min(Math.max(GAP, near.top + near.height / 2 - s.h / 2), vh - GAP - s.h);
      box.style.left = `${Math.round(x)}px`;
      box.style.top = `${Math.round(y)}px`;
      box.hidden = false;
    },
    hide() {
      box.hidden = true;
      box.replaceChildren();
    },
  };
}

let shared: Preview | null = null;
/** Én felles visning for kortet og panelet. */
export const commentPreview = (): Preview => (shared ??= createPreview());

/** Kortet med hele kommentaren, åpnet ved klikk på en boks. */
export interface CommentCard {
  open(b: Box, at: { x: number; y: number }): void;
  close(): void;
  readonly isOpen: boolean;
}

export function createCommentCard(preview: Preview): CommentCard {
  const card = make('div', 'comment-card');
  card.setAttribute('role', 'dialog');
  card.hidden = true;
  document.body.append(card);
  /** Bildet som er klikket, og som står fremme til det klikkes igjen. */
  let locked = -1;
  let back: HTMLElement | null = null;

  const close = () => {
    if (card.hidden) return;
    card.hidden = true;
    card.replaceChildren();
    preview.hide();
    locked = -1;
    back?.focus?.({ preventScroll: true });
    back = null;
  };

  const place = (at: { x: number; y: number }) => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let x = at.x + 12;
    let y = at.y + 12;
    if (x + w > vw - GAP) x = at.x - w - 12;
    if (y + h > vh - GAP) y = vh - GAP - h;
    card.style.left = `${Math.max(GAP, x)}px`;
    card.style.top = `${Math.max(GAP, y)}px`;
  };

  // Et klikk utenfor kortet lukker det. Esc lukker før noe annet reagerer på tasten.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!card.hidden && !card.contains(e.target as Node)) close();
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || card.hidden) return;
      e.stopImmediatePropagation();
      close();
    },
    true,
  );
  window.addEventListener('resize', close);

  return {
    get isOpen() {
      return !card.hidden;
    },
    close,
    open(b, at) {
      const c = commentOf(b);
      if (!c) return;
      back = document.activeElement as HTMLElement | null;
      locked = -1;
      preview.hide();
      const title = plainText(b.text) || 'Kommentar';
      card.setAttribute('aria-label', `Kommentar til ${title}`);
      const head = make('div', 'comment-card-head');
      const x = make('button', 'icon comment-card-close');
      x.type = 'button';
      x.title = 'Lukk (Esc)';
      x.setAttribute('aria-label', 'Lukk');
      x.append(icon('close', 'pico'));
      x.addEventListener('click', close);
      head.append(make('h2', 'comment-card-title', title), x);
      const body: Node[] = [head];
      const text = c.text?.trim();
      if (text) body.push(make('p', 'comment-card-text', text));
      const imgs = c.images ?? [];
      if (imgs.length) {
        const row = make('div', 'comment-card-thumbs');
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', 'Bilder');
        const buttons: HTMLButtonElement[] = [];
        const showAt = (i: number) => preview.show(imgs[i], card.getBoundingClientRect(), buttons[i].getBoundingClientRect());
        const settle = () => (locked >= 0 ? showAt(locked) : preview.hide());
        imgs.forEach((im, i) => {
          const btn = make('button', 'comment-thumb');
          btn.type = 'button';
          btn.setAttribute('aria-pressed', 'false');
          btn.title = 'Klikk for å la bildet stå fremme';
          btn.append(thumb(im, CARD_THUMB, `Bilde ${i + 1} av ${imgs.length}`));
          btn.addEventListener('pointerenter', () => showAt(i));
          btn.addEventListener('pointerleave', settle);
          btn.addEventListener('focus', () => showAt(i));
          btn.addEventListener('blur', settle);
          // Klikk lar bildet stå fremme, så musen kan flyttes bort fra det
          btn.addEventListener('click', () => {
            locked = locked === i ? -1 : i;
            buttons.forEach((y, j) => y.setAttribute('aria-pressed', String(j === locked)));
            settle();
          });
          buttons.push(btn);
          row.append(btn);
        });
        body.push(row, make('p', 'comment-card-hint', 'Hold musen over et bilde for å se det stort.'));
      }
      card.replaceChildren(...body);
      card.hidden = false;
      place(at);
      x.focus({ preventScroll: true });
    },
  };
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
