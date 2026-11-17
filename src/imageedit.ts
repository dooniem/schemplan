// Bilder og fritekst i redigeringen: sett inn (fildialog, utklippstavle, dra inn), velg, flytt, endre
// størrelse, roter og beskjær, fest til dato eller milepæl, og panelet og høyreklikkmenyen for dem.
// Valgt bilde får håndtak for størrelse og rotasjon. «Beskjær» gir kanthåndtak, «Rediger punkter» en mangekant.
import type { PlanFile, NoteFont, PlanImage, PlanNote } from './format/types';
import type { Layout } from './layout/layout';
import { icon, type createCtxMenu, type CtxItem, type IconName } from './ctxmenu';
import { ARROW_WIDTHS, arrowWidth } from './layout/arrow';
import { loadNoteFont, NOTE_COLORS, NOTE_MAX_PAD, notePad, NOTE_DEFAULT, NOTE_FONTS, NOTE_MAX_PT, NOTE_MIN_PT, noteFontReady, PX_PER_MM, renderNote, shownPt } from './note';
import { cropTo, frameCenter, frameCorners, frameUv, FULL, handleAt, HANDLES, keepPoint, movePoint, naturalSize, newImage, normDeg, rectPoints, resetSize, resizeBy, rotateBy, rotateTo, storeImage, toSheet, type Handle, type PlacedImage, type Pt } from './layout/image';
import { drawImage } from './render/svg';
import { createNoteArrows } from './notearrow';
import { imageFiles, readImage, type ReadImage } from './imagefile';
import { findBox, type Swatch } from './editmodel';
import { plainText } from './format/text';
import { formatLong } from './layout/dates';
import type { Back, Drag, EditorHost, Trial } from './editor';

export type ImageMode = 'none' | 'crop' | 'points';

const NS = 'http://www.w3.org/2000/svg';

/** Musepekeren for et håndtak, vridd med bildet. */
const cursorFor = (h: Handle, rotation: number) => {
  const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const i = (dirs.indexOf(h) + Math.round(rotation / 45) + 80) % 8;
  return ['ns', 'nesw', 'ew', 'nwse'][i % 4] + '-resize';
};

/** Byggeklossene til panelet og verktøyene bilderedigeringen deler med resten av editoren. */
export interface ImageEditKit {
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>, text?: string) => HTMLElementTagNameMap[K];
  calRange: (plan: PlanFile) => { start: string; end: string };
  syncTools: () => void;
  snapshot: () => void;
  commit: (fn: (plan: PlanFile) => void, nudgeKey?: string) => void;
  trial: (key: string, now: string, set: (fill: string) => void) => Trial;
  panelHead: (title: string, sub?: string, onClose?: () => void, closeLabel?: string) => void;
  section: (title: string) => HTMLElement;
  segmented: <T extends string | number>(label: string, value: T, options: ([T, string] | [T, string, IconName])[], onPick: (v: T) => void) => HTMLDivElement;
  switchRow: (label: string, on: boolean, onChange: (v: boolean) => void, title?: string) => HTMLLabelElement;
  btn: (text: string, ico: IconName | null, onClick: () => void, title?: string, cls?: string) => HTMLButtonElement;
  swatches: (current: string | null, list: Swatch[], t: Trial | ((fill: string) => void)) => HTMLDivElement;
  colorRow: (value: string, t: Trial, back?: Back | Back[]) => DocumentFragment;
  lockedRow: (text: string, button: string, title: string, onClick: () => void) => HTMLDivElement;
  textField: (id: string, label: string, value: string, rows: string, onInput: (v: string) => void) => HTMLTextAreaElement;
  buildPanel: () => void;
  overlay: () => void;
  toMm: (clientX: number, clientY: number) => { x: number; y: number };
  clamp: (v: number, lo: number, hi: number) => number;
}

/** Det bilderedigeringen får fra editoren: planen, angre, tegning og byggeklossene til panelet. */
export interface ImageEditHost {
  accent: string;
  host: EditorHost;
  sheet: HTMLElement;
  panel: HTMLElement;
  ctx: ReturnType<typeof createCtxMenu>;
  /** Alt holdt nede: ingen snapping. */
  snapOff(): boolean;
  /** Fjerner valget av bokser, lanes, overskrift og fag. */
  clearSelection(): void;
  /** Skriving pågår i et felt: endringene samles i ett angresteg. */
  typing(): boolean;
  setTyping(on: boolean): void;
  /** Tegner planen på nytt om litt, så skriving ikke tegner for hvert tegn. */
  redrawSoon(ms: number): void;
  cancelRedraw(): void;
  kit: ImageEditKit;
}

export function createImageEdit(ed: ImageEditHost) {
  const ACCENT = ed.accent;
  const { host, sheet, panel, ctx } = ed;
  /** Planen slik den er tegnet nå. */
  let layoutNow: Layout | null = null;
  let svgNow: SVGSVGElement | null = null;
  const { el, calRange, syncTools, snapshot, commit, trial, panelHead, section, segmented, switchRow, btn, swatches, colorRow, lockedRow, textField, buildPanel, overlay, toMm, clamp } = ed.kit;
  /** Valgt bilde, og om det beskjæres. Bare én ting er valgt om gangen. */
  let selectedImage: string | null = null;
  let imageMode: ImageMode = 'none';
  /** Punktet som sist ble dratt i punktbeskjæringen (Delete sletter det). */
  let activePoint = -1;
  /** Delen av tekstpanelet som er foldet ut, så den står åpen når panelet tegnes på nytt. Bare én om gangen. */
  let openGroup: string | null = null;
  const join = (parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' · ');
  /**
   * Del av panelet som foldes ut, med en kort oppsummering av valgene når den er lukket, som
   * «Formater figur» i Office. Gir innholdet.
   */
  const group = (key: string, title: string, summary: string) => {
    const d = el('details', { class: 'psec pgroup', name: 'note-groups' }) as HTMLDetailsElement;
    d.open = openGroup === key;
    const sum = el('summary');
    const head = el('span', { class: 'pg-head' });
    head.append(el('h3', {}, title), el('span', { class: 'pg-sum' }, summary));
    sum.append(icon('chevron', 'pico pg-chev'), head);
    const body = el('div', { class: 'pg-body' });
    d.append(sum, body);
    d.addEventListener('toggle', () => {
      if (d.open) openGroup = key;
      else if (openGroup === key) openGroup = null;
    });
    panel.append(d);
    return body;
  };
  // Settes inn fra fildialogen (høyreklikk), utklippstavlen (Ctrl+V) eller ved å dra en fil inn på arket.
  // Valgt bilde får håndtak for størrelse og rotasjon. «Beskjær» gir kanthåndtak, «Rediger punkter» en mangekant.
  /** Siste punkt musen var over arket, i mm. Bilder fra utklippstavlen havner der. */
  let lastPointer: Pt | null = null;
  /** Bildet slik det dras akkurat nå, før det lagres i planen. */
  let livePlaced: PlacedImage | null = null;
  let shiftNow = false;
  const imagesOf = (plan: PlanFile) => plan.plan.layout.images ?? [];
  const findImage = (plan: PlanFile, id: string) => imagesOf(plan).find((im) => im.id === id) ?? null;
  const placedOf = (id: string) => (livePlaced?.id === id ? livePlaced : layoutNow?.images.find((p) => p.id === id) ?? null);
  const noteArrows = createNoteArrows(
    {
      accent: ACCENT,
      getPlan: () => host.getPlan(),
      layout: () => layoutNow,
      svg: () => svgNow,
      findImage,
      placedOf,
      commit,
      mmPerPx: () => mmPerPx(),
      snapOff: () => ed.snapOff(),
      overlay: () => overlay(),
    },
    (plan, id) => {
      const b = findBox(plan, id);
      return `«${(b && plainText(b.text)) || (b?.resolved?.isMilestone ? 'milepæl' : 'boks')}»`;
    },
  );
  /** Dra i pilspissen til en fritekst, eller i knotten midt på streken for å kurve den. */
  const tipDrag = (id: string, bend = false): Drag | null => {
    const d = bend ? noteArrows.startBendDrag(id) : noteArrows.startTipDrag(id);
    return d && { startY: 0, startClient: 0, moved: false, move() {}, moveXY: d.moveXY, end: d.end };
  };
  const milestonePt = (id: string): Pt | null => {
    const it = layoutNow?.items.find((i) => i.id === id);
    return it?.kind === 'milestone' ? { x: it.x, y: it.y } : null;
  };
  /** Punktet bildet er festet til: milepælen, eller midten av datoen. */
  const anchorOf = (im: PlanImage): Pt | null => {
    if (im.milestone) return milestonePt(im.milestone.id);
    if (im.date) {
      const x = layoutNow?.xOfDate(im.date.day);
      return x == null ? null : { x, y: 0 };
    }
    return null;
  };
  const storePlaced = (plan: PlanFile, p: PlacedImage) => {
    const im = findImage(plan, p.id);
    if (!im || !layoutNow) return;
    storeImage(im, p, layoutNow.width, layoutNow.height, anchorOf(im));
    // Dras en fritekst større eller mindre, blir skriftstørrelsen det den ser ut som
    fitNote(im, layoutNow.width);
  };
  const imageId = () => `img${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const changeImage = (id: string, fn: (im: PlanImage, plan: PlanFile) => void) =>
    commit((pl) => {
      const im = findImage(pl, id);
      if (im) fn(im, pl);
    });
  /** Endrer bildet slik det står på arket (størrelse, rotasjon, beskjæring) og lagrer det. */
  const changePlaced = (id: string, fn: (p: PlacedImage) => PlacedImage, nudgeKey?: string) => {
    const p = placedOf(id);
    if (p) commit((pl) => storePlaced(pl, fn(p)), nudgeKey);
  };

  const clearImage = () => {
    selectedImage = null;
    imageMode = 'none';
    activePoint = -1;
  };
  const selectImage = (id: string | null, mode: ImageMode = 'none') => {
    ed.clearSelection();
    selectedImage = id;
    imageMode = id ? mode : 'none';
    activePoint = -1;
    buildPanel();
    overlay();
  };
  /** Vanlig beskjæring, punktbeskjæring eller ingen av dem. Punktene starter som det som vises nå. */
  const setImageMode = (mode: ImageMode) => {
    const id = selectedImage;
    const plan = host.getPlan();
    const im = id && plan ? findImage(plan, id) : null;
    if (!id || !im) return;
    if (mode === 'points' && !im.points) {
      const p = placedOf(id);
      if (p)
        changePlaced(id, (q) => ({ ...q, points: rectPoints(q.crop), crop: FULL }));
    }
    imageMode = imageMode === mode ? 'none' : mode;
    activePoint = -1;
    buildPanel();
    overlay();
  };

  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: '', hidden: '', 'aria-hidden': 'true' }) as HTMLInputElement;
  document.body.append(fileInput);
  /** Hvor neste bilde fra fildialogen settes inn, og eventuelt milepælene det blir symbol for. */
  let pickFor: { at: Pt | null; milestones?: string[] } = { at: null };
  const pickImage = (at: Pt | null, milestones?: string[]) => {
    pickFor = { at, milestones };
    fileInput.multiple = !milestones;
    fileInput.click();
  };
  fileInput.addEventListener('change', () => {
    const files = imageFiles(fileInput.files);
    fileInput.value = '';
    if (files.length) void insertImages(files, pickFor.at, pickFor.milestones);
  });

  /** Midten av det som vises av arket, så et bilde fra utklippstavlen havner der du ser. */
  const visibleCenter = (): Pt | null => {
    if (!svgNow) return null;
    const r = svgNow.getBoundingClientRect();
    const v = sheet.getBoundingClientRect();
    const x0 = Math.max(r.left, v.left, 0);
    const x1 = Math.min(r.right, v.right, window.innerWidth);
    const y0 = Math.max(r.top, v.top, 0);
    const y1 = Math.min(r.bottom, v.bottom, window.innerHeight);
    if (x1 <= x0 || y1 <= y0) return null;
    return toMm((x0 + x1) / 2, (y0 + y1) / 2);
  };

  /** Symbolstørrelse for en milepæl: litt større enn flagget, så bildet er lett å se. */
  const symbolSize = (id: string, px: [number, number]) => {
    const it = layoutNow?.items.find((i) => i.id === id);
    const side = it?.kind === 'milestone' ? it.size * 1.6 : 6;
    const k = side / Math.max(px[0], px[1]);
    return { w: px[0] * k, h: px[1] * k };
  };

  const insertImages = async (files: Blob[], at: Pt | null, milestones?: string[]) => {
    const L = layoutNow;
    if (!L || !host.getPlan()) return;
    const read: ReadImage[] = [];
    for (const f of files) {
      try {
        read.push(await readImage(f));
      } catch {
        host.notify(`Kunne ikke lese ${f instanceof File ? f.name : 'bildet'}. Bruk PNG, JPEG, GIF, WebP eller SVG.`);
      }
    }
    if (!read.length) return;
    const W = L.width;
    const H = L.height;
    const made: string[] = [];
    commit((pl) => {
      const list = (pl.plan.layout.images ??= []);
      if (milestones?.length) {
        // Symbol for milepælene: bytter ut et bilde milepælen alt har
        for (const ms of milestones) {
          const old = list.findIndex((x) => x.milestone?.id === ms);
          const s = symbolSize(ms, read[0].px);
          const im: PlanImage = { id: imageId(), data: read[0].data, px: read[0].px, x: 0, y: 0, w: s.w / W, h: s.h / W, rotation: 0, milestone: { id: ms, dx: 0, dy: 0 } };
          const pt = milestonePt(ms);
          if (pt) {
            im.x = pt.x / W;
            im.y = pt.y / H;
          }
          if (old >= 0) list.splice(old, 1, im);
          else list.push(im);
          made.push(im.id);
        }
        return;
      }
      const c = at ?? lastPointer ?? visibleCenter() ?? { x: W / 2, y: H / 2 };
      read.forEach((r, i) => {
        // Flere bilder samtidig legges litt forskjøvet, så alle kan ses
        const im = newImage(imageId(), r.data, r.px, { x: c.x + i * 6, y: c.y + i * 6 }, W, H);
        list.push(im);
        made.push(im.id);
      });
    });
    if (made.length) selectImage(made[made.length - 1]);
  };

  /** Ny fritekst der du høyreklikket (eller midt i det du ser), valgt med tekstfeltet klart. */
  const insertNote = (at: Pt | null) => {
    const L = layoutNow;
    if (!L || !host.getPlan()) return;
    const note: PlanNote = { ...NOTE_DEFAULT };
    const r = renderNote(note);
    const W = L.width;
    const H = L.height;
    const c = at ?? lastPointer ?? visibleCenter() ?? { x: W / 2, y: H / 2 };
    let id = '';
    commit((pl) => {
      const im: PlanImage = { id: imageId(), data: r.data, px: r.px, x: c.x / W, y: c.y / H, w: r.px[0] / PX_PER_MM / W, h: r.px[1] / PX_PER_MM / W, rotation: 0, note };
      (pl.plan.layout.images ??= []).push(im);
      id = im.id;
    });
    if (!id) return;
    selectImage(id);
    const ta = document.getElementById('note-text') as HTMLTextAreaElement | null;
    ta?.focus();
    ta?.select();
  };
  /**
   * Tegner friteksten på nytt i størrelsen den har på arket, så skriftstørrelsen og det du ser alltid
   * stemmer. Midten blir stående. Endrer ingenting når den allerede stemmer, så flytting ikke lager nye bilder.
   */
  const fitNote = (im: PlanImage, W: number, change: Partial<PlanNote> = {}) => {
    if (!im.note) return;
    const sizePt = change.sizePt ?? shownPt(im.note, im.px, im.w, W);
    const note = { ...im.note, ...change, sizePt };
    // Dras teksten større eller mindre, følger luften i rammen med, så rammen blir der den ble sluppet
    if (change.sizePt === undefined && change.pad === undefined && note.pad && sizePt !== im.note.sizePt) {
      const k = sizePt / im.note.sizePt;
      note.pad = note.pad.map((v) => Math.min(NOTE_MAX_PAD, Math.round(v * k * 10) / 10)) as [number, number];
    }
    const w = im.px[0] / PX_PER_MM / W;
    const same = !Object.keys(change).length && sizePt === im.note.sizePt;
    if (same && Math.abs(im.w - w) < 1e-9) return;
    // Bare litt ved siden av (avrunding): rett størrelsen uten å tegne på nytt
    if (same) {
      Object.assign(im, { w, h: im.px[1] / PX_PER_MM / W });
      return;
    }
    const r = renderNote(note);
    Object.assign(im, { note, data: r.data, px: r.px, w: r.px[0] / PX_PER_MM / W, h: r.px[1] / PX_PER_MM / W });
  };
  /** Endrer friteksten og tegner bildet på nytt. En ny skrift lastes først, så den ikke tegnes med en annen. */
  const setNote = (id: string, change: Partial<PlanNote>, typing = false, waited = false) => {
    const plan = host.getPlan();
    const L = layoutNow;
    const im = plan ? findImage(plan, id) : null;
    if (!plan || !L || !im?.note) return;
    const next = { ...im.note, ...change };
    if (!waited && !noteFontReady(next)) {
      void loadNoteFont(next).then(() => setNote(id, change, typing, true));
      return;
    }
    if (!typing || !ed.typing()) snapshot();
    if (typing) ed.setTyping(true);
    fitNote(im, L.width, change);
    ed.cancelRedraw();
    if (typing) ed.redrawSoon(120);
    else {
      host.redraw();
      buildPanel();
    }
    syncTools();
  };

  /** Bruker et bilde som allerede er symbol for en milepæl på andre milepæler: samme bilde, størrelse, rotasjon og beskjæring. */
  const copySymbol = (fromId: string, milestones: string[]) => {
    const plan = host.getPlan();
    const src = plan ? findImage(plan, fromId) : null;
    if (!src?.milestone) return;
    const made: string[] = [];
    commit((pl) => {
      const list = (pl.plan.layout.images ??= []);
      for (const ms of milestones) {
        if (ms === src.milestone!.id) continue;
        const im: PlanImage = { ...structuredClone(src), id: imageId(), milestone: { ...src.milestone!, id: ms } };
        const old = list.findIndex((x) => x.milestone?.id === ms);
        if (old >= 0) list.splice(old, 1, im);
        else list.push(im);
        made.push(im.id);
      }
    });
    if (made.length === 1) selectImage(made[0]);
  };

  /** Bilder som er symbol for en milepæl, ett per ulikt bilde, med navnet på milepælen. */
  const symbolChoices = (plan: PlanFile) => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const im of imagesOf(plan)) {
      if (!im.milestone) continue;
      const key = `${im.data.length}:${im.data.slice(-40)}:${im.w}:${im.h}:${im.rotation}:${JSON.stringify(im.crop ?? null)}:${JSON.stringify(im.points ?? null)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const b = findBox(plan, im.milestone.id);
      out.push({ id: im.id, name: b ? plainText(b.text) || 'Milepæl' : 'Milepæl' });
    }
    return out;
  };

  const removeImage = (id: string) => {
    if (selectedImage === id) clearImage();
    commit((pl) => {
      pl.plan.layout.images = imagesOf(pl).filter((im) => im.id !== id);
      if (!pl.plan.layout.images.length) delete pl.plan.layout.images;
    });
    overlay();
  };
  const duplicateImage = (id: string) => {
    const plan = host.getPlan();
    const src = plan ? findImage(plan, id) : null;
    if (!src || !layoutNow) return;
    const copy: PlanImage = structuredClone(src);
    copy.id = imageId();
    // Kopien står litt nedenfor og til høyre, og er ikke festet
    const p = placedOf(id);
    if (p) {
      copy.x = (p.cx + 5) / layoutNow.width;
      copy.y = (p.cy + 5) / layoutNow.height;
    }
    delete copy.milestone;
    delete copy.date;
    commit((pl) => (pl.plan.layout.images ??= []).push(copy));
    selectImage(copy.id);
  };
  const moveImageInOrder = (id: string, front: boolean) =>
    commit((pl) => {
      const list = imagesOf(pl);
      const i = list.findIndex((im) => im.id === id);
      if (i < 0) return;
      const [im] = list.splice(i, 1);
      if (front) list.push(im);
      else list.unshift(im);
    });
  /** Fest til datoen midt i det synlige, uten at bildet flytter seg. Eller løsne, også fra en milepæl. */
  const pinImage = (id: string, on: boolean) => {
    const p = placedOf(id);
    if (!p || !layoutNow) return;
    const L = layoutNow;
    const c = frameCenter(p);
    changeImage(id, (im) => {
      storeImage(im, p, L.width, L.height);
      delete im.milestone;
      if (!on) {
        delete im.date;
        return;
      }
      const day = L.dateAt(clamp(c.x, L.plot.x0, L.plot.x1 - 1e-6));
      const x = L.xOfDate(day) ?? c.x;
      im.date = { day, dx: Math.round(((c.x - x) / L.width) * 10000) / 10000 };
    });
  };
  /** Ny dato for et festet bilde: det flyttes sidelengs til datoen. */
  const setImageDate = (id: string, day: string) =>
    changeImage(id, (im) => {
      im.date = { day, dx: 0 };
    });

  /** Viser bildet slik det dras, uten å tegne hele planen på nytt. */
  const showLive = (p: PlacedImage) => {
    livePlaced = p;
    const g = svgNow?.querySelector(`g.images > g[data-image="${CSS.escape(p.id)}"]`);
    if (g) {
      const fresh = drawImage(p, g.parentElement!);
      g.replaceWith(fresh);
    }
    noteArrows.redraw(p.id);
    overlay();
  };
  /** Festet til dato: midten av det synlige blir stående på samme x. */
  const keepX = (p: PlacedImage, x: number): PlacedImage => (p.date ? { ...p, cx: p.cx + x - frameCenter(p).x } : p);
  /** Millimeter per skjermpunkt, så håndtakene er like store uansett zoom. */
  const mmPerPx = () => 1 / (svgNow?.getScreenCTM()?.a || 1);

  const imageDrag = (id: string, update: (p0: PlacedImage, q: Pt, from: Pt) => PlacedImage, onEnd?: () => void): Drag | null => {
    const p0 = placedOf(id);
    if (!p0) return null;
    let from: Pt | null = null;
    let last: PlacedImage | null = null;
    return {
      startY: 0,
      startClient: 0,
      moved: false,
      move() {},
      moveXY(x, y) {
        from ??= { x, y };
        last = update(p0, { x, y }, from);
        showLive(last);
      },
      end() {
        livePlaced = null;
        if (last) {
          const p = last;
          commit((pl) => storePlaced(pl, p));
        } else overlay();
        onEnd?.();
      },
    };
  };
  const startImageMove = (id: string) =>
    imageDrag(id, (p0, q, from) => ({ ...p0, cx: p0.date ? p0.cx : p0.cx + q.x - from.x, cy: p0.cy + q.y - from.y }));

  const startImageHandle = (t: Element): Drag | null => {
    const id = selectedImage;
    if (!id) return null;
    const p0 = placedOf(id);
    if (!p0) return null;
    const x0 = frameCenter(p0).x;
    const h = t.getAttribute('data-h') as Handle | null;
    if (t.classList.contains('img-rot')) return imageDrag(id, (p, q) => keepX(rotateTo(p, q, shiftNow), x0));
    if (t.classList.contains('img-size') && h) {
      const plan = host.getPlan();
      const im = plan ? findImage(plan, id) : null;
      const note = im?.note;
      if (!note || !im) return imageDrag(id, (p, q) => keepX(resizeBy(p, h, q, shiftNow), x0));
      // Fritekst beholder formen, og feltet viser skriftstørrelsen den får
      const field = document.getElementById('note-size') as HTMLInputElement | null;
      const W = layoutNow?.width ?? 1;
      return imageDrag(id, (p, q) => {
        const r = keepX(resizeBy(p, h, q, false), x0);
        if (field) field.value = String(shownPt(note, im.px, r.w / W, W));
        return r;
      });
    }
    if (t.classList.contains('img-crop') && h) return imageDrag(id, (p, q) => ({ ...p, crop: cropTo(p, h, q) }));
    const i = Number(t.getAttribute('data-i'));
    if (t.classList.contains('img-pt') && p0.points) {
      activePoint = i;
      return imageDrag(id, (p, q) => {
        const pts = [...p.points!];
        pts[i] = movePoint(p, q, ed.snapOff() ? 0 : 6 * mmPerPx());
        return { ...p, points: pts };
      });
    }
    if (t.classList.contains('img-mid') && p0.points) {
      // Nytt punkt midt på kanten, som dras med en gang
      activePoint = i + 1;
      return imageDrag(id, (p, q) => {
        const pts = [...p.points!];
        pts.splice(i + 1, 0, movePoint(p, q, ed.snapOff() ? 0 : 6 * mmPerPx()));
        return { ...p, points: pts };
      });
    }
    return null;
  };
  const deletePoint = (i: number) => {
    const id = selectedImage;
    const p = id ? placedOf(id) : null;
    if (!id || !p?.points || p.points.length <= 3) return;
    activePoint = -1;
    changePlaced(id, (q) => ({ ...q, points: q.points!.filter((_, k) => k !== i) }));
  };

  /** Rammen, håndtakene og beskjæringen for valgt bilde. Tegnes i markeringslaget, kommer ikke med i PDF. */
  const imageOverlay = (g: SVGGElement) => {
    const p = selectedImage ? placedOf(selectedImage) : null;
    if (!p || !layoutNow) return;
    const k = mmPerPx();
    const add = (tag: string, attrs: Record<string, string | number>) => {
      const e = document.createElementNS(NS, tag);
      for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, String(v));
      g.append(e);
      return e;
    };
    const poly = (pts: Pt[]) => pts.map((q) => `${q.x},${q.y}`).join(' ');
    const square = (q: Pt, size: number, attrs: Record<string, string | number>) =>
      add('rect', { x: q.x - size / 2, y: q.y - size / 2, width: size, height: size, transform: `rotate(${p.rotation} ${q.x} ${q.y})`, 'vector-effect': 'non-scaling-stroke', 'stroke-width': 1, 'pointer-events': 'all', ...attrs });
    const at = (u: number, v: number) => toSheet(p, u, v);
    if (imageMode !== 'none') {
      // Hele bildet svakt bak, og det som blir igjen i full styrke oppå
      drawImage(p, g, '-ghost', { full: true, opacity: 0.35 });
      drawImage(p, g, '-sel');
      add('polygon', { points: poly([at(0, 0), at(1, 0), at(1, 1), at(0, 1)]), fill: 'none', stroke: '#7F7F7F', 'stroke-width': 1, 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke' });
    }
    if (imageMode === 'crop') {
      const [u0, v0, u1, v1] = p.crop;
      add('polygon', { points: poly([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]), fill: 'none', stroke: '#000000', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
      for (const h of HANDLES) {
        const [hu, hv] = handleAt(h);
        const q = at(u0 + hu * (u1 - u0), v0 + hv * (v1 - v0));
        // Svarte vinkler i hjørnene og streker på kantene, som beskjæring i Office
        const corner = hu !== 0.5 && hv !== 0.5;
        const len = (corner ? 14 : 18) * k;
        const thick = 5 * k;
        const sx = hu === 0 ? 1 : hu === 1 ? -1 : 0;
        const sy = hv === 0 ? 1 : hv === 1 ? -1 : 0;
        const tr = `rotate(${p.rotation} ${q.x} ${q.y})`;
        const mk = (x: number, y: number, w: number, hh: number) => add('rect', { x, y, width: w, height: hh, transform: tr, fill: '#000000', stroke: '#FFFFFF', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
        if (corner) {
          mk(sx > 0 ? q.x : q.x - len, sy > 0 ? q.y : q.y - thick, len, thick);
          mk(sx > 0 ? q.x : q.x - thick, sy > 0 ? q.y : q.y - len, thick, len);
        } else if (sx) mk(sx > 0 ? q.x : q.x - thick, q.y - len / 2, thick, len);
        else mk(q.x - len / 2, sy > 0 ? q.y : q.y - thick, len, thick);
        square(q, 22 * k, { class: 'edit-handle img-crop', 'data-h': h, fill: 'transparent', stroke: 'none', cursor: cursorFor(h, p.rotation) });
      }
      return;
    }
    if (imageMode === 'points' && p.points) {
      const pts = p.points.map(([u, v]) => at(u, v));
      add('polygon', { points: poly(pts), fill: 'none', stroke: '#D0021B', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' });
      pts.forEach((q, i) => {
        const n = pts[(i + 1) % pts.length];
        square({ x: (q.x + n.x) / 2, y: (q.y + n.y) / 2 }, 7 * k, { class: 'edit-handle img-mid', 'data-i': i, fill: '#FFFFFF', stroke: '#000000', cursor: 'copy' });
      });
      pts.forEach((q, i) => square(q, 8 * k, { class: 'edit-handle img-pt', 'data-i': i, fill: i === activePoint ? ACCENT : '#000000', stroke: '#FFFFFF', cursor: 'move' }));
      return;
    }
    const c = frameCorners(p);
    add('polygon', { points: poly(c), fill: 'none', stroke: ACCENT, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' });
    // Hva bildet er festet til: stiplet strek til milepælen, eller ned til datoen
    const fc = frameCenter(p);
    const im = host.getPlan() ? findImage(host.getPlan()!, p.id) : null;
    const anchor = im ? anchorOf(im) : null;
    if (im?.milestone && anchor)
      add('line', { x1: anchor.x, y1: anchor.y, x2: fc.x, y2: fc.y, stroke: ACCENT, 'stroke-width': 1, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' });
    if (im?.date && anchor)
      add('line', { x1: anchor.x, y1: layoutNow.plot.y0, x2: anchor.x, y2: layoutNow.plot.y1, stroke: ACCENT, 'stroke-width': 1, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' });
    const f = frameUv(p.crop, p.points);
    // Fritekst skaleres bare i hjørnene, så teksten ikke strekkes
    for (const h of im?.note ? HANDLES.filter((x) => x.length === 2) : HANDLES) {
      const [hu, hv] = handleAt(h);
      const q = at(f[0] + hu * (f[2] - f[0]), f[1] + hv * (f[3] - f[1]));
      square(q, 9 * k, { class: 'edit-handle img-size', 'data-h': h, fill: '#FFFFFF', stroke: ACCENT, cursor: cursorFor(h, p.rotation) });
    }
    // Rund knott over rammen for å rotere
    const top = at((f[0] + f[2]) / 2, f[1]);
    const up = { x: top.x - (fc.x - top.x), y: top.y - (fc.y - top.y) };
    const dist = Math.hypot(up.x - top.x, up.y - top.y) || 1;
    const knob = { x: top.x + ((up.x - top.x) / dist) * 22 * k, y: top.y + ((up.y - top.y) / dist) * 22 * k };
    add('line', { x1: top.x, y1: top.y, x2: knob.x, y2: knob.y, stroke: ACCENT, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
    const rc = add('circle', { cx: knob.x, cy: knob.y, r: 6 * k, fill: '#FFFFFF', stroke: ACCENT, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', class: 'edit-handle img-rot', 'pointer-events': 'all', cursor: 'grab' });
    rc.append(Object.assign(document.createElementNS(NS, 'title'), { textContent: 'Dra for å rotere. Shift: trinn på 15°.' }));
    if (im?.note) noteArrows.draw(g, im);
  };

  // ---- Panelet ----
  const buildImagePanel = (plan: PlanFile, im: PlanImage) => {
    const p = placedOf(im.id);
    const ms = im.milestone ? findBox(plan, im.milestone.id) : null;
    const where = ms ? `Symbol for «${plainText(ms.text) || 'milepæl'}»` : im.date ? `Festet til ${formatLong(im.date.day)}` : 'Fritt på arket';
    panelHead(im.note ? 'Tekst' : 'Bilde', im.note ? where : `${im.px[0]} × ${im.px[1]} px · ${where}`);
    const cm = (mm: number) => Math.round(mm) / 10;
    /** Tallfelt med navnet over, som datofeltene. */
    const numField = (label: string, value: number, step: number, onSet: (v: number) => void, id?: string) => {
      const lab = el('label', {}, label);
      const inp = el('input', { type: 'number', step: String(step), value: String(value), inputmode: 'decimal', ...(id ? { id } : {}) }) as HTMLInputElement;
      inp.addEventListener('change', () => {
        const v = Number(inp.value.replace(',', '.'));
        if (Number.isFinite(v)) onSet(v);
      });
      lab.append(inp);
      return lab;
    };
    const nb1 = (v: number) => v.toLocaleString('nb-NO', { maximumFractionDigits: 1 });
    const fwOf = (q: PlacedImage) => {
      const f = frameUv(q.crop, q.points);
      return (f[2] - f[0]) * q.w;
    };
    const fhOf = (q: PlacedImage) => {
      const f = frameUv(q.crop, q.points);
      return (f[3] - f[1]) * q.h;
    };
    /** Fritekst: delene av panelet kan foldes sammen, så panelet ikke blir for høyt. Bilder har vanlige deler. */
    const block = (key: string, title: string, summary: string) => (im.note ? group(key, title, summary) : section(title));

    if (im.note) {
      const sn = section('Tekst');
      const n = im.note;
      sn.append(textField('note-text', 'Tekst', n.text, '3', (v) => setNote(im.id, { text: v }, true)));
      const row = el('div', { class: 'row dates' });
      // Viser størrelsen teksten har på arket, også i eldre filer der den er dratt uten å tegnes på nytt
      const pt = layoutNow ? shownPt(n, im.px, im.w, layoutNow.width) : n.sizePt;
      row.append(numField('Størrelse, pt', pt, 1, (v) => v >= NOTE_MIN_PT && v <= NOTE_MAX_PT && setNote(im.id, { sizePt: v }), 'note-size'));
      sn.append(row);
      sn.append(el('p', { class: 'hint' }, 'Enter gir ny linje. Dra i et hjørne for å endre størrelsen; skriftstørrelsen følger med.'));
      // Skriften lastes nå, så den er klar hvis teksten dras større eller mindre
      if (!noteFontReady(n)) void loadNoteFont(n);

      const fontName = NOTE_FONTS.find(([k]) => k === (n.font ?? ''))?.[1].split(' (')[0] ?? 'Carlito';
      const colorName = (hex: string | undefined) => NOTE_COLORS.find(([c]) => c.toUpperCase() === (hex ?? '#000000').toUpperCase())?.[1] ?? 'Egen farge';
      const sf = group('skrift', 'Skrift', join([fontName, n.bold && 'Fet', n.italic && 'Kursiv', n.underline && 'Understreket', colorName(n.color), n.align === 'center' ? 'Midtstilt' : n.align === 'right' ? 'Høyrejustert' : '']));
      const fontWrap = el('label', { class: 'prop prop-inline' });
      fontWrap.append(el('span', { class: 'prop-label' }, 'Skrift'));
      const fontSel = el('select', { id: 'note-font' }) as HTMLSelectElement;
      for (const [key, name, css] of NOTE_FONTS) {
        const o = el('option', { value: key }, name) as HTMLOptionElement;
        o.style.fontFamily = css;
        o.selected = key === (n.font ?? '');
        fontSel.append(o);
      }
      fontSel.addEventListener('change', () => setNote(im.id, { font: (fontSel.value || undefined) as NoteFont | undefined }));
      fontWrap.append(fontSel);
      sf.append(fontWrap);
      // Fet, kursiv og understreket kan kombineres, så de er av/på-knapper hver for seg
      const styleWrap = el('div', { class: 'prop prop-inline' });
      styleWrap.append(el('span', { class: 'prop-label' }, 'Stil'));
      const styles = el('div', { class: 'group note-style', role: 'group', 'aria-label': 'Stil' });
      for (const [key, label, title] of [['bold', 'F', 'Fet'], ['italic', 'K', 'Kursiv'], ['underline', 'U', 'Understreket']] as const) {
        const b = el('button', { type: 'button', title, 'aria-label': title, 'aria-pressed': String(!!n[key]), class: `ns-${key}` }, label);
        b.addEventListener('click', () => setNote(im.id, { [key]: !n[key] }));
        styles.append(b);
      }
      styleWrap.append(styles);
      sf.append(styleWrap);
      sf.append(
        segmented<'left' | 'center' | 'right'>('Justering', n.align ?? 'left', [['left', 'Venstre'], ['center', 'Midt'], ['right', 'Høyre']], (v) =>
          setNote(im.id, { align: v === 'left' ? undefined : v }),
        ),
      );
      const color = (n.color ?? '#000000').toUpperCase();
      const tc = trial(`note:${im.id}`, color, (fill) => setNote(im.id, { color: fill === '#000000' ? undefined : fill }));
      const colorWrap = el('div', { class: 'prop' });
      colorWrap.append(el('span', { class: 'prop-label' }, 'Farge'), swatches(color, NOTE_COLORS, tc), colorRow(color, tc));
      sf.append(colorWrap);
      sf.append(el('p', { class: 'hint' }, 'Justeringen gjelder når teksten har flere linjer.'));

      const mm = (v: number) => Math.round(v * 10) / 10;
      const [px, py] = notePad(n);
      const nb = (v: number) => v.toLocaleString('nb-NO', { maximumFractionDigits: 1 });
      const sr = group('ramme', 'Ramme', n.frame ? `Hvit med ramme · luft ${nb(mm(px))} × ${nb(mm(py))} mm` : 'Av');
      sr.append(switchRow('Hvit bakgrunn med ramme', !!n.frame, (v) => setNote(im.id, { frame: v })));
      if (n.frame) {
        // Luft inni rammen: sideveis og opp/ned hver for seg, så teksten kan stå løst i en stor ramme
        const setPad = (i: 0 | 1, v: number) => {
          if (!(v >= 0 && v <= NOTE_MAX_PAD)) return;
          const pad: [number, number] = [mm(px), mm(py)];
          pad[i] = mm(v);
          setNote(im.id, { pad });
        };
        const padRow = el('div', { class: 'row dates' });
        padRow.append(numField('Luft sideveis, mm', mm(px), 0.5, (v) => setPad(0, v), 'note-pad-x'), numField('Luft opp/ned, mm', mm(py), 0.5, (v) => setPad(1, v), 'note-pad-y'));
        sr.append(padRow);
        if (n.pad) sr.append(lockedRow('Egen luft i rammen', 'Standard', 'En halv skrifthøyde på alle sider', () => setNote(im.id, { pad: undefined })));
      }

      const a = n.arrow;
      const to = a ? noteArrows.targetOf(plan, im) : null;
      const autoPt = Math.round(((arrowWidth(n.sizePt) * 72) / 25.4) * 4) / 4;
      const widthPt = a?.width ?? autoPt;
      const nb2 = (v: number) => v.toLocaleString('nb-NO', { maximumFractionDigits: 2 });
      const sa = group('pil', 'Pil', a ? join([to ? `Til ${to}` : 'Fri spiss', `${nb2(widthPt)} pt`, a.bend ? 'Kurvet' : '', a.color ? colorName(a.color) : '']) : 'Av');
      sa.append(switchRow('Pil fra teksten', !!a, (v) => {
        openGroup = 'pil';
        noteArrows.toggle(im.id, v);
      }, 'En strek med pilspiss fra kanten av teksten, som kan peke hvor som helst'));
      if (a) {
        if (to) sa.append(lockedRow(`Peker på ${to}`, 'Løsne', 'Pilspissen blir stående der den er, og følger ikke boksen lenger', () => noteArrows.detach(im.id)));
        // Tykkelse: som i Office, pluss «som teksten», som følger skriftstørrelsen
        const wWrap = el('label', { class: 'prop prop-inline' });
        wWrap.append(el('span', { class: 'prop-label' }, 'Tykkelse'));
        const wSel = el('select', { id: 'arrow-width' }) as HTMLSelectElement;
        const opt = (value: string, text: string, on: boolean) => {
          const o = el('option', { value }, text) as HTMLOptionElement;
          o.selected = on;
          wSel.append(o);
        };
        opt('', `Etter teksten (${nb2(autoPt)} pt)`, a.width === undefined);
        const widths = a.width !== undefined && !ARROW_WIDTHS.includes(a.width) ? [...ARROW_WIDTHS, a.width].sort((x, y) => x - y) : ARROW_WIDTHS;
        for (const w of widths) opt(String(w), `${nb2(w)} pt`, a.width === w);
        wSel.addEventListener('change', () => noteArrows.setStyle(im.id, { width: wSel.value ? Number(wSel.value) : undefined }));
        wWrap.append(wSel);
        sa.append(wWrap);
        sa.append(segmented<'small' | 'medium' | 'large'>('Pilspiss', a.head ?? 'medium', [['small', 'Liten'], ['medium', 'Middels'], ['large', 'Stor']], (v) => noteArrows.setStyle(im.id, { head: v === 'medium' ? undefined : v })));
        sa.append(segmented<'straight' | 'curved'>('Strek', a.bend ? 'curved' : 'straight', [['straight', 'Rett'], ['curved', 'Kurvet']], (v) => {
          if (v === 'straight') noteArrows.setStyle(im.id, { bend: undefined });
          else if (!a.bend) noteArrows.setStyle(im.id, { bend: 0.25 });
        }));
        const ac = (a.color ?? n.color ?? '#000000').toUpperCase();
        const tca = trial(`arrow:${im.id}`, ac, (fill) => noteArrows.setStyle(im.id, { color: fill.toUpperCase() === (n.color ?? '#000000').toUpperCase() ? undefined : fill }));
        const acWrap = el('div', { class: 'prop' });
        acWrap.append(el('span', { class: 'prop-label' }, 'Farge'), swatches(ac, NOTE_COLORS, tca), colorRow(ac, tca));
        sa.append(acWrap);
        if (a.color) sa.append(lockedRow('Egen farge på pilen', 'Som teksten', 'Pilen får samme farge som teksten igjen', () => noteArrows.setStyle(im.id, { color: undefined })));
        sa.append(el('p', { class: 'hint' }, to
          ? 'Pilen følger boksen når planen endres. Dra den runde knotten på spissen for å peke et annet sted, og ruten midt på streken for å kurve den.'
          : 'Dra den runde knotten på spissen dit pilen skal peke. Slipper du den på en boks eller milepæl, følger pilen den; hold Alt for å la være. Dra ruten midt på streken for å kurve den.'));
      }
    }
    const ss = block('str', 'Størrelse og rotasjon', p ? `${nb1(cm(fwOf(p)))} × ${nb1(cm(fhOf(p)))} cm · ${nb1(Math.round(p.rotation * 10) / 10)}°` : '');
    if (p) {
      const f = frameUv(p.crop, p.points);
      const fw = (f[2] - f[0]) * p.w;
      const fh = (f[3] - f[1]) * p.h;
      // Bredde og høyde gjelder det som vises; formen beholdes
      const scaleTo = (k: number) => changePlaced(im.id, (q) => keepX(keepPoint({ ...q, w: q.w * k, h: q.h * k }, q, [(f[0] + f[2]) / 2, (f[1] + f[3]) / 2]), frameCenter(q).x));
      const fields = el('div', { class: 'row dates' });
      fields.append(
        numField('Bredde, cm', cm(fw), 0.1, (v) => v > 0 && scaleTo((v * 10) / fw), 'image-width'),
        numField('Høyde, cm', cm(fh), 0.1, (v) => v > 0 && scaleTo((v * 10) / fh)),
        numField('Rotasjon, °', Math.round(p.rotation * 10) / 10, 1, (v) => changePlaced(im.id, (q) => keepX(rotateBy(q, normDeg(v) - q.rotation), frameCenter(q).x))),
      );
      const row = el('div', { class: 'row img-actions' });
      const nat = naturalSize(im.px, layoutNow!.width, layoutNow!.height);
      const natBtn = btn('Opprinnelig størrelse', 'resize', () => changePlaced(im.id, (q) => keepX(resetSize(q, im.px, layoutNow!.width, layoutNow!.height), frameCenter(q).x)), 'Bildets egen størrelse og form, med midten på samme sted. Rotasjon og beskjæring beholdes.', 'button small');
      natBtn.disabled = Math.abs(p.w - nat.w) < 0.05 && Math.abs(p.h - nat.h) < 0.05;
      const rl = btn('', 'rotateLeft', () => changePlaced(im.id, (q) => keepX(rotateBy(q, -90), frameCenter(q).x)), 'Roter 90° mot klokken', 'button small icon-only');
      const rr = btn('', 'rotate', () => changePlaced(im.id, (q) => keepX(rotateBy(q, 90), frameCenter(q).x)), 'Roter 90° med klokken', 'button small icon-only');
      rl.setAttribute('aria-label', 'Roter 90° mot klokken');
      rr.setAttribute('aria-label', 'Roter 90° med klokken');
      row.append(rl, rr, ...(im.note ? [] : [natBtn]));
      ss.append(fields, row, el('p', { class: 'hint' }, im.note ? 'Dra i den runde knotten for å rotere; Shift gir trinn på 15°.' : 'Dra i hjørnene for å endre størrelsen; Shift gir fri form. Dra i den runde knotten for å rotere; Shift gir trinn på 15°.'));
    }

    // Fritekst beskjæres ikke
    if (!im.note) {
      const sc = section('Beskjæring');
      sc.append(
        segmented<ImageMode>('Verktøy', imageMode, [['none', 'Av'], ['crop', 'Kanter'], ['points', 'Punkter']], (v) => setImageMode(v === 'none' ? imageMode : v)),
      );
      if (im.crop || im.points)
        sc.append(lockedRow(im.points ? 'Beskåret langs punkter' : 'Beskåret', 'Vis hele', 'Fjern beskjæringen og vis hele bildet', () => {
          imageMode = 'none';
          changeImage(im.id, (x) => {
            delete x.crop;
            delete x.points;
          });
        }));
      sc.append(
        el(
          'p',
          { class: 'hint' },
          imageMode === 'crop'
            ? 'Dra i de svarte vinklene og strekene. Enter eller Esc når du er ferdig.'
            : imageMode === 'points'
              ? 'Dra de svarte punktene. Dra et hvitt punkt midt på en kant for å lage et nytt. Ctrl-klikk eller høyreklikk et punkt for å slette det. Punktene fanges av bildets kanter; hold Alt for å dra fritt. Enter eller Esc når du er ferdig.'
              : 'Kanter skjærer bort rett inn fra hver side. Punkter former en mangekant, som «Rediger punkt» i PowerPoint. De kan brukes sammen. Dobbeltklikk bildet for å beskjære kantene.',
        ),
      );
    }

    const sp = block('plass', 'Plassering', where);
    if (im.milestone) {
      sp.append(lockedRow('Følger milepælen', 'Løsne', 'Bildet blir stående der det er, og milepælen får sitt eget symbol igjen', () => pinImage(im.id, false)));
      const others = layoutNow?.items.filter((it) => it.kind === 'milestone' && it.id !== im.milestone!.id) ?? [];
      sp.append(el('p', { class: 'hint' }, `Dra bildet for å flytte milepælen opp eller ned. Hold Alt mens du drar, eller bruk piltastene, for å flytte bare bildet. Kopierer du milepælen, får kopien samme bilde.${others.length ? ' Høyreklikk en annen milepæl og velg «Bruk samme bilde» for å bruke bildet der også.' : ''}`));
    } else {
      sp.append(switchRow('Fest til dato', !!im.date, (v) => pinImage(im.id, v), 'Bildet følger datoen når kalenderen endres, og flyttes bare opp og ned'));
      if (im.date) {
        const wrap = el('label', { class: 'prop prop-inline' });
        wrap.append(el('span', { class: 'prop-label' }, 'Dato'));
        const d = el('input', { type: 'date', value: im.date.day, min: calRange(plan).start, max: calRange(plan).end }) as HTMLInputElement;
        d.addEventListener('change', () => d.value && setImageDate(im.id, d.value));
        wrap.append(d);
        sp.append(wrap);
      }
      sp.append(el('p', { class: 'hint' }, im.date ? 'Midten av bildet står på datoen. Dra bildet opp eller ned; løsne det for å flytte sidelengs.' : 'Dra bildet hvor du vil. Fest det til en dato for at det skal følge tidslinjen.'));
    }
    if (imagesOf(plan).length > 1) {
      const row = el('div', { class: 'row img-actions' });
      row.append(btn('Fremst', 'front', () => moveImageInOrder(im.id, true), 'Legg bildet over de andre bildene', 'button small'), btn('Bakerst', 'front', () => moveImageInOrder(im.id, false), 'Legg bildet under de andre bildene', 'button small'));
      sp.append(row);
    }

    const foot = el('div', { class: 'panel-foot' });
    const reset = im.note
      ? btn('Tilbakestill', 'undo', () => {
          const L = layoutNow;
          if (!L) return;
          commit((pl) => {
            const x = findImage(pl, im.id);
            if (!x) return;
            x.rotation = 0;
            fitNote(x, L.width, { sizePt: NOTE_DEFAULT.sizePt });
          });
        }, `Standard skriftstørrelse (${NOTE_DEFAULT.sizePt} pt), uten rotasjon. Teksten og midten blir stående.`, 'button push')
      : btn('Tilbakestill', 'undo', () => {
          imageMode = 'none';
          const q = placedOf(im.id);
          if (!q) return;
          changePlaced(im.id, (x) => keepX(resetSize({ ...x, rotation: 0, crop: FULL, points: null }, im.px, layoutNow!.width, layoutNow!.height), frameCenter(x).x));
        }, 'Opprinnelig størrelse, uten rotasjon og beskjæring', 'button push');
    reset.disabled = im.note
      ? !im.rotation && !!layoutNow && shownPt(im.note, im.px, im.w, layoutNow.width) === NOTE_DEFAULT.sizePt
      : !!p && !im.crop && !im.points && !im.rotation && (() => {
          const n = naturalSize(im.px, layoutNow!.width, layoutNow!.height);
          return Math.abs(p.w - n.w) < 0.05 && Math.abs(p.h - n.h) < 0.05;
        })();
    foot.append(
      btn('Dupliser', 'copy', () => duplicateImage(im.id), 'Lag en kopi (Ctrl+D)'),
      btn('Slett', 'trash', () => removeImage(im.id), 'Slett bildet (Delete)'),
      reset,
    );
    panel.append(foot);
  };

  /** Menyen for et bilde. */
  const imageMenu = (e: MouseEvent, id: string) => {
    const plan = host.getPlan();
    const im = plan ? findImage(plan, id) : null;
    const p = placedOf(id);
    if (!plan || !im || !p) return;
    if (selectedImage !== id) selectImage(id);
    const ms = im.milestone ? findBox(plan, im.milestone.id) : null;
    const nat = naturalSize(im.px, layoutNow!.width, layoutNow!.height);
    const x0 = frameCenter(p).x;
    ctx.open(e.clientX, e.clientY, 'Bilde', [
      {
        heading: 'Beskjæring',
        items: [
          { label: 'Beskjær', icon: 'crop', checked: imageMode === 'crop' ? true : undefined, hint: 'Svarte kanter du drar inn for å skjære bort, som i Office. Enter når du er ferdig.', onSelect: () => setImageMode('crop') },
          { label: 'Rediger punkter', icon: 'points', checked: imageMode === 'points' ? true : undefined, hint: 'Beskjær langs en mangekant: dra punktene, dra et hvitt punkt for å lage et nytt.', onSelect: () => setImageMode('points') },
          { label: 'Fjern beskjæring', icon: 'undo', disabled: !im.crop && !im.points, hint: im.crop || im.points ? 'Viser hele bildet igjen.' : 'Bildet er ikke beskåret.', onSelect: () => changeImage(id, (x) => { delete x.crop; delete x.points; }) },
        ],
      },
      {
        items: [
...(im.note
            ? [{ label: 'Standard skriftstørrelse', icon: 'resize' as const, disabled: shownPt(im.note, im.px, im.w, layoutNow!.width) === NOTE_DEFAULT.sizePt, hint: `${NOTE_DEFAULT.sizePt} pt, med midten på samme sted.`, onSelect: () => setNote(id, { sizePt: NOTE_DEFAULT.sizePt }) }]
            : [{ label: 'Opprinnelig størrelse', icon: 'resize' as const, disabled: Math.abs(p.w - nat.w) < 0.05 && Math.abs(p.h - nat.h) < 0.05, hint: 'Bildets egen størrelse og form. Rotasjon og beskjæring beholdes.', onSelect: () => changePlaced(id, (q) => keepX(resetSize(q, im.px, layoutNow!.width, layoutNow!.height), x0)) }]),
          { label: 'Roter 90° med klokken', icon: 'rotate', hint: 'Dra i den runde knotten over bildet for å rotere fritt.', onSelect: () => changePlaced(id, (q) => keepX(rotateBy(q, 90), x0)) },
          { label: 'Roter 90° mot klokken', icon: 'rotateLeft', hint: 'Dra i den runde knotten over bildet for å rotere fritt.', onSelect: () => changePlaced(id, (q) => keepX(rotateBy(q, -90), x0)) },
          ...(im.note
            ? [{ label: 'Pil fra teksten', icon: 'arrow' as const, checked: !!im.note.arrow, hint: im.note.arrow ? 'Fjerner pilen. Angre med Ctrl+Z.' : 'En strek med pilspiss fra kanten av teksten. Dra spissen dit den skal peke.', onSelect: () => {
                  openGroup = 'pil';
                  noteArrows.toggle(id, !im.note!.arrow);
                } }]
            : []),
          { label: 'Rett opp', icon: 'undo', disabled: !im.rotation, hint: im.rotation ? 'Fjerner rotasjonen.' : 'Bildet er ikke rotert.', onSelect: () => changePlaced(id, (q) => keepX(rotateBy(q, -q.rotation), x0)) },
        ],
      },
      {
        items: ms
          ? [{ label: 'Løsne fra milepælen', icon: 'unpin', hint: 'Bildet blir stående, og milepælen får flagget eller ruteren igjen. For å flytte bildet litt i forhold til milepælen holder du heller Alt mens du drar.', onSelect: () => pinImage(id, false) }]
          : [{ label: 'Fest til dato', icon: 'calendar', checked: !!im.date, hint: im.date ? `Festet til ${formatLong(im.date.day)}. Velg igjen for å flytte fritt.` : 'Bildet følger datoen når kalenderen endres, og flyttes bare opp og ned.', onSelect: () => pinImage(id, !im.date) }],
      },
      {
        items: [
          { label: 'Dupliser', icon: 'copy', kbd: 'Ctrl+D', hint: 'Lager en kopi litt nedenfor.', onSelect: () => duplicateImage(id) },
          ...(imagesOf(plan).length > 1
            ? [
                { label: 'Fremst', icon: 'front' as const, hint: 'Legger bildet over de andre bildene.', onSelect: () => moveImageInOrder(id, true) },
                { label: 'Bakerst', icon: 'front' as const, hint: 'Legger bildet under de andre bildene.', onSelect: () => moveImageInOrder(id, false) },
              ]
            : []),
        ],
      },
      { items: [{ label: 'Slett', icon: 'trash', danger: true, kbd: 'Delete', hint: 'Angre med Ctrl+Z.', onSelect: () => removeImage(id) }] },
    ], ms ? `Symbol for ${plainText(ms.text) || 'milepæl'}` : im.date ? `Festet til ${formatLong(im.date.day)}` : im.note ? 'Tekst' : `${im.px[0]} × ${im.px[1]} px`);
  };

  /** «Sett inn tekst» i høyreklikkmenyene. */
  const insertNoteItem = (at: Pt) => ({
    label: 'Sett inn tekst',
    icon: 'pencil' as const,
    hint: 'Fritekst hvor som helst på arket, for merknader eller forbehold.',
    onSelect: () => insertNote(at),
  });

  /** «Sett inn bilde» i høyreklikkmenyene, med hint om utklippstavlen. */
  const insertItem = (at: Pt) => ({
    label: 'Sett inn bilde …',
    icon: 'image' as const,
    kbd: 'Ctrl+V',
    hint: 'Velg en bildefil. Ctrl+V setter inn et bilde fra utklippstavlen, og du kan også dra en fil inn på arket.',
    onSelect: () => pickImage(at),
  });

  /** Valg for milepæler: bilde som symbol, eller samme bilde som en annen milepæl har. */
  const milestoneImageGroup = (plan: PlanFile, ids: string[]) => {
    const has = ids.map((id) => imagesOf(plan).find((im) => im.milestone?.id === id)).filter((x): x is PlanImage => !!x);
    const choices = symbolChoices(plan).filter((c) => !ids.includes(findImage(plan, c.id)?.milestone?.id ?? ''));
    const n = ids.length;
    const items: CtxItem[] = [
      { label: has.length ? 'Bytt bilde …' : 'Bruk bilde som symbol …', icon: 'image', hint: `Bildet erstatter flagget eller ruteren og følger milepælen${n > 1 ? 'e' : ''} når ${n > 1 ? 'de' : 'den'} flyttes.`, onSelect: () => pickImage(null, ids) },
      ...choices.slice(0, 6).map((c) => ({ label: `Bruk samme bilde som «${c.name.length > 28 ? `${c.name.slice(0, 27)}…` : c.name}»`, icon: 'copy' as const, hint: 'Samme bilde, størrelse, rotasjon og beskjæring.', onSelect: () => copySymbol(c.id, ids) })),
    ];
    if (has.length) items.push({ label: 'Fjern bildet', icon: 'trash', hint: 'Milepælen får flagget eller ruteren igjen.', onSelect: () => commit((pl) => { pl.plan.layout.images = imagesOf(pl).filter((im) => !im.milestone || !ids.includes(im.milestone.id)); if (!pl.plan.layout.images.length) delete pl.plan.layout.images; }) });
    return { heading: 'Symbol', items };
  };

  return {
    /** Etter hver tegning: planen og tegningen håndtakene regnes ut fra. */
    afterDraw(svg: SVGSVGElement, layout: Layout) {
      svgNow = svg;
      layoutNow = layout;
    },
    get selected() {
      return selectedImage;
    },
    get mode() {
      return imageMode;
    },
    get activePoint() {
      return activePoint;
    },
    /** Siste punkt musen var over arket, i mm, eller null utenfor. */
    get lastPointer() {
      return lastPointer;
    },
    set lastPointer(q: Pt | null) {
      lastPointer = q;
    },
    /** Shift holdt nede mens det dras. */
    set shift(on: boolean) {
      shiftNow = on;
    },
    findImage,
    placedOf,
    tipDrag,
    imageId,
    changePlaced,
    clearImage,
    selectImage,
    setImageMode,
    pickImage,
    visibleCenter,
    insertImages,
    removeImage,
    duplicateImage,
    mmPerPx,
    startImageMove,
    startImageHandle,
    deletePoint,
    imageOverlay,
    buildImagePanel,
    imageMenu,
    insertNoteItem,
    insertItem,
    milestoneImageGroup,
  };
}

export type ImageEdit = ReturnType<typeof createImageEdit>;
