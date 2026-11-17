// Merking i redigeringen: høylytt arbeid, nattarbeid og planens eget merke (et bilde brukeren laster opp).
// Brytere i panelet, valg i høyreklikkmenyen og panelet for eget merke.
import type { Box, PlanFile } from './format/types';
import { findBox } from './editmodel';
import { MARK_KINDS, MARK_NAMES, MARK_SCALES, markName, markScaleOf, markShapes, type MarkKind } from './layout/marks';
import type { CtxItem, IconName } from './ctxmenu';

const HINTS: Record<MarkKind, string> = {
  loud: 'Høyttaler på gul bunn på høyre kant av boksen',
  night: 'Halvmåne på høyre kant av boksen',
  custom: 'Bildet du har lastet opp, på høyre kant av boksen',
};
const ICON: Record<MarkKind, IconName> = { loud: 'speaker', night: 'moon', custom: 'image' };

/** Merkene som kan velges i planen: eget merke bare når det er lastet opp. */
const kindsIn = (plan: PlanFile) => MARK_KINDS.filter((k) => k !== 'custom' || !!plan.plan.layout.customMark);

/** Største side på bildet til eget merke, i piksler. Nok til et skarpt ikon på A1, og liten fil. */
const CUSTOM_PX = 256;

/** Leser bildet til eget merke som PNG, krympet til CUSTOM_PX. Redigering av bildet gjøres utenfor appen. */
export async function readMarkImage(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error('Bildet har ingen størrelse');
    const k = Math.min(1, CUSTOM_PX / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * k));
    c.height = Math.max(1, Math.round(h0 * k));
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Åpner fildialogen og leser bildet. null når ingenting ble valgt eller bildet ikke kunne leses. */
export function pickMarkImage(onError: (msg: string) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      try {
        resolve(await readMarkImage(f));
      } catch {
        onError('Bildet kunne ikke leses. Prøv en PNG- eller JPEG-fil.');
        resolve(null);
      }
    }, { once: true });
    inp.addEventListener('cancel', () => resolve(null), { once: true });
    inp.click();
  });
}

/** Tar bort eget merke fra planen og fra alle boksene. */
export function removeCustomMark(plan: PlanFile): void {
  delete plan.plan.layout.customMark;
  for (const l of plan.lanes) for (const b of l.boxes) delete b.custom;
}

/** Gir boksene merket, eller tar det bort. Milepæler merkes ikke. */
export function setMarks(plan: PlanFile, ids: readonly string[], kind: MarkKind, on: boolean): void {
  for (const id of ids) {
    const b = findBox(plan, id);
    if (!b || b.resolved?.isMilestone) continue;
    if (on) b[kind] = true;
    else delete b[kind];
  }
}

/** Alle boksene har merket. */
export const allMarked = (boxes: readonly Box[], kind: MarkKind) => boxes.length > 0 && boxes.every((b) => !!b[kind]);

interface Kit {
  section(title: string): HTMLElement;
  switchRow(label: string, on: boolean, onChange: (v: boolean) => void, title?: string): HTMLElement;
  el(tag: string, attrs?: Record<string, string>, text?: string): HTMLElement;
}

/** Det panelet trenger for eget merke: laste opp et nytt og gi det til boksene, eller åpne panelet for merket. */
export interface CustomActions {
  /** Last opp et bilde som eget merke og gi det til de valgte boksene. */
  add(): void;
  /** Åpne panelet for eget merke (navn, bilde, fjerne). */
  edit(): void;
}

const NS = 'http://www.w3.org/2000/svg';
/** Ikonet slik det står på arket, i liten utgave foran navnet. */
function markIcon(kind: MarkKind, plan: PlanFile): Element {
  if (kind === 'custom') {
    const img = document.createElement('img');
    img.src = plan.plan.layout.customMark?.image ?? '';
    img.alt = '';
    img.className = 'mark-ico';
    return img;
  }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-0.05 -0.05 1.1 1.1');
  svg.setAttribute('class', 'mark-ico');
  svg.setAttribute('aria-hidden', 'true');
  for (const sh of markShapes(kind, 0, 0, 1)) {
    const p = document.createElementNS(NS, sh.tag);
    for (const [k, v] of Object.entries(sh.attrs)) p.setAttribute(k, String(v));
    svg.append(p);
  }
  return svg;
}

/**
 * Størrelsen på alle ikonene i planen, som − 100 % +. Faste trinn (75–150 %), så de verken blir for små eller for store.
 * Standard er én tekstlinje i planen, så ikonene følger arket og tekststørrelsen.
 */
export function markScaleRow(kit: Kit, plan: PlanFile, set: (v: number | undefined) => void): HTMLElement {
  const steps = MARK_SCALES.map(([v]) => v);
  const cur = markScaleOf(plan.plan.layout.markScale);
  const i = Math.max(0, steps.findIndex((v) => Math.abs(v - cur) < 1e-3));
  const pick = (v: number) => set(v === 1 ? undefined : v);
  const wrap = kit.el('div', { class: 'prop prop-inline', title: 'Gjelder ikonene på alle boksene. 100 % er like høyt som en tekstlinje i planen.' });
  wrap.append(kit.el('span', { class: 'prop-label' }, 'Ikoner'));
  const g = kit.el('div', { class: 'group stepper', role: 'group', 'aria-label': 'Størrelse på ikonene' });
  const down = kit.el('button', { type: 'button', 'aria-label': 'Mindre ikoner', title: 'Mindre ikoner' }, '−') as HTMLButtonElement;
  const up = kit.el('button', { type: 'button', 'aria-label': 'Større ikoner', title: 'Større ikoner' }, '+') as HTMLButtonElement;
  const val = kit.el('output', { class: 'step-val', 'aria-live': 'polite' }, `${Math.round(steps[i] * 100)} %`);
  down.disabled = i === 0;
  up.disabled = i === steps.length - 1;
  down.addEventListener('click', () => pick(steps[i - 1]));
  up.addEventListener('click', () => pick(steps[i + 1]));
  g.append(down, val, up);
  wrap.append(g);
  return wrap;
}

/** «Merking» i panelet for én eller flere bokser. */
export function marksSection(kit: Kit, plan: PlanFile, boxes: readonly Box[], set: (kind: MarkKind, on: boolean) => void, setScale: (v: number | undefined) => void, custom: CustomActions): void {
  const s = kit.section('Merking');
  const cm = plan.plan.layout.customMark;
  for (const k of kindsIn(plan)) {
    const row = kit.switchRow(markName(k, cm?.name), allMarked(boxes, k), (v) => set(k, v), HINTS[k]);
    row.querySelector('span')?.prepend(markIcon(k, plan));
    s.append(row);
  }
  // Eget merke: last opp et bilde første gang, ellers kan navn og bilde endres i eget panel
  const act = kit.el('button', { type: 'button', class: 'linkish mark-custom-act' }, cm ? `Endre «${markName('custom', cm.name)}» …` : 'Eget merke med bilde …') as HTMLButtonElement;
  act.title = cm ? 'Navn, bilde, eller fjern merket fra planen' : 'Last opp et ikon (PNG eller JPEG). Det får samme størrelse som de andre, så eventuell redigering gjøres før du laster det opp.';
  act.addEventListener('click', () => (cm ? custom.edit() : custom.add()));
  s.append(act);
  // Størrelsen gjelder hele planen, så den vises først når noen bokser er merket
  if (plan.lanes.some((l) => l.boxes.some((b) => b.loud || b.night || (cm && b.custom)))) s.append(markScaleRow(kit, plan, setScale));
  s.append(kit.el('p', { class: 'hint' }, 'Merkene står i forklaringen. Klikk dem der når du ikke redigerer, for å fremheve boksene.'));
}

/** Panelet for eget merke: navn, bilde og fjerning. Størrelsen er felles med de andre merkene. */
export function customMarkSection(
  kit: Kit,
  plan: PlanFile,
  o: { rename(name: string): void; replace(): void; remove(): void; button(text: string, icon: IconName, onClick: () => void, title?: string, cls?: string): HTMLButtonElement },
): void {
  const cm = plan.plan.layout.customMark;
  if (!cm) return;
  const s = kit.section('Eget merke');
  const row = kit.el('div', { class: 'mark-custom-head' });
  const img = document.createElement('img');
  img.src = cm.image;
  img.alt = '';
  img.className = 'mark-preview';
  const lab = kit.el('label', { class: 'mark-custom-name' });
  lab.append(kit.el('span', { class: 'prop-label' }, 'Navn'));
  const inp = kit.el('input', { type: 'text', id: 'mark-custom-name', value: cm.name, placeholder: MARK_NAMES.custom, maxlength: '60' }) as HTMLInputElement;
  // Ett angresteg per endring: navnet lagres når feltet forlates eller Enter trykkes
  inp.addEventListener('change', () => o.rename(inp.value.trim()));
  inp.addEventListener('keydown', (e) => e.key === 'Enter' && inp.blur());
  lab.append(inp);
  row.append(img, lab);
  s.append(row);
  const acts = kit.el('div', { class: 'row mark-custom-acts' });
  acts.append(
    o.button('Bytt bilde …', 'image', o.replace, 'Last opp et annet bilde. Boksene beholder merket.', 'button small'),
    o.button('Fjern merket', 'trash', o.remove, 'Tar merket bort fra planen og fra alle boksene', 'button small'),
  );
  s.append(acts);
  s.append(kit.el('p', { class: 'hint' }, 'Bildet tilpasses et kvadrat like stort som de andre merkene. Beskjær eller juster det før du laster det opp.'));
}

/** Av/på-valgene i høyreklikkmenyen til en boks. */
export function marksMenuItems(plan: PlanFile, boxes: readonly Box[], set: (kind: MarkKind, on: boolean) => void): CtxItem[] {
  return kindsIn(plan).map((k) => {
    const on = allMarked(boxes, k);
    return { label: markName(k, plan.plan.layout.customMark?.name), icon: ICON[k], checked: on, hint: HINTS[k] + '.', onSelect: () => set(k, !on) };
  });
}
