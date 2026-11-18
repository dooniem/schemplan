// Glideren for gjennomsiktighet i panelet til overskrifts- og Multi Lane-bokser.
// Planen tegnes på nytt mens du drar, og hele dragningen er ett angresteg.
import type { Box } from './format/types';
import { MAX_TRANSPARENCY, setTransparency, transparencyOf, TRANSPARENCY_STEP } from './layout/transparency';

export interface TransparencyKit {
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>, text?: string) => HTMLElementTagNameMap[K];
  /** Tar vare på planen før endringen, så den kan angres. */
  snapshot(): void;
  /** Boksen slik den er i planen nå, eller null. */
  box(): Box | null;
  redraw(): void;
  syncTools(): void;
}

const pct = (v: number) => `${v} %`;

/** Raden med glideren for boksen som er valgt. */
export function transparencyRow(kit: TransparencyKit, b: Box): HTMLElement {
  const { el } = kit;
  const now = transparencyOf(b);
  // Navnet er for langt for kolonnen til de andre radene: det står over glideren, med verdien til høyre
  const wrap = el('div', { class: 'prop transparency' });
  const head = el('div', { class: 'prop-head' });
  const label = el('label', { class: 'prop-label', for: 'box-transparency' }, 'Gjennomsiktighet');
  const value = el('span', { class: 'range-value', 'aria-hidden': 'true' }, pct(now));
  const range = el('input', {
    type: 'range',
    id: 'box-transparency',
    min: '0',
    max: String(MAX_TRANSPARENCY),
    step: String(TRANSPARENCY_STEP),
    value: String(now),
    title: 'Linjene og lanefeltene bak synes gjennom fargen. Kanten og teksten er hele.',
  }) as HTMLInputElement;
  let sliding = false;
  range.addEventListener('input', () => {
    const box = kit.box();
    if (!box) return;
    if (!sliding) kit.snapshot();
    sliding = true;
    setTransparency(box, Number(range.value));
    value.textContent = pct(transparencyOf(box));
    range.setAttribute('aria-valuetext', value.textContent);
    kit.redraw();
  });
  range.addEventListener('change', () => {
    sliding = false;
    kit.syncTools();
  });
  range.setAttribute('aria-valuetext', pct(now));
  head.append(label, value);
  wrap.append(head, range);
  return wrap;
}
