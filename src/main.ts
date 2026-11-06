import './style.css';
import { checkOutboundBlocked } from './csp';
import { renderSheet, type Orientation } from './sheet';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

$('#version').textContent = `v${__APP_VERSION__}`;

checkOutboundBlocked().then((blocked) => {
  const el = $('#csp-status');
  el.textContent = blocked ? 'aktiv' : 'ikke aktiv (utviklingsmodus)';
  el.classList.toggle('ok', blocked);
});

// Filen leses i minnet og forkastes. Ingenting lagres.
$<HTMLInputElement>('#file-input').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  const info = $('#file-info');
  if (!file) {
    info.textContent = '';
    return;
  }
  const kb = (file.size / 1024).toFixed(1).replace('.', ',');
  info.textContent = `Lest lokalt: ${file.name} (${kb} kB). Visning av planen kommer i fase 2.`;
});

let orientation: Orientation = 'landscape';
const host = $('#sheet');
const draw = () => host.replaceChildren(renderSheet(orientation));

document.querySelectorAll<HTMLButtonElement>('[data-orientation]').forEach((btn) => {
  btn.addEventListener('click', () => {
    orientation = btn.dataset.orientation as Orientation;
    document
      .querySelectorAll<HTMLButtonElement>('[data-orientation]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    draw();
  });
});

draw();
