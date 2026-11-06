import './style.css';
import { checkOutboundBlocked } from './csp';
import { a3Size, renderSheet, type Orientation } from './sheet';
import { summarize, validatePlan } from './format/validate';
import type { PlanFile } from './format/types';
import { setPrintPage } from './print';
import { computeLayout, DEFAULT_MIN_TEXT_PT, fitAlternatives, type LayoutOptions } from './layout/layout';
import type { Paper } from './sheet';
import { renderPlan } from './render/svg';
import { canvasMeasure } from './render/measure';
import { createViewer } from './viewer';
import { createEditor } from './editor';
import type { PdfVariant } from './pdf/export';
import { placePopovers } from './popover';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

$('#version').textContent = `v${__APP_VERSION__}`;
placePopovers();
checkOutboundBlocked().then((blocked) => {
  const s = $('#csp-status');
  s.textContent = blocked ? 'aktiv' : 'ikke aktiv (utviklingsmodus)';
  s.classList.toggle('ok', blocked);
});

// Planen finnes bare i minnet så lenge fanen er åpen
let plan: PlanFile | null = null;
/** Filnavnet planen kom fra, uten endelse og uten _arbeidsfil, til forslag ved lagring. */
let baseName = 'skjematisk-plan';
let shown: { layout: ReturnType<typeof computeLayout>; svg: SVGSVGElement } | null = null;
// Skriften må være lastet før teksten måles, ellers blir målene fra reserveskriften
const fontsReady = Promise.all(['400 10px Carlito', '700 10px Carlito'].map((f) => document.fonts.load(f))).catch(() => []);
const opts: LayoutOptions = { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true, minTextPt: DEFAULT_MIN_TEXT_PT, paper: 'A3' };
const measure = canvasMeasure();
const host = $<HTMLDivElement>('#sheet');
const viewer = createViewer(host);
viewer.onChange((z) => {
  $('#zoom-level').textContent = `${Math.round(z * 100)} %`;
  $<HTMLButtonElement>('#zoom-out').disabled = z <= 1;
});
$('#zoom-in').addEventListener('click', () => viewer.zoomIn());
$('#zoom-out').addEventListener('click', () => viewer.zoomOut());
$('#zoom-fit').addEventListener('click', () => viewer.fit());
$('#zoom-width').addEventListener('click', () => viewer.fitWidth());
const editor = createEditor(
  {
    getPlan: () => plan,
    setPlan: (p) => (plan = p),
    redraw: () => draw(),
  },
  host,
  $<HTMLElement>('#panel'),
  $<HTMLButtonElement>('#edit'),
  $<HTMLElement>('#edit-tools'),
);
viewer.setIgnore((e) => editor.owns(e));
const status = el('p', '', 'muted small');
const saveStatus = el('p', '', 'muted small');
const suggest = el('div', '', 'suggest small');
let suggestTimer = 0;
const pt = (v: number) => v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
const sheetName = (paper: Paper, o: string) => `${paper} ${o === 'landscape' ? 'liggende' : 'stående'}`;

function draw() {
  // Utskriftsarket følger alltid det som vises, også når dialogen åpnes fra nettleserens meny
  setPrintPage(opts.paper ?? 'A3', opts.orientation);
  host.classList.toggle('landscape', opts.orientation === 'landscape');
  host.classList.toggle('portrait', opts.orientation === 'portrait');
  if (!plan) {
    const a3 = a3Size(opts.orientation);
    viewer.show(renderSheet(opts.orientation), a3.width, a3.height);
    return;
  }
  const t0 = performance.now();
  const layout = computeLayout(plan, opts, measure);
  const svg = renderPlan(layout);
  shown = { layout, svg };
  viewer.show(svg, layout.width, layout.height);
  editor.afterDraw(svg, layout);
  const ms = Math.round(performance.now() - t0);
  const shrunk = layout.textScale < 0.999 ? ` Teksten er krympet til ${pt(layout.textSizePt)} pt for å få plass.` : '';
  const here = sheetName(opts.paper ?? 'A3', opts.orientation);
  const tight = layout.overflow || layout.belowMin;
  status.textContent = layout.belowMin && !layout.overflow
    ? `På ${here} blir teksten ${pt(layout.textSizePt)} pt, under minimum på ${pt(opts.minTextPt ?? DEFAULT_MIN_TEXT_PT)} pt. Alt er med, men kan bli vanskelig å lese.`
    : layout.overflow
    ? opts.fitToSheet
      ? `Planen får ikke plass på ${here}, selv med ${pt(layout.textSizePt)} pt tekst. Den er tegnet for høy og blir kuttet ved utskrift.`
      : `Planen får ikke plass på ${here} med ${pt(opts.textSizePt)} pt tekst. Den er tegnet for høy og blir kuttet ved utskrift.`
    : `Tegnet på ${ms} ms.${shrunk}`;
  status.className = tight ? 'error small' : 'muted small';

  // Forslag til annet ark når planen er trang. Regnes ut litt etterpå, så tegningen ikke venter.
  // De gamle forslagene står til de nye er klare: tømmes linjen imens, endrer arket høyde og
  // visningen hopper ved hver endring.
  window.clearTimeout(suggestTimer);
  if (!tight && layout.textScale >= 0.999) {
    showSuggestions([], false);
    return;
  }
  const current = plan;
  suggestTimer = window.setTimeout(() => {
    if (plan !== current) return;
    // Beste retning per ark, og et større ark bare når det gir større tekst enn et mindre
    const order: Paper[] = ['A3', 'A2', 'A1'];
    const alts = fitAlternatives(current, opts, measure).filter((a) => a.fits && a.textSizePt > layout.textSizePt + 0.2);
    const better: typeof alts = [];
    let bestSoFar = tight ? 0 : layout.textSizePt;
    for (const paper of order) {
      const top = alts.filter((a) => a.paper === paper).sort((a, b) => b.textSizePt - a.textSizePt)[0];
      if (top && top.textSizePt > bestSoFar + 0.2) {
        better.push(top);
        bestSoFar = top.textSizePt;
      }
    }
    showSuggestions(better, tight);
  }, 30);
}

let suggestKey = '';
function showSuggestions(better: ReturnType<typeof fitAlternatives>, tight: boolean) {
  const key = better.length ? `${tight}|${better.map((a) => `${a.paper}${a.orientation}${pt(a.textSizePt)}`).join(',')}` : '';
  if (key === suggestKey) return;
  suggestKey = key;
  suggest.replaceChildren();
  if (!better.length) return;
  suggest.append(el('span', tight ? 'Får plass på: ' : 'Større tekst med: '));
  for (const a of better) {
    const b = el('button', `${sheetName(a.paper, a.orientation)} (${pt(a.textSizePt)} pt)`, 'button') as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => {
      opts.paper = a.paper;
      opts.orientation = a.orientation;
      syncControls();
      draw();
    });
    suggest.append(b);
  }
}

const fmtDate = (iso: string) => iso.split('-').reverse().join('.');

$<HTMLInputElement>('#file-input').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  const info = $('#file-info');
  input.value = '';
  if (!file) return;
  info.replaceChildren();

  // En arbeidsfil (PDF) har planen som vedlegg
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  let text: string;
  if (isPdf) {
    const { readPlanFromPdf } = await import('./pdf/read');
    const r = await readPlanFromPdf(bytes);
    if ('error' in r) {
      info.append(el('p', `Kunne ikke åpne ${file.name}. ${r.error}`, 'error'));
      return;
    }
    text = r.json;
  } else text = new TextDecoder().decode(bytes);
  const result = validatePlan(text);
  await fontsReady;
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
  // Valg som er lagret i en arbeidsfil
  const lay = plan.plan.layout;
  if (lay.paper) opts.paper = lay.paper;
  if (lay.style) opts.style = lay.style;
  if (lay.fitToSheet !== undefined) opts.fitToSheet = lay.fitToSheet;
  if (lay.minTextSize !== undefined) opts.minTextPt = lay.minTextSize;
  baseName = file.name.replace(/\.(pdf|json)$/i, '').replace(/_(arbeidsfil|kompakt)$/i, '') || 'skjematisk-plan';
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
  info.append(status, suggest, saveStatus);
  $<HTMLButtonElement>('#print').disabled = false;
  $<HTMLButtonElement>('#save-menu').disabled = false;
  $<HTMLButtonElement>('#save-work').disabled = false;
  $<HTMLButtonElement>('#edit').disabled = false;
  editor.reset();
  $<HTMLButtonElement>('#save-share').disabled = false;
  draw();
});

function syncControls() {
  document.querySelectorAll<HTMLButtonElement>('[data-orientation]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.orientation === opts.orientation)));
  document.querySelectorAll<HTMLButtonElement>('[data-height]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.height === opts.heightMode)));
  document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === (opts.style ?? 'excel'))));
  $<HTMLInputElement>('#text-size').value = String(opts.textSizePt);
  $<HTMLSelectElement>('#fit-mode').value = opts.fitToSheet ? 'sheet' : 'fixed';
  $<HTMLSelectElement>('#paper').value = opts.paper ?? 'A3';
  $<HTMLInputElement>('#min-text').value = String(opts.minTextPt ?? DEFAULT_MIN_TEXT_PT);
  $<HTMLLabelElement>('#min-text-field').hidden = !opts.fitToSheet;
  $('#sheet-summary').textContent = sheetName(opts.paper ?? 'A3', opts.orientation);
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
$<HTMLSelectElement>('#fit-mode').addEventListener('change', (e) => {
  opts.fitToSheet = (e.target as HTMLSelectElement).value === 'sheet';
  syncControls();
  draw();
});
$<HTMLSelectElement>('#paper').addEventListener('change', (e) => {
  opts.paper = (e.target as HTMLSelectElement).value as Paper;
  syncControls();
  draw();
});
$<HTMLInputElement>('#min-text').addEventListener('input', (e) => {
  const v = Number((e.target as HTMLInputElement).value.replace(',', '.'));
  if (v >= 4 && v <= 20) {
    opts.minTextPt = v;
    draw();
  }
});
// Utskrift: A3 i samme retning som i appen, både fra knappen og fra Ctrl+P
$<HTMLButtonElement>('#print').addEventListener('click', () => {
  setPrintPage(opts.paper ?? 'A3', opts.orientation);
  window.print();
});
// Lagre PDF: arbeidsfil med planen innebygd, eller vanlig PDF til deling uten
const SUFFIX: Record<PdfVariant, string> = { arbeidsfil: '_arbeidsfil', deling: '' };
async function save(variant: PdfVariant, btn: HTMLButtonElement) {
  if (!plan || !shown) return;
  const name = `${baseName}${SUFFIX[variant]}.pdf`;
  // Appens valg følger med i planen, så arbeidsfilen åpnes likt igjen
  const saved: PlanFile = structuredClone(plan);
  Object.assign(saved.plan.layout, {
    orientation: opts.orientation,
    heightMode: opts.heightMode,
    textSize: opts.textSizePt,
    paper: opts.paper ?? 'A3',
    style: opts.style ?? 'excel',
    fitToSheet: opts.fitToSheet,
    minTextSize: opts.minTextPt ?? DEFAULT_MIN_TEXT_PT,
  });
  btn.disabled = true;
  saveStatus.textContent = 'Lager PDF …';
  saveStatus.className = 'muted small';
  try {
    // Velg fil først, mens klikket fortsatt gjelder (nettleseren krever det for Lagre som-dialogen)
    const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    const handle = picker ? await picker({ suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] }) : null;
    const { exportPdf } = await import('./pdf/export');
    const pdf = await exportPdf(shown.layout, shown.svg, saved, variant, __APP_VERSION__);
    const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
    if (handle) {
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    const kb = Math.max(1, Math.round(pdf.length / 1024));
    saveStatus.textContent = `Lagret ${handle?.name ?? name} (${kb} kB).${variant === 'arbeidsfil' ? ' Åpne den her igjen for å redigere eller oppdatere planen.' : ' Klar til deling.'}`;
    saveStatus.className = 'ok small';
    if (variant === 'arbeidsfil') editor.markSaved();
  } catch (e) {
    if ((e as Error).name === 'AbortError') saveStatus.textContent = '';
    else {
      saveStatus.textContent = `PDF-en ble ikke lagret: ${(e as Error).message}`;
      saveStatus.className = 'error small';
    }
  } finally {
    btn.disabled = false;
  }
}
$<HTMLButtonElement>('#save-work').addEventListener('click', (e) => save('arbeidsfil', e.currentTarget as HTMLButtonElement));
$<HTMLButtonElement>('#save-share').addEventListener('click', (e) => save('deling', e.currentTarget as HTMLButtonElement));
window.addEventListener('beforeprint', () => setPrintPage(opts.paper ?? 'A3', opts.orientation));

draw();
