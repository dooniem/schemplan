// Støtte når planen diskuteres: datoer og detaljer når musen holdes over en boks, og en periode
// (år, måned eller uke) som fremheves ved klikk i kalenderen. Ingenting av dette kommer med i PDF-en.
import type { PlanFile } from './format/types';
import type { Item, Layout } from './layout/layout';
import { bounds } from './editmodel';
import { formatLong, isoWeek, parseIso } from './layout/dates';
import { planRows, type DataRow } from './data/rows';
import { boxMarks, marksLabel, marksMatch, type MarkKind } from './layout/marks';
import { workDayCount } from './layout/workdays';
import { icon, type IconName } from './ctxmenu';

const NS = 'http://www.w3.org/2000/svg';
const ACCENT = '#1F5FBF';

export interface Focus {
  afterDraw(svg: SVGSVGElement, layout: Layout): void;
  /** Ny plan: fjern perioden. */
  reset(): void;
  /** Fagene i fokus (tom når ingen er valgt). */
  readonly trades: string[];
  /** Merkene i fokus (høylytt arbeid, nattarbeid), tom når ingen er valgt. */
  readonly marks: MarkKind[];
  /** Med to merker valgt: bare bokser som har begge. */
  readonly bothMarks: boolean;
  /** «Vis bare disse» er på. */
  readonly onlyTrades: boolean;
}

export interface Period {
  start: string;
  end: string;
  x0: number;
  x1: number;
  label: string;
}

const DAY = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;

/** Varighet i kalenderdager, med start- og sluttdagen. */
export function duration(start: string, finish: string): string {
  const d = days(start, finish);
  return d <= 1 ? '1 dag' : `${d} dager`;
}

/** «48 arbeidsdager», «1 kalenderdag». */
export const dayCount = (n: number, kind: 'arbeidsdag' | 'kalenderdag') => `${n} ${kind}${n === 1 ? '' : 'er'}`;

/** Bokser og milepæler som ligger helt eller delvis i perioden (datoene tas med). */
export function rowsIn(rows: DataRow[], start: string, end: string): DataRow[] {
  return rows.filter((r) => !r.hidden && r.start && r.finish && r.start <= end && r.finish >= start);
}

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
/** Navnet på perioden, ut fra hvor lang den er. */
export function periodLabel(start: string, end: string): string {
  const d = days(start, end);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  if (start.slice(5) === '01-01' && end.slice(5) === '12-31' && start.slice(0, 4) === end.slice(0, 4)) return start.slice(0, 4);
  if (sameMonth && start.slice(8) === '01' && d >= 28) return `${MONTHS[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`;
  // Hele måneder: «april–mai 2028» eller «november 2028–januar 2029»
  const monthEnd = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + DAY).getUTCDate() === 1;
  if (start.slice(8) === '01' && monthEnd(end)) {
    const m = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];
    return start.slice(0, 4) === end.slice(0, 4) ? `${m(start)}–${m(end)} ${end.slice(0, 4)}` : `${m(start)} ${start.slice(0, 4)}–${m(end)} ${end.slice(0, 4)}`;
  }
  if (d === 7 && new Date(`${start}T00:00:00Z`).getUTCDay() === 1) return `uke ${isoWeek(parseIso(start)).week} ${isoWeek(parseIso(start)).year} (${formatLong(start).slice(0, 5)}–${formatLong(end).slice(0, 5)})`;
  return `${formatLong(start)}–${formatLong(end)}`;
}

export function createFocus(
  host: HTMLElement,
  getPlan: () => PlanFile | null,
  bar: HTMLElement,
  isEditing: () => boolean,
): Focus {
  let svg: SVGSVGElement | null = null;
  let L: Layout | null = null;
  let rows = new Map<string, DataRow>();
  let period: Period | null = null;
  let trades = new Set<string>();
  let onlyTrades = false;
  /** Høylytt arbeid og nattarbeid valgt i forklaringen. */
  let marks = new Set<MarkKind>();
  let bothMarks = false;
  /** Faget til hver boks, slik det står i forklaringen. */
  let tradeOf = new Map<string, string>();
  /** Merkene til hver boks. */
  let marksOf = new Map<string, MarkKind[]>();
  const anyPick = () => trades.size > 0 || marks.size > 0;
  /** Boksen er med i utvalget: i et av fagene (når fag er valgt) og med merkene (når merker er valgt). */
  const inPick = (id: string) =>
    (!trades.size || trades.has(tradeOf.get(id) ?? '')) && marksMatch(marksOf.get(id) ?? [], [...marks], bothMarks);

  // ---- Detaljer ved musepeker ----
  const tip = document.createElement('div');
  tip.className = 'tip no-print';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let tipId = '';

  // Kort og stille: bare datoene, og først når musen har holdt seg på boksen en liten stund
  const DELAY_MS = 500;
  const tipFor = (id: string) => {
    const r = rows.get(id);
    if (!r || !r.finish) return null;
    const plan = getPlan();
    const dl = document.createElement('dl');
    const add = (k: string, v: string | Node[]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      if (typeof v === 'string') dd.textContent = v;
      else dd.append(...v);
      dl.append(dt, dd);
    };
    // Én linje per varighet, med symbolet foran: hjelm for arbeidsdager, kalender for kalenderdager
    const line = (ico: IconName, text: string) => {
      const s = document.createElement('span');
      s.className = 'tip-dur';
      s.append(icon(ico, 'tip-ico'), text);
      return s;
    };
    if (r.type === 'Milepæl') add('Dato', formatLong(r.finish));
    else {
      add('Start', formatLong(r.start));
      add('Slutt', formatLong(r.finish));
      if (r.start) {
        const lines: Node[] = [];
        if (plan) lines.push(line('hardhat', dayCount(workDayCount(plan, r.start, r.finish), 'arbeidsdag')));
        lines.push(line('calendar', dayCount(days(r.start, r.finish), 'kalenderdag')));
        add('Varighet', lines);
      }
    }
    if (r.progress) add('Ferdig', r.progress);
    if (r.baseline) add('Baseline', r.baseline);
    if (r.fromProject) add('Oppdatering', r.fromProject);
    return dl;
  };

  let timer = 0;
  let pending = '';
  let last: { x: number; y: number } = { x: 0, y: 0 };
  const hideTip = () => {
    window.clearTimeout(timer);
    pending = '';
    tip.hidden = true;
    tipId = '';
  };
  const place = () => {
    const pad = 12;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = last.x + pad;
    let y = last.y + pad;
    if (x + w > vw - 8) x = last.x - w - pad;
    if (y + h > vh - 8) y = last.y - h - pad;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  };
  host.addEventListener('pointermove', (e) => {
    // Knapp nede (dra eller panorer) eller berøring: ingen detaljer. Leses fra hendelsen selv, så et
    // tapt «slipp» (f.eks. etter høyreklikkmenyen) ikke stopper detaljene for godt.
    if (e.buttons !== 0 || e.pointerType === 'touch') return hideTip();
    const g = (e.target as Element | null)?.closest?.('g[data-id]');
    const id = g?.getAttribute('data-id') ?? '';
    last = { x: e.clientX, y: e.clientY };
    if (!id) return hideTip();
    if (id === tipId) return place();
    if (id === pending) return;
    // Ny boks: skjul den gamle og vent litt før den nye vises
    hideTip();
    pending = id;
    timer = window.setTimeout(() => {
      const content = tipFor(id);
      pending = '';
      if (!content) return;
      tip.replaceChildren(content);
      tip.hidden = false;
      tipId = id;
      place();
    }, DELAY_MS);
  });
  host.addEventListener('pointerleave', hideTip);
  host.addEventListener('pointerdown', hideTip);
  host.addEventListener('wheel', hideTip, { passive: true });
  host.addEventListener('scroll', hideTip, { passive: true });

  // ---- Periode i kalenderen ----
  const toMm = (cx: number, cy: number) => {
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const cellAt = (x: number, y: number) => {
    if (!L) return null;
    for (const row of [...L.calendarTop, ...L.calendarBottom]) {
      if (y < row.y || y > row.y + row.h) continue;
      const c = row.cells.find((c) => x >= c.x0 && x < c.x1);
      if (c) return c;
    }
    return null;
  };
  const endDate = (x1: number) => {
    // Siste dag i cellen: dagen før neste celle starter
    const next = L!.dateAt(x1 + 1e-6);
    const d = new Date(`${next}T00:00:00Z`);
    if (x1 >= L!.plot.x1 - 1e-6) return L!.dateAt(x1 - 1e-3);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  let down: { x: number; y: number } | null = null;
  host.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  host.addEventListener('click', (e) => {
    // Bare et klikk, ikke slutten på en panorering
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || !L) return;
    // Fag i forklaringen (i redigering velger klikket faget for å endre farge i stedet)
    const tradeG = (e.target as Element | null)?.closest?.('g[data-trade]');
    const markG = (e.target as Element | null)?.closest?.('g[data-mark]');
    if ((tradeG || markG) && !isEditing()) {
      const add = e.shiftKey || e.ctrlKey || e.metaKey;
      if (tradeG) {
        const t = tradeG.getAttribute('data-trade')!;
        // Ctrl-, Cmd- eller Shift-klikk legger til eller tar bort et fag
        if (add) trades.has(t) ? trades.delete(t) : trades.add(t);
        else if (trades.size === 1 && trades.has(t) && !marks.size) trades.clear();
        else [trades, marks] = [new Set([t]), new Set()];
      } else {
        // Høylytt arbeid og nattarbeid velges som fagene; Shift-klikk tar med begge
        const m = markG!.getAttribute('data-mark') as MarkKind;
        if (add) marks.has(m) ? marks.delete(m) : marks.add(m);
        else if (marks.size === 1 && marks.has(m) && !trades.size) marks.clear();
        else [trades, marks] = [new Set(), new Set([m])];
      }
      if (marks.size < 2) bothMarks = false;
      if (!anyPick()) onlyTrades = false;
      return paint();
    }
    const p = toMm(e.clientX, e.clientY);
    const c = p && cellAt(p.x, p.y);
    if (!c) return;
    let x0 = c.x0;
    let x1 = c.x1;
    // Shift utvider perioden som allerede er valgt
    if (e.shiftKey && period) {
      x0 = Math.min(x0, period.x0);
      x1 = Math.max(x1, period.x1);
    } else if (period && Math.abs(period.x0 - x0) < 1e-6 && Math.abs(period.x1 - x1) < 1e-6) {
      return setPeriod(null);
    }
    const start = L.dateAt(x0 + 1e-6);
    const end = endDate(x1);
    setPeriod({ start, end, x0, x1, label: periodLabel(start, end) });
  });
  const clearAll = () => {
    period = null;
    trades.clear();
    marks.clear();
    bothMarks = false;
    onlyTrades = false;
    paint();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (period || anyPick()) && !isEditing() && !(e.target as HTMLElement).matches?.('input, textarea, select')) clearAll();
  });

  const setPeriod = (p: Period | null) => {
    period = p;
    paint();
  };

  const rect = (g: Element, a: Record<string, string | number>) => {
    const r = document.createElementNS(NS, 'rect');
    for (const [k, v] of Object.entries(a)) r.setAttribute(k, String(v));
    g.append(r);
    return r;
  };

  /** Finner perioden igjen i kalenderen ut fra datoene, siden arket kan ha endret mål. */
  function placePeriod(): boolean {
    if (!period || !L) return false;
    const cells = [...L.calendarTop, ...L.calendarBottom].flatMap((r) => r.cells);
    const xs0 = cells.filter((c) => L!.dateAt(c.x0 + 1e-6) === period!.start).map((c) => c.x0);
    const xs1 = cells.filter((c) => endDate(c.x1) === period!.end).map((c) => c.x1);
    if (!xs0.length || !xs1.length) return false;
    period.x0 = Math.min(...xs0);
    period.x1 = Math.max(...xs1);
    return true;
  }

  // Fagene som er i fokus. Resten tones ned med CSS, eller skjules med «Vis bare disse»;
  // på skjermen. «Lagre PDF» i linjen lagrer det samme som en PDF for deling.
  function paintTrades() {
    if (!svg) return;
    const on = anyPick();
    svg.querySelectorAll<SVGGElement>('g.items > g[data-id], g.marks > g[data-for]').forEach((g) => {
      g.classList.toggle('focus-out', on && !inPick(g.getAttribute('data-id') ?? g.getAttribute('data-for')!));
    });
    svg.querySelectorAll<SVGGElement>('g[data-trade]').forEach((g) => {
      const t = g.getAttribute('data-trade')!;
      g.classList.toggle('focus-on', on && trades.has(t));
      g.classList.toggle('focus-out', on && !trades.has(t));
    });
    svg.querySelectorAll<SVGGElement>('g[data-mark]').forEach((g) => {
      const m = g.getAttribute('data-mark') as MarkKind;
      g.classList.toggle('focus-on', on && marks.has(m));
      g.classList.toggle('focus-out', on && !marks.has(m));
    });
    host.classList.toggle('focus-only', on && onlyTrades);
  }

  function paint() {
    svg?.querySelector('g.edit-overlay.focus-period')?.remove();
    if (period && !placePeriod()) period = null;
    paintTrades();
    bar.hidden = !period && !anyPick();
    onlyBtn.hidden = !anyPick();
    saveBtn.hidden = !anyPick();
    bothBtn.hidden = marks.size < 2;
    bothBtn.textContent = marks.size > 2 ? 'Bare med alle' : 'Bare med begge';
    bothBtn.setAttribute('aria-pressed', String(bothMarks));
    onlyBtn.setAttribute('aria-pressed', String(onlyTrades));
    onlyBtn.textContent = marks.size ? 'Vis bare disse boksene' : trades.size === 1 ? 'Vis bare dette faget' : 'Vis bare disse fagene';
    if (!svg || !L || bar.hidden) return;

    let all = [...rows.values()].filter((r) => !r.hidden);
    if (anyPick()) all = all.filter((r) => inPick(r.id));
    if (period) all = rowsIn(all, period.start, period.end);

    if (period) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'edit-overlay focus-period');
      g.setAttribute('pointer-events', 'none');
      const { x0, x1 } = period;
      const top = L.calendarTop.length ? L.calendarTop[0].y : L.plot.y0;
      const bottomRows = L.calendarBottom;
      const bottom = bottomRows.length ? bottomRows[bottomRows.length - 1].y + bottomRows[bottomRows.length - 1].h : L.plot.y1;
      // Resten av planen tones ned
      const dim = { fill: '#FFFFFF', 'fill-opacity': 0.62 };
      if (x0 > L.plot.x0) rect(g, { x: L.plot.x0, y: top, width: x0 - L.plot.x0, height: bottom - top, ...dim });
      if (x1 < L.plot.x1) rect(g, { x: x1, y: top, width: L.plot.x1 - x1, height: bottom - top, ...dim });
      rect(g, { x: x0, y: top, width: x1 - x0, height: bottom - top, fill: 'none', stroke: ACCENT, 'stroke-width': 0.5 });
      // Boksene som treffer perioden (og fagene), får ramme rundt hele seg
      const hit = new Set(all.map((r) => r.id));
      for (const it of L.items as Item[]) {
        if (!hit.has(it.id)) continue;
        const b = bounds(it);
        rect(g, { x: b.x0 - 0.4, y: b.y0 - 0.4, width: b.x1 - b.x0 + 0.8, height: b.y1 - b.y0 + 0.8, fill: 'none', stroke: ACCENT, 'stroke-width': 0.35, rx: 0.4 });
      }
      svg.append(g);
    }

    const ms = all.filter((r) => r.type === 'Milepæl').length;
    const boxes = all.length - ms;
    const names = [...trades].map((t) => (t === '(none)' ? 'uten fag' : t));
    const what = [period ? period.label : '', names.length > 3 ? `${names.length} fag` : names.join(', '), marksLabel([...marks], bothMarks, getPlan()?.plan.layout.customMark?.name)].filter(Boolean).join(', ');
    let text = `${what[0].toUpperCase()}${what.slice(1)}: ${boxes} ${boxes === 1 ? 'boks' : 'bokser'}` + (ms ? ` og ${ms} ${ms === 1 ? 'milepæl' : 'milepæler'}` : '');
    if (period && boxes) {
      const starts = all.filter((r) => r.type !== 'Milepæl' && r.start >= period!.start).length;
      const ends = all.filter((r) => r.type !== 'Milepæl' && r.finish <= period!.end).length;
      text += `. ${starts} starter og ${ends} slutter i perioden.`;
    } else text += '.';
    bar.querySelector('.focus-text')!.textContent = text;
  }
  const onlyBtn = bar.querySelector<HTMLButtonElement>('.focus-only-btn')!;
  const saveBtn = bar.querySelector<HTMLButtonElement>('.focus-save')!;
  // Med begge merkene valgt: bokser med ett av dem, eller bare de som har begge
  const bothBtn = bar.querySelector<HTMLButtonElement>('.focus-both-btn')!;
  bothBtn.addEventListener('click', () => {
    bothMarks = !bothMarks;
    paint();
  });
  onlyBtn.addEventListener('click', () => {
    onlyTrades = !onlyTrades;
    paint();
  });
  bar.querySelector<HTMLButtonElement>('.icon')?.addEventListener('click', clearAll);

  return {
    get trades() {
      return [...trades];
    },
    get marks() {
      return [...marks];
    },
    get bothMarks() {
      return bothMarks && marks.size > 1;
    },
    /** «Vis bare disse» er på. */
    get onlyTrades() {
      return onlyTrades && anyPick();
    },
    afterDraw(s, layout) {
      svg = s;
      L = layout;
      const plan = getPlan();
      rows = new Map(plan ? planRows(plan).map((r) => [r.id, r]) : []);
      tradeOf = new Map(plan ? plan.lanes.flatMap((l) => l.boxes.map((b) => [b.id, b.trade ?? b.resolved?.trade ?? ''] as [string, string])) : []);
      marksOf = new Map(plan ? plan.lanes.flatMap((l) => l.boxes.map((b) => [b.id, boxMarks(b, !!plan.plan.layout.customMark)] as [string, MarkKind[]])) : []);
      hideTip();
      paint();
    },
    reset() {
      period = null;
      trades.clear();
      marks.clear();
      bothMarks = false;
      onlyTrades = false;
      hideTip();
      paint();
    },
  };
}
