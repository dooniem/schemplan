// Kommentarer på bokser: tekst og bilder som bare vises når musen holdes over boksen på skjermen.
// De tegnes aldri på arket eller i PDF-en for deling, men følger med i arbeidsfilen.
import type { Box, BoxComment, CommentImage } from './format/types';

/** Største side på et kommentarbilde i piksler. Nok til å se detaljer i mouse-over, uten å gjøre arbeidsfilen tung. */
export const COMMENT_MAX_PX = 1280;
/** Største PNG før et bilde uten gjennomsiktighet lagres som JPEG i stedet (bytes). */
export const COMMENT_PNG_LIMIT = 400_000;
/** Flest bilder i én kommentar. */
export const COMMENT_MAX_IMAGES = 6;

const DATA_URL = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

/** Kommentaren til boksen, eller null når den er tom. */
export function commentOf(b: Box): BoxComment | null {
  const c = b.comment;
  if (!c) return null;
  return c.text?.trim() || c.images?.length ? c : null;
}

export const hasComment = (b: Box) => commentOf(b) !== null;

/** Fjerner kommentaren når både teksten og bildene er borte. */
function tidy(b: Box): void {
  const c = b.comment;
  if (!c) return;
  if (!c.text) delete c.text;
  if (!c.images?.length) delete c.images;
  if (!c.text && !c.images) delete b.comment;
}

export function setCommentText(b: Box, text: string): void {
  b.comment = { ...b.comment, text };
  tidy(b);
}

/** Legger bildene til sist, så langt det er plass. Gir antallet som ble lagt til. */
export function addCommentImages(b: Box, images: CommentImage[]): number {
  const now = b.comment?.images ?? [];
  const add = images.slice(0, Math.max(0, COMMENT_MAX_IMAGES - now.length));
  if (!add.length) return 0;
  b.comment = { ...b.comment, images: [...now, ...add] };
  return add.length;
}

export function removeCommentImage(b: Box, i: number): void {
  const imgs = b.comment?.images;
  if (!imgs || i < 0 || i >= imgs.length) return;
  b.comment = { ...b.comment, images: imgs.filter((_, j) => j !== i) };
  tidy(b);
}

/** Omtrentlig størrelse på bildene i arbeidsfilen (bytes). */
export function commentBytes(images: readonly CommentImage[]): number {
  return images.reduce((n, im) => n + Math.round(((im.data.length - im.data.indexOf(',') - 1) * 3) / 4), 0);
}

/** «340 kB», «1,2 MB». */
export function formatBytes(n: number): string {
  if (n < 1_000_000) return `${Math.max(1, Math.round(n / 1000))} kB`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',')} MB`;
}

/** Oppsummeringen når delen er lukket. */
export function commentSummary(b: Box): string {
  const c = commentOf(b);
  if (!c) return 'Ingen';
  const n = c.images?.length ?? 0;
  const t = todoCount(c.text ?? '');
  return [c.text?.trim() ? 'Tekst' : '', t.total ? `${t.done} av ${t.total} gjort` : '', n ? `${n} ${n === 1 ? 'bilde' : 'bilder'}` : ''].filter(Boolean).join(' · ');
}

/** Er kommentaren gyldig i en plan som leses inn? */
export function validComment(c: unknown): c is BoxComment {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  const o = c as Record<string, unknown>;
  if (o.text !== undefined && typeof o.text !== 'string') return false;
  if (o.images === undefined) return true;
  return (
    Array.isArray(o.images) &&
    o.images.length <= COMMENT_MAX_IMAGES &&
    o.images.every((im) => {
      const i = im as Record<string, unknown> | null;
      return !!i && typeof i.data === 'string' && DATA_URL.test(i.data) && typeof i.w === 'number' && i.w > 0 && typeof i.h === 'number' && i.h > 0;
    })
  );
}

/**
 * Til JSON.stringify når planer sammenlignes: kommentarbildene erstattes med lengden og slutten,
 * så store bilder ikke gjøres om til tekst hver gang.
 */
export function withoutCommentImages(key: string, v: unknown): unknown {
  if (key !== 'comment' || !v || typeof v !== 'object') return v;
  const c = v as BoxComment;
  return { text: c.text, images: c.images?.map((im) => `${im.data.length}:${im.data.slice(-24)}`) };
}

/** Del av kommentarteksten: vanlig tekst, eller en lenke med adressen den åpner. */
export interface TextPart {
  text: string;
  href?: string;
}

/** Nettadresser i teksten: med http(s):// foran, eller som begynner med www. */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
/** Tegn som avslutter en setning heller enn adressen. */
const TRAIL_RE = /[.,;:!?'»”)\]]+$/;

/** Deler teksten i vanlig tekst og lenker. Bare http og https blir lenker. */
export function splitLinks(text: string): TextPart[] {
  const out: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    // Avsluttende tegn hører til setningen, men en parentes som åpnes i adressen hører til den
    const trail = url.match(TRAIL_RE)?.[0] ?? '';
    if (trail) {
      let keep = trail;
      while (keep.startsWith(')') && (url.slice(0, url.length - keep.length).match(/\(/g)?.length ?? 0) > (url.slice(0, url.length - keep.length).match(/\)/g)?.length ?? 0)) keep = keep.slice(1);
      url = url.slice(0, url.length - keep.length);
    }
    const i = m.index!;
    if (i > at) out.push({ text: text.slice(at, i) });
    out.push({ text: url, href: /^https?:\/\//i.test(url) ? url : `https://${url}` });
    at = i + url.length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** Linje som er et gjøremål: «[ ]» eller «[x]» først på linjen. */
const TODO_RE = /^(\s*)\[( |x|X)\][ \t]?(.*)$/;

/** En linje i kommentaren: vanlig tekst, eller et gjøremål som er gjort eller ikke. */
export interface CommentLine {
  text: string;
  todo?: { done: boolean };
}

/** Deler kommentaren i linjer, med gjøremålene merket. */
export function commentLines(text: string): CommentLine[] {
  return text.split('\n').map((line) => {
    const m = TODO_RE.exec(line);
    return m ? { text: m[3], todo: { done: m[2] !== ' ' } } : { text: line };
  });
}

/** Hvor mange gjøremål kommentaren har, og hvor mange som er gjort. */
export function todoCount(text: string): { done: number; total: number } {
  const todos = commentLines(text).filter((l) => l.todo);
  return { done: todos.filter((l) => l.todo!.done).length, total: todos.length };
}

/** Krysser av eller fjerner krysset på gjøremålet på linje `line` (talt fra 0). */
export function toggleTodo(b: Box, line: number): void {
  const text = b.comment?.text;
  if (!text) return;
  const lines = text.split('\n');
  const m = TODO_RE.exec(lines[line] ?? '');
  if (!m) return;
  lines[line] = lines[line].replace(/\[( |x|X)\]/, m[2] === ' ' ? '[x]' : '[ ]');
  setCommentText(b, lines.join('\n'));
}

/**
 * Gjør linjen markøren står på, til et gjøremål. En tom linje blir «[ ] »; en linje med tekst får
 * «[ ] » foran. Gir den nye teksten og hvor markøren skal stå.
 */
export function insertTodo(text: string, caret: number): { text: string; caret: number } {
  const start = text.lastIndexOf('\n', caret - 1) + 1;
  const end = text.indexOf('\n', caret);
  const line = text.slice(start, end < 0 ? undefined : end);
  if (TODO_RE.test(line)) {
    // Allerede et gjøremål: nytt gjøremål på linjen under
    const at = end < 0 ? text.length : end;
    const next = `${text.slice(0, at)}\n[ ] ${text.slice(at)}`;
    return { text: next, caret: at + 5 };
  }
  const next = `${text.slice(0, start)}[ ] ${text.slice(start)}`;
  return { text: next, caret: caret + 4 };
}
