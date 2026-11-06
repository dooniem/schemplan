import './style.css';
import { checkOutboundBlocked } from './csp';
import { renderSheet, type Orientation } from './sheet';
import { summarize, validatePlan } from './format/validate';
import type { PlanFile } from './format/types';
import { computeLayout, type LayoutOptions } from './layout/layout';
import { renderPlan } from './render/svg';
import { canvasMeasure } from './render/measure';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

$('#version').textContent = `v${__APP_VERSION__}`;
checkOutboundBlocked().then((blocked) => {
  const s = $('#csp-status');
  s.textContent = blocked ? 'aktiv' : 'ikke aktiv (utviklingsmodus)';
  s.classList.toggle('ok', blocked);
});

// Planen finnes bare i minnet så lenge fanen er åpen
let plan: PlanFile | null = null;
const opts: LayoutOptions = { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true };
const measure = canvasMeasure();
const host = $<HTMLDivElement>('#sheet');
const status = el('p', '', 'muted small');

function draw() {
  host.classList.toggle('landscape', opts.orientation === 'landscape');
  host.classList.toggle('portrait', opts.orientation === 'portrait');
  if (!plan) {
    host.replaceChildren(renderSheet(opts.orientation));
    return;
  }
  const t0 = performance.now();
  const layout = computeLayout(plan, opts, measure);
  host.replaceChildren(renderPlan(layout));
  const ms = Math.round(performance.now() - t0);
  const shrunk = layout.textScale < 0.999 ? ` Teksten er krympet til ${layout.textSizePt.toFixed(1).replace('.', ',')} pt for å få plass.` : '';
  status.textContent = layout.overflow
    ? `Planen er høyere enn A3-arket. Prøv mindre tekst, Kompakt eller stående ark.`
    : `Tegnet på ${ms} ms.${shrunk}`;
  status.className = layout.overflow ? 'error small' : 'muted small';
}

const fmtDate = (iso: string) => iso.split('-').reverse().join('.');

$<HTMLInputElement>('#file-input').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  const info = $('#file-info');
  input.value = '';
  if (!file) return;
  info.replaceChildren();

  const result = validatePlan(await file.text());
  if (!result.plan) {
    info.append(el('p', `Kunne ikke lese ${file.name}.`, 'error'));
    const ul = el('ul', undefined, 'messages');
    result.errors.slice(0, 20).forEach((m) => ul.append(el('li', m)));
    if (result.errors.length > 20) ul.append(el('li', `… og ${result.errors.length - 20} til.`));
    info.append(ul);
    return;
  }

  plan = result.plan;
  opts.orientation = plan.plan.layout.orientation;
  opts.heightMode = plan.plan.layout.heightMode;
  opts.textSizePt = plan.plan.layout.textSize;
  syncControls();

  const s = summarize(plan);
  const line = `${file.name}${s.anonymized ? ' (anonymisert)' : ''}: ${s.lanes} lanes, ${s.boxes} bokser, ${s.milestones} milepæler, ` +
    `${fmtDate(s.start)} til ${fmtDate(s.end)} i ${s.mode === 'week' ? 'uker' : 'måneder'}.`;
  info.append(el('p', line, 'ok small'));
  if (result.warnings.length) {
    const d = el('details');
    d.append(el('summary', `${result.warnings.length} ting å se på`));
    const ul = el('ul', undefined, 'messages');
    result.warnings.forEach((m) => ul.append(el('li', m)));
    d.append(ul);
    info.append(d);
  }
  info.append(status);
  $<HTMLButtonElement>('#print').disabled = false;
  draw();
});

function syncControls() {
  document.querySelectorAll<HTMLButtonElement>('[data-orientation]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.orientation === opts.orientation)));
  document.querySelectorAll<HTMLButtonElement>('[data-height]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.height === opts.heightMode)));
  document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === (opts.style ?? 'excel'))));
  $<HTMLInputElement>('#text-size').value = String(opts.textSizePt);
  $<HTMLInputElement>('#fit').checked = opts.fitToSheet;
}

document.querySelectorAll<HTMLButtonElement>('[data-orientation]').forEach((btn) =>
  btn.addEventListener('click', () => {
    opts.orientation = btn.dataset.orientation as Orientation;
    syncControls();
    draw();
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-height]').forEach((btn) =>
  btn.addEventListener('click', () => {
    opts.heightMode = btn.dataset.height as LayoutOptions['heightMode'];
    syncControls();
    draw();
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((btn) =>
  btn.addEventListener('click', () => {
    opts.style = btn.dataset.style as LayoutOptions['style'];
    syncControls();
    draw();
  }),
);
$<HTMLInputElement>('#text-size').addEventListener('input', (e) => {
  const v = Number((e.target as HTMLInputElement).value.replace(',', '.'));
  if (v >= 4 && v <= 24) {
    opts.textSizePt = v;
    draw();
  }
});
$<HTMLInputElement>('#fit').addEventListener('change', (e) => {
  opts.fitToSheet = (e.target as HTMLInputElement).checked;
  draw();
});
$<HTMLButtonElement>('#print').addEventListener('click', () => window.print());

draw();
