// Delen «Kommentar» i panelet til en boks eller milepæl: tekst og bilder som vises når musen holdes
// over boksen. Bilder legges til med knappen, ved å lime inn i tekstfeltet eller dra dem inn i delen.
import type { Box, CommentImage } from './format/types';
import { icon, type IconName } from './ctxmenu';
import type { Fold } from './panelfold';
import { commentPreview } from './commenttip';
import { imageFiles, readImage } from './imagefile';
import { addCommentImages, COMMENT_MAX_IMAGES, COMMENT_MAX_PX, COMMENT_PNG_LIMIT, commentBytes, commentOf, commentSummary, formatBytes, insertTodo, removeCommentImage, setCommentText } from './comment';

export interface CommentKit {
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>, text?: string) => HTMLElementTagNameMap[K];
  section(title: string, fold?: Fold): HTMLElement;
  /** Tekstfelt der skriving i samme felt blir ett angresteg. */
  textField(id: string, label: string, value: string, rows: string, onInput: (v: string) => void): HTMLElement;
  btn(text: string, ico: IconName | null, onClick: () => void, title?: string, cls?: string): HTMLButtonElement;
  /** Endrer teksten mens det skrives (ett angresteg, panelet bygges ikke på nytt). */
  typing(fn: (b: Box) => void): void;
  /** Endrer boksen med id-en som ett angresteg, også om en annen boks er valgt i mellomtiden. */
  apply(id: string, fn: (b: Box) => void): void;
}

/** Leser bildefilene og gjør dem små nok for kommentaren. Filer som ikke kan leses, hoppes over. */
async function readAll(files: File[]): Promise<{ images: CommentImage[]; failed: number }> {
  const images: CommentImage[] = [];
  let failed = 0;
  for (const f of files) {
    try {
      const r = await readImage(f, { maxPx: COMMENT_MAX_PX, pngLimit: COMMENT_PNG_LIMIT });
      images.push({ data: r.data, w: r.size[0], h: r.size[1] });
    } catch {
      failed++;
    }
  }
  return { images, failed };
}

export function commentSection(kit: CommentKit, b: Box): void {
  const { el } = kit;
  // Panelet bygges på nytt: et bilde som vises stort, hører til det gamle panelet
  commentPreview().hide();
  const c = commentOf(b);
  const s = kit.section('Kommentar', { summary: commentSummary(b), changed: !!c });
  const imgs = c?.images ?? [];
  const room = COMMENT_MAX_IMAGES - imgs.length;
  const status = el('p', { class: 'hint comment-status', role: 'status' });

  const add = async (list: File[]) => {
    const files = imageFiles(list);
    if (!files.length) return;
    if (room <= 0) {
      status.textContent = `En kommentar kan ha ${COMMENT_MAX_IMAGES} bilder. Ta bort et bilde først.`;
      return;
    }
    status.textContent = 'Leser bildet …';
    const { images, failed } = await readAll(files.slice(0, room));
    if (images.length) kit.apply(b.id, (x) => addCommentImages(x, images));
    // Panelet er bygget på nytt etter endringen, så beskjeden står bare igjen når noe gikk galt
    const over = files.length - room;
    if (failed || over > 0 || !images.length)
      status.textContent = [failed ? `${failed} ${failed === 1 ? 'fil' : 'filer'} kunne ikke leses som bilde.` : '', over > 0 ? `Bare ${COMMENT_MAX_IMAGES} bilder får plass.` : ''].filter(Boolean).join(' ');
  };

  // Feltet blir høyere med flere linjer (inntil åtte), så en liste med gjøremål kan leses
  const now = c?.text ?? b.comment?.text ?? '';
  const tf = kit.textField('box-comment', 'Kommentar', now, String(Math.min(8, Math.max(3, now.split('\n').length))), (v) => kit.typing((x) => setCommentText(x, v)));
  const ta = tf.querySelector('textarea') ?? (tf as HTMLTextAreaElement);
  // Bilde på utklippstavlen limes inn i kommentaren, tekst limes inn som vanlig
  ta.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.items ?? [])].filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter((f): f is File => !!f);
    if (!imageFiles(files).length) return;
    e.preventDefault();
    void add(files);
  });
  // Gjøremål: «[ ] » først på linjen. I kortet ved klikk på boksen blir de avkrysningsbokser.
  const todo = kit.btn('Legg til gjøremål', 'check', () => {
    const r = insertTodo(ta.value, ta.selectionStart ?? ta.value.length);
    ta.focus();
    ta.value = r.text;
    ta.setSelectionRange(r.caret, r.caret);
    ta.dispatchEvent(new Event('input'));
  }, 'Setter «[ ]» foran linjen. Skriv [x] for et gjøremål som er gjort.', 'linkish');
  s.append(tf, todo, el('p', { class: 'hint' }, '[ ] først på linjen er et gjøremål, [x] er gjort. Utenfor redigering krysser du av ved å klikke boksen.'));

  if (imgs.length) {
    const list = el('ul', { class: 'comment-imgs', 'aria-label': 'Bilder i kommentaren' });
    imgs.forEach((im, i) => {
      const li = el('li', { class: 'comment-img' });
      const img = el('img', { alt: `Bilde ${i + 1}`, src: im.data }) as HTMLImageElement;
      img.decoding = 'async';
      const acts = el('div', { class: 'comment-img-acts' });
      const small = (ico: IconName, label: string, fn: () => void) => {
        const x = el('button', { type: 'button', class: 'icon', title: label, 'aria-label': `${label}, bilde ${i + 1}` });
        x.append(icon(ico, 'pico'));
        x.addEventListener('click', fn);
        return x;
      };
      acts.append(small('trash', 'Ta bort', () => kit.apply(b.id, (x) => removeCommentImage(x, i))));
      // Stort ved siden av panelet når musen holdes over bildet
      const preview = commentPreview();
      img.addEventListener('pointerenter', () => {
        const panel = li.closest('#panel') ?? li;
        preview.show(im, panel.getBoundingClientRect(), img.getBoundingClientRect());
      });
      img.addEventListener('pointerleave', () => preview.hide());
      li.append(img, acts);
      list.append(li);
    });
    s.append(list);
  }

  const file = el('input', { type: 'file', accept: 'image/png, image/jpeg, image/webp, image/gif, image/*', multiple: '', hidden: '', 'aria-hidden': 'true' }) as HTMLInputElement;
  file.addEventListener('change', () => {
    const files = [...(file.files ?? [])];
    file.value = '';
    void add(files);
  });
  const pick = kit.btn('Legg til bilde …', 'image', () => file.click(), room > 0 ? 'Velg bilder, lim inn i tekstfeltet eller dra dem hit' : `En kommentar kan ha ${COMMENT_MAX_IMAGES} bilder`, 'linkish');
  pick.disabled = room <= 0;
  s.append(pick, file, status);

  // Dra bildefiler inn i delen
  s.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    s.classList.add('drop-on');
  });
  s.addEventListener('dragleave', (e) => {
    if (!s.contains(e.relatedTarget as Node | null)) s.classList.remove('drop-on');
  });
  s.addEventListener('drop', (e) => {
    s.classList.remove('drop-on');
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    e.stopPropagation();
    void add([...e.dataTransfer.files]);
  });

  const size = imgs.length ? ` Bildene tar ${formatBytes(commentBytes(imgs))} i arbeidsfilen.` : '';
  s.append(el('p', { class: 'hint' }, `Vises når musen holdes over boksen. Kommer ikke med på arket eller i PDF for deling, men lagres i arbeidsfilen.${size}`));
}
