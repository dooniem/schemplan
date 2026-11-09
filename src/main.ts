import './style.css';
import { checkOutboundBlocked } from './csp';
import { a3Size, renderSheet, type Orientation } from './sheet';
import { summarize, validatePlan } from './format/validate';
import type { PlanFile, StatusLine } from './format/types';
import { setPrintPage } from './print';
import { arrangeLanes, computeLayout, DEFAULT_MIN_TEXT_PT, DEFAULT_TITLE_PT, fitAlternatives, type LayoutOptions } from './layout/layout';
import type { Paper } from './sheet';
import { renderPlan } from './render/svg';
import { canvasMeasure } from './render/measure';
import { createViewer } from './viewer';
import { createSearch } from './search';
import { createEditor } from './editor';
import { createFocus } from './focus';
import type { PdfVariant } from './pdf/export';
import { placePopovers } from './popover';
import { createDataView } from './data/view';
import { cell } from './data/rows';
import { resolveStatus, STATUS_COLORS, STATUS_DEFAULT, statusHelp } from './layout/status';
import { applyLookahead, isoWeekMonday, LOOKAHEAD_DEFAULT, resolveWindow, LOOKAHEAD_MAX_WEEKS, todayIso, weekOf, weeksInIsoYear, type LookaheadWindow } from './layout/lookahead';
import type { Lookahead } from './format/types';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

$('#version').textContent = `v${__APP_VERSION__}`;
$('#help-version').textContent = `Versjon ${__APP_VERSION__}`;
{
  const help = $('#help') as HTMLDialogElement;
  $('#help-open').addEventListener('click', () => help.showModal());
  $('#help-close').addEventListener('click', () => help.close());
  // Klikk utenfor vinduet lukker det
  help.addEventListener('click', (e) => e.target === help && help.close());
}
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
    arrange: (p, laneIds, how) => arrangeLanes(p, opts, measure, laneIds, how),
  },
  host,
  $<HTMLElement>('#panel'),
  $<HTMLButtonElement>('#edit'),
  $<HTMLElement>('#edit-tools'),
);
viewer.setIgnore((e) => editor.owns(e));
const focus = createFocus(host, () => plan, $<HTMLElement>('#focus-bar'), () => editor.active);
const search = createSearch($<HTMLInputElement>('#search'), $('#search-count'), () => plan);
// Datafanen følger planen: tabellen tegnes på nytt etter hver tegning mens den vises
const dataSection = $<HTMLElement>('#data-view');
const dataView = createDataView(dataSection, () => plan, (id) => {
  showView('plan');
  editor.focusBox(id);
  const g = host.querySelector<SVGGElement>(`g.items > g[data-id="${CSS.escape(id)}"]`);
  if (!g) return;
  // Zoom inn til boksen og la en ring pulsere et par sekunder, så den er lett å finne
  viewer.reveal(g);
  const b = g.getBBox();
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [k, v] of Object.entries({ x: b.x - 1.2, y: b.y - 1.2, width: b.width + 2.4, height: b.height + 2.4, rx: 1, class: 'flash-ring' })) ring.setAttribute(k, String(v));
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.setAttribute('class', 'edit-overlay flash');
  layer.setAttribute('pointer-events', 'none');
  layer.append(ring);
  g.ownerSVGElement?.append(layer);
  setTimeout(() => layer.remove(), 2600);
}, () =>
  lookWindow
    ? { start: new Date(lookWindow.start).toISOString().slice(0, 10), end: new Date(lookWindow.end - 86_400_000).toISOString().slice(0, 10), label: lookWindow.label }
    : null,
);
function showView(v: 'plan' | 'data') {
  dataSection.hidden = v !== 'data';
  $<HTMLElement>('.work').hidden = v === 'data';
  $('#view-plan').setAttribute('aria-pressed', String(v === 'plan'));
  $('#view-data').setAttribute('aria-pressed', String(v === 'data'));
  if (v === 'data') dataView.refresh();
}
$('#view-plan').addEventListener('click', () => showView('plan'));
$('#view-data').addEventListener('click', () => showView('data'));
$<HTMLButtonElement>('#data-export').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const msg = $('#data-status');
  const rows = dataView.visibleRows();
  if (!plan || !rows.length) return;
  const name = `${baseName}_data${lookWindow && !$<HTMLElement>('#data-window-field').hidden && $<HTMLInputElement>('#data-window').checked ? `_utkikk-${lookWindow.tag}` : ''}.xlsx`;
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  btn.disabled = true;
  try {
    const { buildXlsx } = await import('./data/xlsx');
    const cols = dataView.columns();
    const bytes = buildXlsx('Data', cols, rows.map((r) => cols.map((c) => cell(r, c.key))));
    const saved = await saveFile(name, new Blob([bytes as BlobPart], { type: mime }), 'Excel-arbeidsbok', mime, '.xlsx');
    if (saved) {
      msg.textContent = `Lagret ${saved} (${rows.length} rader).`;
      msg.className = 'ok small';
    }
  } catch (err) {
    msg.textContent = `Excel-filen ble ikke lagret: ${(err as Error).message}`;
    msg.className = 'error small';
  } finally {
    btn.disabled = false;
  }
});

/** Lagre som-dialog der nettleseren har den, ellers vanlig nedlasting. Gir filnavnet, eller null hvis avbrutt. */
async function saveFile(name: string, blob: Blob, description: string, mime: string, ext: string): Promise<string | null> {
  const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: name, types: [{ description, accept: { [mime]: [ext] } }] });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return handle.name;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      throw e;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return name;
}

const status = el('p', '', 'muted small');
const saveStatus = el('p', '', 'muted small');
const suggest = el('div', '', 'suggest small');
let suggestTimer = 0;
const pt = (v: number) => v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
const sheetName = (paper: Paper, o: string) => `${paper} ${o === 'landscape' ? 'liggende' : 'stående'}`;

// ---- Utkikk ----
let lookWindow: LookaheadWindow | null = null;
/** Planen slik den tegnes: hele, eller bare perioden når utkikken er på. */
function viewOf(p: PlanFile): { plan: PlanFile; window: LookaheadWindow | null; opts: LayoutOptions } {
  const sl = p.plan.layout.statusLine;
  const moment = sl?.on ? resolveStatus(sl, p, todayIso()) : null;
  const o: LayoutOptions = { ...opts, status: moment && sl ? { moment, style: sl } : undefined };
  const r = p.plan.layout.lookahead;
  if (!r?.on) return { plan: p, window: null, opts: o };
  const v = applyLookahead(p, r, todayIso(), moment?.day);
  return { ...v, opts: { ...o, lookahead: v.extras } };
}
const lookRule = (): Lookahead => plan?.plan.layout.lookahead ?? LOOKAHEAD_DEFAULT;
function setLookahead(change: Partial<Lookahead>) {
  if (!plan) return;
  plan.plan.layout.lookahead = { ...lookRule(), ...change };
  // Redigering skjer på hele planen: i utkikken ville en flyttet boks havnet et annet sted
  if (plan.plan.layout.lookahead.on && editor.active) $<HTMLButtonElement>('#edit').click();
  draw();
}
/** Viser regelen i menyen og perioden på knappen. */
function syncLookahead() {
  const r = lookRule();
  const btn = $<HTMLButtonElement>('#lookahead-menu');
  btn.disabled = !plan;
  btn.classList.toggle('on', !!lookWindow);
  $<HTMLElement>('#lookahead-step').hidden = !lookWindow;
  $('#lookahead-label').textContent = lookWindow ? `Utkikk ${lookWindow.tag.replace('u', 'uke ').replace('-', '–')}` : 'Utkikk';
  const edit = $<HTMLButtonElement>('#edit');
  if (plan) {
    edit.disabled = !!lookWindow;
    if (lookWindow) edit.title = 'Slå av utkikken for å redigere. Endringer gjøres i hele planen.';
  }
  const on = $<HTMLInputElement>('#la-on');
  on.checked = r.on;
  on.disabled = !plan;
  const today = weekOf(todayIso());
  const fromWeek = r.from && r.from !== 'status' ? r.from : today;
  const until = 'weeks' in r.length ? null : r.length;
  const weeks = 'weeks' in r.length ? r.length.weeks : null;
  const lenKind = until ? 'until' : weeks === 3 || weeks === 8 ? String(weeks) : 'custom';
  const fromKind = r.from === 'status' ? 'status' : r.from ? 'week' : 'now';
  document.querySelectorAll<HTMLButtonElement>('[data-la-from]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.laFrom === fromKind)));
  document.querySelectorAll<HTMLButtonElement>('[data-la-len]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.laLen === lenKind)));
  $<HTMLElement>('#la-from-week').hidden = fromKind !== 'week';
  const slOn = !!plan?.plan.layout.statusLine?.on;
  const statusBtn = $<HTMLButtonElement>('[data-la-from="status"]');
  statusBtn.title = slOn ? 'Uken statuslinjen står i. Følger med når statusdatoen endres.' : 'Uken statuslinjen står i. Statuslinjen er av, så denne uken brukes. Slå den på under Innstillinger.';
  $<HTMLElement>('#la-len-custom').hidden = lenKind !== 'custom';
  $<HTMLElement>('#la-len-until').hidden = lenKind !== 'until';
  // Feltene oppdateres ikke mens brukeren skriver i dem
  const put = (id: string, v: number) => {
    const i = $<HTMLInputElement>(id);
    if (document.activeElement !== i) i.value = String(v);
  };
  put('#la-from-w', fromWeek.week);
  put('#la-from-y', fromWeek.year);
  put('#la-len-n', weeks ?? 3);
  const preview = plan ? (lookWindow ?? viewOf({ ...plan, plan: { ...plan.plan, layout: { ...plan.plan.layout, lookahead: { ...r, on: true } } } }).window) : null;
  // Uten valgt sluttuke foreslås den siste uken i perioden som vises
  const untilDefault = until ?? (preview ? weekOf(new Date(preview.end - 86_400_000).toISOString().slice(0, 10)) : fromWeek);
  put('#la-until-w', untilDefault.week);
  put('#la-until-y', untilDefault.year);
  $<HTMLInputElement>('#la-prev').checked = r.prevWeek;
  $<HTMLInputElement>('#la-empty').checked = r.hideEmptyLanes;
  $<HTMLInputElement>('#la-overview').checked = r.showOverview !== false;
  for (const id of ['#la-prev', '#la-empty', '#la-overview']) $<HTMLInputElement>(id).disabled = !plan;
  const period = preview ? `${preview.label.charAt(0).toLowerCase()}${preview.label.slice(1)} (${preview.weeks === 1 ? '1 uke' : `${preview.weeks} uker`})` : '';
  // Alt om perioden står samlet under av/på: hva som tegnes, og hvorfor den er flyttet
  // Bare grunnen (f.eks. «Planen starter uke 10 2027.»); lengden står allerede i teksten
  const why = preview?.note ? ` ${preview.note.split('. ')[0].replace(/\.?$/, '.')}` : r.from === 'status' && !slOn ? ' Statuslinjen er av, så perioden starter denne uken.' : '';
  $('#la-summary').textContent = !preview
    ? 'Åpne en plan først.'
    : r.on
      ? `På. Tegner ${period}.${why} Resten av planen er bare skjult, ingenting er slettet.`
      : `Av. Hele planen vises. Slår du den på, tegnes ${period}.${why}`;
}
$<HTMLInputElement>('#la-on').addEventListener('change', (e) => setLookahead({ on: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('#la-prev').addEventListener('change', (e) => setLookahead({ on: true, prevWeek: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('#la-empty').addEventListener('change', (e) => setLookahead({ hideEmptyLanes: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('#la-overview').addEventListener('change', (e) => setLookahead({ showOverview: (e.target as HTMLInputElement).checked }));
/** Uke og år fra to felt, eller null om uken ikke finnes. */
function readWeek(wId: string, yId: string): { year: number; week: number } | null {
  const week = Number($<HTMLInputElement>(wId).value);
  const year = Number($<HTMLInputElement>(yId).value);
  if (!Number.isInteger(week) || !Number.isInteger(year) || year < 1900 || year > 2200 || week < 1 || week > weeksInIsoYear(year)) return null;
  return { year, week };
}
document.querySelectorAll<HTMLButtonElement>('[data-la-from]').forEach((b) =>
  b.addEventListener('click', () => {
    const cur = lookRule().from;
    if (b.dataset.laFrom === 'now') setLookahead({ on: true, from: null });
    else if (b.dataset.laFrom === 'status') setLookahead({ on: true, from: 'status' });
    else setLookahead({ on: true, from: cur && cur !== 'status' ? cur : weekOf(lookWindow ? new Date(lookWindow.start).toISOString().slice(0, 10) : todayIso()) });
    if (b.dataset.laFrom === 'week') $<HTMLInputElement>('#la-from-w').focus();
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-la-len]').forEach((b) =>
  b.addEventListener('click', () => {
    const k = b.dataset.laLen!;
    if (k === '3' || k === '8') setLookahead({ on: true, length: { weeks: Number(k) } });
    else if (k === 'custom') {
      const n = Number($<HTMLInputElement>('#la-len-n').value);
      setLookahead({ on: true, length: { weeks: Number.isInteger(n) && n >= 1 && n <= LOOKAHEAD_MAX_WEEKS && n !== 3 && n !== 8 ? n : 4 } });
      $<HTMLInputElement>('#la-len-n').focus();
    } else {
      const w = readWeek('#la-until-w', '#la-until-y');
      if (w) setLookahead({ on: true, length: w });
      $<HTMLInputElement>('#la-until-w').focus();
    }
  }),
);
$<HTMLInputElement>('#la-from-w').addEventListener('input', fromInput);
$<HTMLInputElement>('#la-from-y').addEventListener('input', fromInput);
function fromInput() {
  const w = readWeek('#la-from-w', '#la-from-y');
  if (w) setLookahead({ on: true, from: w });
}
$<HTMLInputElement>('#la-len-n').addEventListener('input', (e) => {
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isInteger(n) && n >= 1 && n <= LOOKAHEAD_MAX_WEEKS) setLookahead({ on: true, length: { weeks: n } });
});
const untilInput = () => {
  const w = readWeek('#la-until-w', '#la-until-y');
  if (w) setLookahead({ on: true, length: w });
};
$<HTMLInputElement>('#la-until-w').addEventListener('input', untilInput);
$<HTMLInputElement>('#la-until-y').addEventListener('input', untilInput);
// Bla uke for uke: perioden flyttes, og lengden beholdes. Startuken blir da en fast uke.
function stepWeeks(n: number) {
  const r = lookRule();
  if (!plan || !lookWindow) return;
  const from = lookWindow.start + (r.prevWeek ? 7 : 0) * 86_400_000;
  const shift = (t: number) => weekOf(new Date(t + n * 7 * 86_400_000).toISOString().slice(0, 10));
  const next: Lookahead = { ...r, from: shift(from), length: 'weeks' in r.length ? r.length : shift(isoWeekMonday(r.length.year, r.length.week)) };
  // Ved starten eller slutten av planen står perioden stille
  const moved = resolveWindow(next, plan, todayIso()).start - lookWindow.start;
  if (moved * n <= 0) return;
  setLookahead(next);
}
$<HTMLButtonElement>('#lookahead-prev').addEventListener('click', () => stepWeeks(-1));
$<HTMLButtonElement>('#lookahead-next').addEventListener('click', () => stepWeeks(1));
// Dagen kan ha skiftet siden planen ble tegnet («denne uken» følger dagens dato)
$<HTMLElement>('#menu-lookahead').addEventListener('beforetoggle', (e) => {
  if ((e as ToggleEvent).newState === 'open') syncLookahead();
});

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
  // Utkikk: en kopi av planen der kalenderen bare dekker perioden
  const view = viewOf(plan);
  lookWindow = view.window;
  const layout = computeLayout(view.plan, view.opts, measure);
  const svg = renderPlan(layout);
  shown = { layout, svg };
  viewer.show(svg, layout.width, layout.height);
  editor.afterDraw(svg, layout);
  search.afterDraw(svg);
  focus.afterDraw(svg, layout);
  if (!dataSection.hidden) dataView.refresh();
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
  if (lookWindow) status.textContent = `Utkikk: ${lookWindow.label.toLowerCase()}.${lookWindow.note ? ` ${lookWindow.note}` : ''} ${status.textContent}`;
  syncLookahead();

  // Forslag til annet ark når planen er trang. Regnes ut litt etterpå, så tegningen ikke venter.
  // De gamle forslagene står til de nye er klare: tømmes linjen imens, endrer arket høyde og
  // visningen hopper ved hver endring.
  window.clearTimeout(suggestTimer);
  if (!tight && layout.textScale >= 0.999) {
    showSuggestions([], false);
    return;
  }
  const current = plan;
  const currentView = view.plan;
  suggestTimer = window.setTimeout(() => {
    if (plan !== current) return;
    // Beste retning per ark, og et større ark bare når det gir større tekst enn et mindre
    const order: Paper[] = ['A3', 'A2', 'A1'];
    const alts = fitAlternatives(currentView, view.opts, measure).filter((a) => a.fits && a.textSizePt > layout.textSizePt + 0.2);
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
  // A4 er aldri standard: en ny plan fra Project starter på A3 selv om forrige plan var A4
  opts.paper = lay.paper ?? (opts.paper === 'A4' ? 'A3' : opts.paper);
  opts.style = lay.style ?? 'ny';
  if (lay.fitToSheet !== undefined) opts.fitToSheet = lay.fitToSheet;
  if (lay.minTextSize !== undefined) opts.minTextPt = lay.minTextSize;
  opts.titleSizePt = lay.titleSize ?? DEFAULT_TITLE_PT;
  opts.showLegend = lay.showLegend ?? p.plan.options.legend;
  opts.showBottomCalendar = lay.showBottomCalendar ?? p.plan.calendar.bottomCalendar;
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
  for (const id of ['#print', '#save-menu', '#save-work', '#save-share', '#edit', '#search', '#view-data']) $<HTMLButtonElement>(id).disabled = false;
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
  search.reset();
  focus.reset();
  showPlan(r.plan, file.name, r.warnings);
});

// Oppdater fra Project: en ny plan fra Project er åpen, og redigeringene hentes fra
// arbeidsfilen (.pdf) brukeren velger. Redigeringene i arbeidsfilen beholdes.
async function updateFrom(file: File): Promise<boolean> {
  if (!plan) return false;
  const current = plan;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== '%PDF') return false;
  const r = await readPlan(bytes, file.name);
  if (!r) return false;
  const { mergePlans, summarizeMerge } = await import('./merge');
  const { plan: merged, report } = mergePlans(r.plan, current);
  editor.replacePlan(merged);
  const note = details(summarizeMerge(report), [
    ['Nye bokser:', report.newBoxes],
    ['Borte fra Project:', report.goneBoxes],
    ['Nye lanes:', report.newLanes],
    ['Lanes borte fra Project:', report.goneLanes],
    ['Lanes borte fra Project, men beholdt fordi de har egne bokser:', report.keptLanes],
    ['Project har endret teksten du hadde redigert (teksten fra Project gjelder):', report.textChanged],
    ['Project har flyttet bokser du hadde flyttet (Project gjelder):', report.moveDropped],
    ['Project har endret navnet på lanes du hadde gitt nytt navn (navnet fra Project gjelder):', report.laneNameChanged],
  ]);
  note.classList.add('small');
  showPlan(merged, file.name, r.warnings, note);
  return true;
}

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
  if (await updateFrom(file)) {
    updateDialog.close();
    return;
  }
  updateError.textContent = `${file.name} er ikke en arbeidsfil fra appen. Velg PDF-en du lagret med «Lagre arbeidsfil».`;
  updateError.hidden = false;
});

// ---- Statuslinje ----
const statusRule = (): StatusLine => plan?.plan.layout.statusLine ?? STATUS_DEFAULT;
function setStatus(change: Partial<StatusLine>) {
  if (!plan) return;
  plan.plan.layout.statusLine = { ...statusRule(), ...change };
  syncStatus();
  draw();
}
const slColors = $<HTMLElement>('#sl-colors');
for (const [c, name] of STATUS_COLORS) {
  const b = el('button', '', 'swatch') as HTMLButtonElement;
  b.type = 'button';
  b.dataset.slColor = c;
  b.style.background = c;
  b.title = name;
  b.setAttribute('aria-label', name);
  b.addEventListener('click', () => setStatus({ color: c }));
  slColors.append(b);
}
function syncStatus() {
  const r = statusRule();
  const on = $<HTMLInputElement>('#sl-on');
  on.checked = r.on;
  on.disabled = !plan;
  $<HTMLElement>('#sl-details').hidden = !r.on || !plan;
  const hasProject = !!plan && !!resolveStatus({ ...r, source: 'project' }, plan, todayIso());
  document.querySelectorAll<HTMLButtonElement>('[data-sl-source]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.slSource === r.source)));
  $<HTMLButtonElement>('[data-sl-source="project"]').title = hasProject ? 'Statusdatoen som er satt i Project' : 'Planen har ingen statusdato fra Project ennå';
  $<HTMLElement>('#sl-date-row').hidden = r.source !== 'custom';
  const d = $<HTMLInputElement>('#sl-date');
  if (document.activeElement !== d) d.value = r.date ?? '';
  $('#sl-help').textContent = plan ? statusHelp(r, resolveStatus(r, plan, todayIso()), plan) : '';
  document.querySelectorAll<HTMLButtonElement>('[data-sl-width]').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.slWidth) - r.width) < 0.01)));
  slColors.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.slColor?.toUpperCase() === r.color.toUpperCase())));
  $<HTMLInputElement>('#sl-label').checked = r.label;
}
$<HTMLInputElement>('#sl-on').addEventListener('change', (e) => setStatus({ on: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>('#sl-label').addEventListener('change', (e) => setStatus({ label: (e.target as HTMLInputElement).checked }));
document.querySelectorAll<HTMLButtonElement>('[data-sl-source]').forEach((b) =>
  b.addEventListener('click', () => {
    const source = b.dataset.slSource as StatusLine['source'];
    if (source === 'custom') {
      // Første gang: dagen streken står på nå, så den ikke hopper
      const now = plan ? resolveStatus(statusRule(), plan, todayIso()) : null;
      setStatus({ source, date: statusRule().date ?? now?.day ?? todayIso() });
      $<HTMLInputElement>('#sl-date').focus();
    } else setStatus({ source });
  }),
);
$<HTMLInputElement>('#sl-date').addEventListener('change', (e) => {
  const v = (e.target as HTMLInputElement).value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setStatus({ source: 'custom', date: v });
});
document.querySelectorAll<HTMLButtonElement>('[data-sl-width]').forEach((b) => b.addEventListener('click', () => setStatus({ width: Number(b.dataset.slWidth) })));

function syncControls() {
  syncStatus();
  document.querySelectorAll<HTMLButtonElement>('[data-orientation]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.orientation === opts.orientation)));
  document.querySelectorAll<HTMLButtonElement>('[data-height]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.height === opts.heightMode)));
  document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === (opts.style ?? 'ny'))));
  $<HTMLInputElement>('#text-size').value = String(opts.textSizePt);
  document.querySelectorAll<HTMLButtonElement>('[data-fit]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.fit === 'sheet') === opts.fitToSheet)));
  document.querySelectorAll<HTMLButtonElement>('[data-paper]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.paper === (opts.paper ?? 'A3'))));
  $<HTMLInputElement>('#show-legend').checked = opts.showLegend ?? plan?.plan.options.legend ?? true;
  $<HTMLInputElement>('#show-bottom-cal').checked = opts.showBottomCalendar ?? plan?.plan.calendar.bottomCalendar ?? false;
  $<HTMLInputElement>('#show-legend').disabled = !plan;
  $<HTMLInputElement>('#show-bottom-cal').disabled = !plan;
  $<HTMLInputElement>('#min-text').value = String(opts.minTextPt ?? DEFAULT_MIN_TEXT_PT);
  $<HTMLLabelElement>('#min-text-field').hidden = !opts.fitToSheet;
  $<HTMLElement>('#settings').title = `${sheetName(opts.paper ?? 'A3', opts.orientation)}. Ark, visning, tekst og logo.`;
  $<HTMLInputElement>('#title-size').value = String(opts.titleSizePt ?? DEFAULT_TITLE_PT);
  const logo = plan?.plan.layout.logo;
  $<HTMLButtonElement>('#logo-remove').disabled = !logo;
  const preview = $<HTMLImageElement>('#logo-preview');
  if (logo) preview.src = logo.data;
  else preview.removeAttribute('src');
  preview.hidden = !logo;
  $<HTMLElement>('#logo-empty').hidden = !!logo;
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
document.querySelectorAll<HTMLButtonElement>('[data-fit]').forEach((btn) =>
  btn.addEventListener('click', () => {
    opts.fitToSheet = btn.dataset.fit === 'sheet';
    syncControls();
    draw();
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-paper]').forEach((btn) =>
  btn.addEventListener('click', () => {
    opts.paper = btn.dataset.paper as Paper;
    syncControls();
    draw();
  }),
);
$<HTMLInputElement>('#show-legend').addEventListener('change', (e) => {
  opts.showLegend = (e.target as HTMLInputElement).checked;
  draw();
});
$<HTMLInputElement>('#show-bottom-cal').addEventListener('change', (e) => {
  opts.showBottomCalendar = (e.target as HTMLInputElement).checked;
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
/** Navnene på fagene i fokus, slik de står i forklaringen. */
const tradeNames = (t: string[]) => t.map((x) => (x === '(none)' ? 'Uten fag' : x));
async function save(variant: PdfVariant, btn: HTMLButtonElement, onlyTrades: string[] = []) {
  if (!plan || !shown) return;
  const fileTag = onlyTrades.length ? `_${tradeNames(onlyTrades).join('_').replace(/[\\/:*?"<>|\s]+/g, '-')}` : '';
  // Utkikken får perioden i filnavnet, så den ikke forveksles med hele planen
  const lookTag = lookWindow ? `_utkikk-${lookWindow.tag}` : '';
  const name = `${baseName}${SUFFIX[variant]}${lookTag}${fileTag}.pdf`;
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
    showLegend: opts.showLegend ?? plan.plan.options.legend,
    showBottomCalendar: opts.showBottomCalendar ?? plan.plan.calendar.bottomCalendar,
  });
  btn.disabled = true;
  saveStatus.textContent = 'Lager PDF …';
  saveStatus.className = 'muted small';
  try {
    // Velg fil først, mens klikket fortsatt gjelder (nettleseren krever det for Lagre som-dialogen)
    const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    const handle = picker ? await picker({ suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] }) : null;
    const { exportPdf } = await import('./pdf/export');
    // Bare valgte fag: planen tegnes på nytt uten de andre boksene, med fagene i overskriften
    let target = shown;
    if (onlyTrades.length) {
      const keep = new Set(onlyTrades);
      for (const l of saved.lanes) for (const b of l.boxes) if (!keep.has(b.resolved?.trade ?? '')) b.hidden = true;
      saved.plan.title = `${saved.plan.title} – ${tradeNames(onlyTrades).join(', ')}`;
      const v = viewOf(saved);
      const layout = computeLayout(v.plan, v.opts, measure);
      target = { layout, svg: renderPlan(layout) };
    }
    const pdf = await exportPdf(target.layout, target.svg, saved, variant, __APP_VERSION__);
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
$<HTMLButtonElement>('#save-trades').addEventListener('click', (e) => save('deling', e.currentTarget as HTMLButtonElement, focus.trades));
// Valget for bare valgte fag vises når et fag er i fokus
$<HTMLElement>('#menu-save').addEventListener('beforetoggle', (e) => {
  if ((e as ToggleEvent).newState !== 'open') return;
  const t = focus.trades;
  $<HTMLButtonElement>('#save-trades').hidden = !t.length || !plan;
  $('#save-trades-text').textContent = `Bare ${tradeNames(t).join(', ')}. Vanlig PDF til deling, uten de andre fagene.`;
});
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
    search.reset();
    focus.reset();
    showPlan(r.plan, name, r.warnings);
    if (params.get('modus') === 'oppdater') askForWorkFile();
  } catch {
    $('#file-info').replaceChildren(el('p', 'Planen i adressen kunne ikke leses. Prøv Generer Web på nytt, eller åpne planfilen.', 'error'));
  }
}
// Appen bygger på nettleserfunksjoner som kom i 2023–2024. I eldre nettlesere sier vi det
// rett ut i stedet for at menyer og knapper ikke gjør noe.
const missing = [
  !('popover' in HTMLElement.prototype) && 'menyer (Popover)',
  typeof DecompressionStream === 'undefined' && '«Generer Web» fra Project (DecompressionStream)',
  !CSS.supports('selector(:has(a))') && 'deler av utseendet (:has)',
  !CSS.supports('color', 'color-mix(in srgb, red, blue)') && 'farger (color-mix)',
].filter(Boolean);
if (missing.length) {
  const note = el('p', `Nettleseren er for gammel for noe av appen: ${missing.join(', ')} virker ikke. Oppdater nettleseren, eller bruk en nyere versjon av Edge, Chrome, Firefox eller Safari.`, 'compat-note no-print');
  note.setAttribute('role', 'alert');
  document.querySelector('.topbar')?.after(note);
}
openFromAddress();
window.addEventListener('hashchange', openFromAddress);

// ---- Installert app ----
// Service workeren lagrer bare appens egne filer, så den kan startes uten nett (se sw-template.js)
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
// Nettleseren sier fra når appen kan installeres; da vises knappen i Hjelp
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let installPrompt: InstallPrompt | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as InstallPrompt;
  $<HTMLElement>('#help-install').hidden = false;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  $<HTMLElement>('#help-install').hidden = true;
});
$<HTMLButtonElement>('#install-app').addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $<HTMLElement>('#help-install').hidden = true;
});
// Åpne med → Skjematisk plan: filen kommer inn her når appen er installert
type LaunchQueue = { setConsumer: (fn: (p: { files: FileSystemFileHandle[] }) => void) => void };
(window as unknown as { launchQueue?: LaunchQueue }).launchQueue?.setConsumer(async (p) => {
  const handle = p.files[0];
  if (!handle) return;
  const file = await handle.getFile();
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = $<HTMLInputElement>('#file-input');
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
});

window.addEventListener('beforeprint', () => setPrintPage(opts.paper ?? 'A3', opts.orientation));

draw();
