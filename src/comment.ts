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
  return [c.text?.trim() ? 'Tekst' : '', n ? `${n} ${n === 1 ? 'bilde' : 'bilder'}` : ''].filter(Boolean).join(' · ');
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
