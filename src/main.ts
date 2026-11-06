import './style.css';
import { checkOutboundBlocked } from './csp';
import { a3Size, renderSheet, type Orientation } from './sheet';
import { summarize, validatePlan } from './format/validate';
import type { PlanFile } from './format/types';
import { setPrintPage } from './print';
import { computeLayout, DEFAULT_MIN_TEXT_PT, DEFAULT_TITLE_PT, fitAlternatives, type LayoutOptions } from './layout/layout';
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
const opts: LayoutOptions = { orientation: 'landscape', heightMode: 'fill', textSizePt: 9, fitToSheet: true, minTextPt: DEFAULT_MIN_TEXT_PT, paper: 'A3', style: 'ny' };
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

/** Leser en planfil (.json) eller arbeidsfil (.pdf). Viser feil i statuslinjen og gir null om den ikke kan brukes. */
async function readPlan(bytes: Uint8Array, name: string): Promise<{ plan: PlanFile; warnings: string[]; isPdf: boolean } | null> {
  const info = $('#file-info');
  // En arbeidsfil (PDF) har planen som vedlegg
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  let text: string;
  if (isPdf) {
    const { readPlanFromPdf } = await import('./pdf/read');
    const r = await readPlanFromPdf(bytes);
    if ('error' in r) {
      info.replaceChildren(el('p', `Kunne ikke åpne ${name}. ${r.error}`, 'error'));
      return null;
    }
    text = r.json;
  } else text = new TextDecoder().decode(bytes);
  const result = validatePlan(text);
  await fontsReady;
  if (!result.plan) {
    info.replaceChildren(el('p', `Kunne ikke lese ${name}.`, 'error'));
    const ul = el('ul', undefined, 'messages');
    result.errors.slice(0, 20).forEach((m) => ul.append(el('li', m)));
    if (result.errors.length > 20) ul.append(el('li', `… og ${result.errors.length - 20} til.`));
    info.append(ul);
    return null;
  }
  return { plan: result.plan, warnings: result.warnings, isPdf };
}

/** Tar i bruk valgene som er lagret i planen. */
function applyLayout(p: PlanFile) {
  const lay = p.plan.layout;
  opts.orientation = lay.orientation;
  opts.heightMode = lay.heightMode;
  opts.textSizePt = lay.textSize;
  // Valg som er lagret i en arbeidsfil
  if (lay.paper) opts.paper = lay.paper;
  opts.style = lay.style ?? 'ny';
  if (lay.fitToSheet !== undefined) opts.fitToSheet = lay.fitToSheet;
  if (lay.minTextSize !== undefined) opts.minTextPt = lay.minTextSize;
  opts.titleSizePt = lay.titleSize ?? DEFAULT_TITLE_PT;
  syncControls();
}

const details = (title: string, groups: [string, string[]][]) => {
  const d = el('details');
  d.append(el('summary', title));
  for (const [head, items] of groups) {
    if (!items.length) continue;
    d.append(el('p', head, 'small'));
    const ul = el('ul', undefined, 'messages');
    items.slice(0, 30).forEach((m) => ul.append(el('li', m)));
    if (items.length > 30) ul.append(el('li', `… og ${items.length - 30} til.`));
    d.append(ul);
  }
  return d;
};

function showPlan(p: PlanFile, name: string, warnings: string[], note?: HTMLElement) {
  const info = $('#file-info');
  info.replaceChildren();
  plan = p;
  applyLayout(p);
  baseName = name.replace(/\.(pdf|json)$/i, '').replace(/_(arbeidsfil|kompakt)$/i, '') || 'skjematisk-plan';
  const s = summarize(p);
  const line = `${name}${s.anonymized ? ' (anonymisert)' : ''}: ${s.lanes} lanes, ${s.boxes} bokser, ${s.milestones} milepæler, ` +
    `${fmtDate(s.start)} til ${fmtDate(s.end)} i ${s.mode === 'week' ? 'uker' : 'måneder'}.`;
  info.append(el('p', line, 'ok small'));
  if (note) info.append(note);
  if (warnings.length) info.append(details(`${warnings.length} ting å se på`, [['', warnings]]));
  info.append(status, suggest, saveStatus);
  for (const id of ['#print', '#save-menu', '#save-work', '#save-share', '#edit', '#update-input']) $<HTMLButtonElement>(id).disabled = false;
  draw();
}

$<HTMLInputElement>('#file-input').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const r = await readPlan(new Uint8Array(await file.arrayBuffer()), file.name);
  if (!r) return;
  editor.reset();
  showPlan(r.plan, file.name, r.warnings);
});

// Oppdater fra Project: velg en ny plan fra Project (.json) når en arbeidsfil er åpen,
// eller arbeidsfilen (.pdf) når en ny plan fra Project er åpen. Redigeringene i arbeidsfilen beholdes.
async function updateFrom(file: File, pdfOnly = false): Promise<boolean> {
  if (!plan) return false;
  const current = plan;
  const currentName = baseName;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (pdfOnly && String.fromCharCode(...bytes.subarray(0, 4)) !== '%PDF') return false;
  const r = await readPlan(bytes, file.name);
  if (!r) return false;
  const { mergePlans, summarizeMerge } = await import('./merge');
  const work = r.isPdf ? r.plan : current;
  const fresh = r.isPdf ? current : r.plan;
  const { plan: merged, report } = mergePlans(work, fresh);
  editor.replacePlan(merged);
  const note = details(summarizeMerge(report), [
    ['Nye bokser:', report.newBoxes],
    ['Borte fra Project:', report.goneBoxes],
    ['Nye lanes:', report.newLanes],
    ['Lanes borte fra Project:', report.goneLanes],
    ['Lanes borte fra Project, men beholdt fordi de har egne bokser:', report.keptLanes],
    ['Project har endret teksten du hadde redigert (teksten fra Project gjelder):', report.textChanged],
    ['Project har flyttet bokser du hadde flyttet (Project gjelder):', report.moveDropped],
  ]);
  note.classList.add('small');
  showPlan(merged, r.isPdf ? file.name : `${currentName}.pdf`, r.warnings, note);
  return true;
}

$<HTMLInputElement>('#update-input').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await updateFrom(file);
});

// Åpnet med «Oppdater i Web»: be om arbeidsfilen med en gang.
const updateDialog = $<HTMLDialogElement>('#update-dialog');
const updateError = $<HTMLElement>('#update-dialog-error');
function askForWorkFile() {
  updateError.hidden = true;
  if (!updateDialog.open) updateDialog.showModal();
}
$<HTMLButtonElement>('#update-skip').addEventListener('click', () => updateDialog.close());
$<HTMLButtonElement>('#update-choose').addEventListener('click', () => $<HTMLInputElement>('#update-pick').click());
$<HTMLInputElement>('#update-pick').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (await updateFrom(file, true)) {
    updateDialog.close();
    return;
  }
  updateError.textContent = `${file.name} er ikke en arbeidsfil fra appen. Velg PDF-en du lagret med «Lagre arbeidsfil».`;
  updateError.hidden = false;
});

function syncControls() {
  document.querySelectorAll<HTMLButtonElement>('[data-orientation]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.orientation === opts.orientation)));
  document.querySelectorAll<HTMLButtonElement>('[data-height]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.height === opts.heightMode)));
  document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === (opts.style ?? 'ny'))));
  $<HTMLInputElement>('#text-size').value = String(opts.textSizePt);
  $<HTMLSelectElement>('#fit-mode').value = opts.fitToSheet ? 'sheet' : 'fixed';
  $<HTMLSelectElement>('#paper').value = opts.paper ?? 'A3';
  $<HTMLInputElement>('#min-text').value = String(opts.minTextPt ?? DEFAULT_MIN_TEXT_PT);
  $<HTMLLabelElement>('#min-text-field').hidden = !opts.fitToSheet;
  $<HTMLElement>('#settings').title = `${sheetName(opts.paper ?? 'A3', opts.orientation)}. Ark, retning, stil, tekst og logo.`;
  $<HTMLInputElement>('#title-size').value = String(opts.titleSizePt ?? DEFAULT_TITLE_PT);
  $<HTMLButtonElement>('#logo-remove').disabled = !plan?.plan.layout.logo;
  $<HTMLInputElement>('#logo-input').disabled = !plan;
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
$<HTMLInputElement>('#title-size').addEventListener('input', (e) => {
  const v = Number((e.target as HTMLInputElement).value.replace(',', '.'));
  if (v >= 8 && v <= 40) {
    opts.titleSizePt = v;
    draw();
  }
});
// Logo: gjøres om til en liten PNG, så arbeidsfilen ikke blir stor og alle bildetyper virker i PDF-en
const LOGO_MAX_PX = 360;
$<HTMLInputElement>('#logo-input').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !plan) return;
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    const w0 = img.naturalWidth || 300;
    const h0 = img.naturalHeight || 100;
    const k = Math.min(1, LOGO_MAX_PX / h0, (LOGO_MAX_PX * 4) / w0);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * k));
    canvas.height = Math.max(1, Math.round(h0 * k));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    plan.plan.layout.logo = { data: canvas.toDataURL('image/png'), aspect: canvas.width / canvas.height };
    syncControls();
    draw();
  } catch {
    saveStatus.textContent = `Kunne ikke lese bildet ${file.name}. Bruk PNG, JPEG eller SVG.`;
    saveStatus.className = 'error small';
  }
});
$<HTMLButtonElement>('#logo-remove').addEventListener('click', () => {
  if (!plan) return;
  delete plan.plan.layout.logo;
  syncControls();
  draw();
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
    style: opts.style ?? 'ny',
    fitToSheet: opts.fitToSheet,
    minTextSize: opts.minTextPt ?? DEFAULT_MIN_TEXT_PT,
    titleSize: opts.titleSizePt ?? DEFAULT_TITLE_PT,
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
// Planen kan komme med i adressen etter # (gzip, base64url), så den åpnes rett fra Project.
// Delen etter # sendes aldri til nettstedet, og den fjernes fra adressen straks den er lest.
async function openFromAddress() {
  const params = new URLSearchParams(location.hash.slice(1));
  const data = params.get('plan');
  if (!data) return;
  history.replaceState(null, '', location.pathname); // også ?t=…, som bare tvinger fram ny henting av appen
  const name = params.get('navn') || 'Plan fra Project.json';
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const packed = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    const r = await readPlan(bytes, name);
    if (!r) return;
    editor.reset();
    showPlan(r.plan, name, r.warnings);
    if (params.get('modus') === 'oppdater') askForWorkFile();
  } catch {
    $('#file-info').replaceChildren(el('p', 'Planen i adressen kunne ikke leses. Prøv Generer Web på nytt, eller åpne planfilen.', 'error'));
  }
}
openFromAddress();
window.addEventListener('hashchange', openFromAddress);

window.addEventListener('beforeprint', () => setPrintPage(opts.paper ?? 'A3', opts.orientation));

draw();
