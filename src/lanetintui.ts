// Glideren for styrken på lanefargen bak boksene, i panelet til lanen.
// Planen tegnes på nytt mens du drar, og hele dragningen er ett angresteg.
import type { Lane } from './format/types';
import { setTintStrength, tintStrengthOf, TINT_MAX, TINT_MIN, TINT_STEP } from './layout/lanetint';

export interface TintStrengthKit {
  el: <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>, text?: string) => HTMLElementTagNameMap[K];
  /** Tar vare på planen før endringen, så den kan angres. */
  snapshot(): void;
  /** Lanen slik den er i planen nå, eller null. */
  lane(): Lane | null;
  redraw(): void;
  syncTools(): void;
}

const pct = (v: number) => `${v} %`;

/** Raden med glideren for lanen som er valgt. 100 % er standard. */
export function tintStrengthRow(kit: TintStrengthKit, l: Lane): HTMLElement {
  const { el } = kit;
  const now = tintStrengthOf(l);
  const wrap = el('div', { class: 'prop tint-strength' });
  const head = el('div', { class: 'prop-head' });
  const label = el('label', { class: 'prop-label', for: 'lane-tint-strength' }, 'Styrke');
  const value = el('span', { class: 'range-value', 'aria-hidden': 'true' }, pct(now));
  const range = el('input', {
    type: 'range',
    id: 'lane-tint-strength',
    min: String(TINT_MIN),
    max: String(TINT_MAX),
    step: String(TINT_STEP),
    value: String(now),
    list: 'lane-tint-default',
    title: 'Hvor tydelig lanefargen er bak boksene. 100 % er standard. Lysheten er den samme, så teksten er like lett å lese.',
  }) as HTMLInputElement;
  // Et merke på 100 %, så standard er lett å finne igjen
  const marks = el('datalist', { id: 'lane-tint-default' });
  marks.append(el('option', { value: '100' }));
  let sliding = false;
  range.addEventListener('input', () => {
    const lane = kit.lane();
    if (!lane) return;
    if (!sliding) kit.snapshot();
    sliding = true;
    setTintStrength(lane, Number(range.value));
    value.textContent = pct(tintStrengthOf(lane));
    range.setAttribute('aria-valuetext', value.textContent);
    kit.redraw();
  });
  range.addEventListener('change', () => {
    sliding = false;
    kit.syncTools();
  });
  range.setAttribute('aria-valuetext', pct(now));
  head.append(label, value);
  wrap.append(head, range, marks);
  return wrap;
}
