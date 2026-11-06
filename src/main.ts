import './style.css';
import { checkOutboundBlocked } from './csp';
import { renderSheet, type Orientation } from './sheet';
import { summarize, validatePlan } from './format/validate';

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

const fmtDate = (iso: string) => iso.split('-').reverse().join('.');

// Filen leses i minnet og forkastes. Ingenting lagres.
$<HTMLInputElement>('#file-input').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  const info = $('#file-info');
  info.replaceChildren();
  if (!file) return;

  const result = validatePlan(await file.text());
  input.value = '';

  if (!result.plan) {
    info.append(el('p', `Kunne ikke lese ${file.name}.`, 'error'));
    const ul = el('ul', undefined, 'messages');
    result.errors.slice(0, 20).forEach((m) => ul.append(el('li', m)));
    if (result.errors.length > 20) ul.append(el('li', `… og ${result.errors.length - 20} til.`));
    info.append(ul);
    return;
  }

  const s = summarize(result.plan);
  const orientation = result.plan.plan.layout.orientation;
  setOrientation(orientation);

  info.append(el('p', `${file.name} er lest${s.anonymized ? ' (anonymisert)' : ''}.`, 'ok'));
  const dl = el('dl', undefined, 'summary');
  const row = (k: string, v: string) => dl.append(el('dt', k), el('dd', v));
  row('Overskrift', s.title || '(ingen)');
  row('Periode', `${fmtDate(s.start)} til ${fmtDate(s.end)}, ${s.mode === 'week' ? 'uker' : 'måneder'}`);
  row('Lanes', String(s.lanes));
  row('Bokser', `${s.boxes}, hvorav ${s.drawable} tegnes og ${s.milestones} er milepæler`);
  row('Aktiviteter', String(s.tasks));
  row('Ferier', String(s.holidays));
  info.append(dl);

  if (result.warnings.length) {
    info.append(el('p', `${result.warnings.length} ting å se på:`));
    const ul = el('ul', undefined, 'messages');
    result.warnings.forEach((m) => ul.append(el('li', m)));
    info.append(ul);
  }
  info.append(el('p', 'Opptegning av planen kommer i fase 2.', 'muted'));
});

let orientation: Orientation = 'landscape';
const host = $('#sheet');
const draw = () => host.replaceChildren(renderSheet(orientation));
const buttons = document.querySelectorAll<HTMLButtonElement>('[data-orientation]');

function setOrientation(o: Orientation) {
  orientation = o;
  buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.orientation === o)));
  draw();
}

buttons.forEach((btn) => btn.addEventListener('click', () => setOrientation(btn.dataset.orientation as Orientation)));

draw();
