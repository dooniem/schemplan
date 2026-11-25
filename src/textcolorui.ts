// Farge og understreking på deler av teksten i boks-panelet: marker ord i tekstfeltet og velg en farge,
// som i Word og Excel. «A» gir den sist brukte fargen, pilen ved siden av viser alle fargene,
// og «U» understreker (eller fjerner understrekingen).
import type { Box } from './format/types';
import { allUnderlined, charColors, charUnderlines, hasTextColors, hasUnderlines, paintRuns, underlineRanges } from './format/textcolor';
import { BOX_PALETTE, type Swatch } from './editmodel';
import { icon } from './ctxmenu';
import { REDRAW_MARKS, type FieldMark } from './breakmarks';

export interface TextColorKit {
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>, text?: string) => HTMLElementTagNameMap[K];
  swatches: (current: string | null, list: Swatch[], pick: (fill: string) => void) => HTMLElement;
  /** Boksen slik den er nå (planen kan være byttet ut av angre). */
  box: () => Box | null;
  /** Endrer boksen som ett angresteg, uten å bygge panelet på nytt (så markeringen i feltet står). */
  change: (fn: (b: Box) => void) => void;
}

/** Fargen «A» gir. Rød som standard, ellers den sist brukte, så samme farge kan gis flere ord etter hverandre. */
let lastColor = BOX_PALETTE[0][0];
/** Fargene er vist; huskes når panelet bygges på nytt. */
let paletteOpen = false;

/** Fargeruten har denne fargen. */
const sameColor = (s: HTMLElement, c: string) => s.dataset.color === c.toUpperCase();
const nameOf = (c: string) => BOX_PALETTE.find(([f]) => f.toUpperCase() === c.toUpperCase())?.[1] ?? c;

/** Fargen og understrekingen til hvert tegn i feltet, til strekene under teksten i feltet. */
export function fieldMarks(b: Box | null): (FieldMark | undefined)[] {
  if (!b || (!hasTextColors(b.textColors) && !hasUnderlines(b.underlines))) return [];
  const cs = charColors(b.text.length, b.textColors);
  const us = charUnderlines(b.text.length, b.underlines);
  return cs.map((color, i) => (color || us[i] ? { color, underline: us[i] } : undefined));
}

/** Raden under tekstfeltet. ta er feltet med boksteksten. */
export function textColorRows(kit: TextColorKit, ta: HTMLTextAreaElement): HTMLElement[] {
  const { el } = kit;
  const row = el('div', { class: 'prop prop-inline tc-row' });
  row.append(el('span', { class: 'prop-label' }, 'Ordfarge'));
  const g = el('div', { class: 'group tc-tools', role: 'group', 'aria-label': 'Farge på markert tekst' });

  const apply = el('button', { type: 'button', class: 'tc-apply' }) as HTMLButtonElement;
  const glyph = el('span', { class: 'tc-a', 'aria-hidden': 'true' }, 'A');
  apply.append(glyph);
  const more = el('button', { type: 'button', class: 'tc-more', 'aria-label': 'Flere farger', title: 'Flere farger' }) as HTMLButtonElement;
  more.append(icon('chevron', 'pico'));
  const clear = el('button', { type: 'button', class: 'tc-clear' }, 'Fjern') as HTMLButtonElement;
  g.append(apply, more, clear);
  // Understreking står for seg ved siden av fargene, som i Word
  const under = el('button', { type: 'button', class: 'tc-under', 'aria-pressed': 'false' }) as HTMLButtonElement;
  under.append(el('span', { class: 'tc-u', 'aria-hidden': 'true' }, 'U'));
  const ug = el('div', { class: 'group tc-under-g' });
  ug.append(under);
  const line = el('div', { class: 'tc-line' });
  line.append(g, ug);
  row.append(line);

  const palette = el('div', { class: 'tc-palette', id: `tc-pal-${Math.random().toString(36).slice(2, 8)}` });
  more.setAttribute('aria-controls', palette.id);

  /** Markeringen i feltet. Den står selv om feltet mister fokus. */
  const range = () => [Math.min(ta.selectionStart, ta.selectionEnd), Math.max(ta.selectionStart, ta.selectionEnd)] as const;

  const sync = () => {
    const [a, z] = range();
    const picked = z > a;
    const b = kit.box();
    const colored = hasTextColors(b?.textColors);
    const anyIn = picked && charColors(ta.value.length, b?.textColors).slice(a, z).some(Boolean);
    glyph.style.setProperty('--tc', lastColor);
    apply.disabled = !picked;
    apply.title = picked ? `Gi markert tekst fargen ${nameOf(lastColor)}` : 'Marker ord i teksten først';
    apply.setAttribute('aria-label', `Farge ${nameOf(lastColor)} på markert tekst`);
    clear.disabled = picked ? !anyIn : !colored;
    clear.title = picked ? 'Markert tekst får boksens vanlige tekstfarge' : 'All tekst får boksens vanlige tekstfarge';
    const on = picked && !!b && allUnderlined(ta.value, b.underlines, a, z);
    under.disabled = !picked;
    under.setAttribute('aria-pressed', String(on));
    under.setAttribute('aria-label', on ? 'Fjern understreking på markert tekst' : 'Understrek markert tekst');
    under.title = picked ? `${on ? 'Fjern understrekingen' : 'Understrek markert tekst'} (Ctrl+U)` : 'Marker ord i teksten først';
    more.setAttribute('aria-expanded', String(paletteOpen));
    palette.hidden = !paletteOpen;
    for (const s of palette.querySelectorAll<HTMLButtonElement>('.swatch')) s.setAttribute('aria-pressed', String(sameColor(s, lastColor)));
  };

  /** Gir markert tekst fargen, eller vanlig farge med null. Uten markering fjerner null all farge. */
  const paint = (color: string | null) => {
    const [a, z] = range();
    // Uten markering velges bare fargen «A» gir
    if (z <= a && color) {
      lastColor = color;
      sync();
      return;
    }
    kit.change((b) => {
      const runs = z > a ? paintRuns(b.textColors, b.text.length, a, z, color) : [];
      if (runs.length) b.textColors = runs;
      else delete b.textColors;
    });
    if (color) lastColor = color;
    ta.dispatchEvent(new Event(REDRAW_MARKS));
    // Markeringen står, så samme ord kan prøves i flere farger
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(a, z);
    sync();
  };

  /** Understreker markert tekst, eller fjerner understrekingen når alt markert allerede er understreket. */
  const toggleUnderline = () => {
    const [a, z] = range();
    if (z <= a) return;
    kit.change((b) => {
      const ranges = underlineRanges(b.underlines, b.text.length, a, z, !allUnderlined(b.text, b.underlines, a, z));
      if (ranges.length) b.underlines = ranges;
      else delete b.underlines;
    });
    ta.dispatchEvent(new Event(REDRAW_MARKS));
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(a, z);
    sync();
  };

  palette.append(
    kit.swatches(null, BOX_PALETTE, (c) => paint(c)),
  );
  const custom = el('label', { class: 'custom-color' });
  const inp = el('input', { type: 'color' }) as HTMLInputElement;
  inp.value = lastColor.toLowerCase();
  inp.addEventListener('change', () => paint(inp.value.toUpperCase()));
  custom.append(inp, 'Egen farge');
  palette.append(custom);

  // Knappene tar ikke fokus fra feltet, så markeringen synes mens du velger farge
  for (const b of [apply, more, clear, under, palette]) b.addEventListener('mousedown', (e) => {
    if ((e.target as Element).closest('input')) return;
    e.preventDefault();
  });
  apply.addEventListener('click', () => paint(lastColor));
  clear.addEventListener('click', () => paint(null));
  under.addEventListener('click', toggleUnderline);
  // Ctrl+U i feltet, som i et tekstprogram
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      toggleUnderline();
    }
  });
  more.addEventListener('click', () => {
    paletteOpen = !paletteOpen;
    sync();
  });
  for (const ev of ['select', 'keyup', 'mouseup', 'input', 'focus']) ta.addEventListener(ev, sync);
  // Markering med tastaturet eller dobbeltklikk gir ikke alltid select-hendelse
  const onSel = () => {
    if (!ta.isConnected) document.removeEventListener('selectionchange', onSel);
    else if (document.activeElement === ta) sync();
  };
  document.addEventListener('selectionchange', onSel);
  sync();
  return [row, palette];
}
