import type { Box, Lane, PlanFile, TradeColor } from '../format/types';
import { parseBoxText, splitLines } from '../format/text';
import { isDrawable } from '../format/validate';
import { sheetSize, type Orientation, type Paper } from '../sheet';
import { buildTimeAxis, type TimeAxis } from './calendar';
import { addDays, formatShort, MONTHS_NB, parseIso, toIso } from './dates';
import { LINE_HEIGHT, PT_TO_MM, widest, wrapLines, type Measure } from './text';
import { autoTextColor, derivedBorder } from './color';
import { criticalLine, CRITICAL_DEFAULT, type CriticalLine } from './critical';

export interface LayoutOptions {
  orientation: Orientation;
  heightMode: 'fill' | 'compact';
  /** Skriftstørrelse i punkter på det ferdige A3-arket. */
  textSizePt: number;
  /** true: krymp teksten til planen får plass, men ikke under minTextPt. false: fast tekststørrelse. */
  fitToSheet: boolean;
  /** Nedre grense for krymping, i punkter. Standard 6. */
  minTextPt?: number;
  /** Arkstørrelse. Standard A3. */
  paper?: Paper;
  /** 'excel' etterligner den gamle utskriften, 'ny' er lesbarhetsforslaget. */
  style?: PlanStyle;
  /** Overskriftens størrelse i punkter. Følger ikke krympingen av resten av teksten. Standard 16. */
  titleSizePt?: number;
}

export const DEFAULT_TITLE_PT = 16;

export type PlanStyle = 'excel' | 'ny';

export interface TextBlock {
  x: number;
  y: number; // grunnlinje for første linje
  lines: string[];
  size: number; // mm
  color: string;
  anchor: 'start' | 'middle' | 'end';
  bold?: boolean;
  /** Fet skrift per linje (overstyrer bold). */
  boldLines?: boolean[];
  rotate?: 0 | 90 | -90;
}

export interface BoxItem {
  kind: 'box';
  id: string;
  x0: number;
  x1: number;
  y: number;
  h: number;
  fill: string;
  border: string | null;
  text: TextBlock | null;
  /** leader: punkter x0,y0,x1,y1,… fra innsiden av boksen til streken foran teksten. */
  callout: { box: { x: number; y: number; w: number; h: number }; text: TextBlock; leader: number[] } | null;
  arrowLeft: boolean;
  arrowRight: boolean;
  /** Høyden teksten krever, før en høyde valgt i appen. */
  minH?: number;
  /** Overskriftsboks: tegnes bak de andre, og andre bokser kan ligge inne i den. */
  header?: boolean;
}

export interface MilestoneItem {
  kind: 'milestone';
  id: string;
  x: number;
  y: number; // senter
  size: number;
  symbol: 'diamond' | 'flag';
  color: string;
  label: TextBlock;
  labelBox: { x: number; y: number; w: number; h: number };
  verticalLine: boolean;
}

export type Item = BoxItem | MilestoneItem;

export interface CalendarRow {
  y: number;
  h: number;
  cells: { x0: number; x1: number; label: string; strong: boolean; fill: string }[];
  size: number;
  /** Månedsnavn skrives loddrett, slik Excel gjør. */
  rotate: boolean;
}

export interface LaneLayout {
  id: string;
  y0: number;
  y1: number;
  fill: string | null;
  title: TextBlock;
  /** Øverste plass for bokser (y0 + luft). */
  top: number;
  /** Laveste høyde lanen kan få uten at noe kuttes. */
  minH: number;
  /** Høyden er valgt i appen. */
  manual: boolean;
}

/** Bakgrunnsstriper i planområdet: annenhver måned litt mørkere. */
export interface Band {
  x0: number;
  x1: number;
  fill: string;
}

export interface LegendEntry {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  border: string | null;
  textColor: string;
  /** Faget oppføringen viser (ikke for symboler). */
  trade?: string;
  label: TextBlock;
  /** Symbolforklaring i stedet for fagfarge (bare i ny stil). */
  symbol?: 'diamond' | 'flag' | 'holiday';
}

export interface Layout {
  width: number;
  height: number;
  margin: number;
  textScale: number;
  textSizePt: number;
  title: TextBlock;
  subtitle: TextBlock;
  plot: { x0: number; x1: number; y0: number; y1: number };
  laneTitleX: number;
  calendarTop: CalendarRow[];
  calendarBottom: CalendarRow[];
  lanes: LaneLayout[];
  grid: { x: number; strong: boolean; month: boolean }[];
  bands: Band[];
  holidays: { x0: number; x1: number }[];
  items: Item[];
  legend: LegendEntry[];
  /** Planen er høyere enn arket, selv etter krymping. */
  overflow: boolean;
  /** Teksten måtte krympes under valgt minimum for at alt skulle få plass. */
  belowMin: boolean;
  style: PlanStyle;
  /** Datoen (ÅÅÅÅ-MM-DD) som starter ved x, til nye bokser. */
  dateAt(x: number): string;
  /** Logo øverst til venstre, i mm. */
  logo: { x: number; y: number; w: number; h: number; href: string } | null;
  /** Kritisk linje gjennom de merkede boksene, eller null. */
  critical: CriticalLine | null;
  /** Én tekstlinje i mm. Høyder og plasser valgt i appen lagres i tekstlinjer, så de følger tekststørrelsen. */
  unit: number;
}

const MARGIN = 8;
const PAD_X = 0.7;
const PAD_Y = 0.25; // Excel har lite luft over og under teksten
const GAP = 0; // Excel stabler boksene kant i kant

export const MILESTONE_COLORS: Record<string, { fill: string; text: string }> = {
  red: { fill: '#FF0000', text: '#FFFFFF' },
  yellow: { fill: '#FCF600', text: '#000000' },
  green: { fill: '#008000', text: '#FFFFFF' },
  blue: { fill: '#0033CC', text: '#FFFFFF' },
  orange: { fill: '#FFA500', text: '#000000' },
  black: { fill: '#000000', text: '#FFFFFF' },
};

interface Variant {
  item: Item;
  fx0: number;
  fx1: number;
  h: number;
}

interface Piece extends Variant {
  sortX: number;
  sortW: number;
  /** Alternative plasseringer (callout til høyre/venstre, på én eller flere linjer). Den første er standard. */
  alts?: Variant[];
  /** Fast plass i lanen (mm fra toppen), valgt i appen. */
  lock?: number;
  /** Overskriftsboks: bare tekstfeltet øverst (mm) stenger for bokser med fast plass. */
  band?: number;
}

/**
 * Som pack, men hver brikke kan ha flere varianter. Velger varianten som ender lavest i lanen,
 * og ved likt den med smalest fotavtrykk, så den sperrer minst for de neste brikkene.
 */
export function packVariants(pieces: { alts: { fx0: number; fx1: number; h: number }[]; lock?: number; band?: number }[], gap = GAP): { y: number; k: number }[] {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  // Overskriftsbokser: for bokser med fast plass er det bare tekstfeltet øverst som er opptatt
  const inner: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const lowest = (p: { fx0: number; fx1: number; h: number }, from = 0, locked = false) => {
    const overlapping = (locked ? inner : placed).filter((q) => p.fx0 < q.x1 - 1e-6 && q.x0 < p.fx1 - 1e-6);
    const candidates = [from, ...overlapping.map((q) => q.y1 + gap)].filter((c) => c >= from - 1e-6).sort((a, b) => a - b);
    return candidates.find((c) => overlapping.every((q) => c + p.h <= q.y0 + 1e-6 || c >= q.y1 + gap - 1e-6)) ?? from;
  };
  const out: { y: number; k: number }[] = new Array(pieces.length);
  // Brikker med fast plass legges først, så de andre pakkes rundt dem
  const order = pieces.map((_, i) => i);
  // Overskriftsbokser først ved lik plass, så boksene inne i dem legges oppå
  const locked = order.filter((i) => pieces[i].lock !== undefined).sort((a, b) => pieces[a].lock! - pieces[b].lock! || (pieces[b].band !== undefined ? 1 : 0) - (pieces[a].band !== undefined ? 1 : 0));
  const free = order.filter((i) => pieces[i].lock === undefined);
  for (const i of [...locked, ...free]) {
    const p = pieces[i];
    let best = { y: 0, k: 0, score: Infinity, w: Infinity };
    p.alts.forEach((v, k) => {
      const y = lowest(v, p.lock ?? 0, p.lock !== undefined);
      const score = y + v.h;
      const w = v.fx1 - v.fx0;
      if (score < best.score - 1e-6 || (Math.abs(score - best.score) <= 1e-6 && w < best.w - 1e-6)) best = { y, k, score, w };
    });
    const v = p.alts[best.k];
    placed.push({ x0: v.fx0, x1: v.fx1, y0: best.y, y1: best.y + v.h });
    inner.push({ x0: v.fx0, x1: v.fx1, y0: best.y, y1: best.y + (p.band ?? v.h) });
    out[i] = { y: best.y, k: best.k };
  }
  return out;
}

/** Plasserer brikker i en lane: hver brikke legges så høyt som mulig uten å overlappe. */
export function pack(pieces: { fx0: number; fx1: number; h: number }[], gap = GAP): number[] {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  return pieces.map((p) => {
    const overlapping = placed.filter((q) => p.fx0 < q.x1 - 1e-6 && q.x0 < p.fx1 - 1e-6);
    const candidates = [0, ...overlapping.map((q) => q.y1 + gap)].sort((a, b) => a - b);
    const y = candidates.find((c) => overlapping.every((q) => c + p.h <= q.y0 + 1e-6 || c >= q.y1 + gap - 1e-6)) ?? 0;
    placed.push({ x0: p.fx0, x1: p.fx1, y0: y, y1: y + p.h });
    return y;
  });
}

export const DEFAULT_MIN_TEXT_PT = 6;
/** Lenger ned krymper vi aldri, heller ikke for å få plass. */
export const ABS_MIN_TEXT_PT = 3;

/**
 * Tegner planen. Med fitToSheet finner den største tekststørrelsen (i trinn på 0,25 pt) mellom
 * minTextPt og valgt størrelse der planen får plass. Får den ikke plass ved minTextPt, krympes
 * teksten videre (ned til ABS_MIN_TEXT_PT) og merkes belowMin, så hele planen alltid er synlig
 * og appen kan foreslå annet ark. Bare om den ikke får plass selv da, merkes den overflow.
 */
export function computeLayout(file: PlanFile, opts: LayoutOptions, measure: Measure): Layout {
  const full = layoutAt(file, opts, measure, 1);
  if (!opts.fitToSheet || !full.overflow) return full;
  const STEP = 0.25;
  const minPt = Math.min(opts.textSizePt, opts.minTextPt ?? DEFAULT_MIN_TEXT_PT);
  const at = (pt: number) => layoutAt(file, opts, measure, pt / opts.textSizePt);
  let lo = Math.ceil(minPt / STEP);
  let hi = Math.floor(opts.textSizePt / STEP) - 1;
  const floor = at(lo * STEP);
  if (floor.overflow) {
    // Hellere liten tekst enn en plan som kuttes: krymp videre under minimum, og merk det
    let a = Math.ceil(ABS_MIN_TEXT_PT / STEP);
    let b = lo - 1;
    const bottom = at(a * STEP);
    if (bottom.overflow) return { ...bottom, belowMin: true };
    let best = bottom;
    while (a < b) {
      const mid = Math.ceil((a + b + 1) / 2);
      const L = at(mid * STEP);
      if (L.overflow) b = mid - 1;
      else {
        a = mid;
        best = L;
      }
    }
    return { ...best, belowMin: true };
  }
  let best = floor;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    const L = at(mid * STEP);
    if (L.overflow) hi = mid - 1;
    else {
      lo = mid;
      best = L;
    }
  }
  return best;
}

/** Hvor stor teksten blir med andre ark, til forslag når planen er trang. */
export function fitAlternatives(file: PlanFile, opts: LayoutOptions, measure: Measure): { paper: Paper; orientation: Orientation; textSizePt: number; fits: boolean }[] {
  const out: { paper: Paper; orientation: Orientation; textSizePt: number; fits: boolean }[] = [];
  for (const paper of ['A3', 'A2', 'A1'] as Paper[])
    for (const orientation of ['landscape', 'portrait'] as Orientation[]) {
      if (paper === (opts.paper ?? 'A3') && orientation === opts.orientation) continue;
      const L = computeLayout(file, { ...opts, paper, orientation, fitToSheet: true }, measure);
      out.push({ paper, orientation, textSizePt: L.textSizePt, fits: !L.overflow && !L.belowMin });
    }
  return out;
}

function layoutAt(file: PlanFile, opts: LayoutOptions, measure: Measure, scale: number): Layout {
  const { width: W, height: H } = sheetSize(opts.paper ?? 'A3', opts.orientation);
  const ny = opts.style === 'ny';
  const base = opts.textSizePt * PT_TO_MM * scale;
  const lh = base * LINE_HEIGHT;
  // Fagfarger fra appen går foran fargene fra Project
  const tc = file.plan.layout.tradeColors ?? {};
  const fileColors: TradeColor[] = file.colors.map((c) => (tc[c.name] ? { ...c, fill: tc[c.name].fill, text: tc[c.name].text ?? autoTextColor(tc[c.name].fill) } : c));
  const colors = new Map<string, TradeColor>(fileColors.map((c) => [c.name, c]));
  const noneColor = colors.get('(none)') ?? { name: '(none)', fill: '#FFFAC8', border: '#000000', text: '#000000' };

  // ---- Overskrift ----
  // Overskriften har fast størrelse, som i Excel uten «Skaler med dokument»
  const titleSize = (opts.titleSizePt ?? DEFAULT_TITLE_PT) * PT_TO_MM;
  const lg = file.plan.layout.logo;
  const logoH = lg ? Math.max(titleSize * 1.2, 6) : 0;
  const headerH = Math.max(titleSize * 1.4, logoH + 1.5);
  const title: TextBlock = { x: W / 2, y: MARGIN + headerH / 2 + titleSize * 0.35, lines: [file.plan.title], size: titleSize, color: '#000000', anchor: 'middle', bold: true };
  const logo = lg ? { x: MARGIN, y: MARGIN + (headerH - 1.5 - logoH) / 2, w: Math.min(logoH * lg.aspect, W / 3), h: Math.min(logoH, W / 3 / lg.aspect), href: lg.data } : null;

  // ---- Lane-kolonnen: bred nok til at ingen ord deles, inntil 30 mm for hele titler, aldri over 40 mm ----
  const lanes = file.lanes.filter((l) => l.shown && !l.hidden);
  const titlePad = 2 * PAD_X + 2;
  // "|" i lane-navnet er linjeskift, som i boksteksten
  const laneRaw = lanes.map((l) => splitLines(l.name));
  const longestWord = Math.max(0, ...laneRaw.flat().flatMap((t) => t.split(/\s+/).map((w) => measure(w, base, true))));
  const widestName = Math.max(0, ...laneRaw.flat().map((t) => measure(t, base, true)));
  const LANE_TITLE_W = Math.min(40, Math.max(18, longestWord + titlePad, Math.min(widestName + titlePad, 30)));
  // Luft i lanene følger tekststørrelsen
  const LANE_PAD = Math.max(0.5, base * 0.3);

  // ---- Tidsakse ----
  const laneTitleX = MARGIN;
  const x0 = MARGIN + LANE_TITLE_W;
  const x1 = W - MARGIN;
  const axis = buildTimeAxis(file.plan.calendar, x0, x1);
  const calSize = base * 0.9;
  const rowH = calSize * 1.8;
  // Månedsvisning: loddrette månedsnavn, raden må være høy nok til "Mai"/"Des"
  const colW = axis.columns.length ? (axis.x1 - axis.x0) / axis.columns.length : 0;
  // Ny stil: vannrette månedsnavn når de får plass
  const rotateMonths = axis.mode === 'month' && !(ny && measure('Aug', calSize, true) + 1.5 <= colW);
  const monthRowH = rotateMonths ? Math.max(rowH, measure('Aug', calSize, true) + 2.5) : rowH;
  const calH = axis.mode === 'month' ? rowH + monthRowH : rowH * 3;
  const bottomCal = file.plan.calendar.bottomCalendar;

  // ---- Bokser og milepæler per lane ----
  const lanePieces = lanes.map((lane) => buildPieces(lane, file, axis, base, lh, measure, colors, noneColor, ny));

  // ---- Lane-titler og innholdshøyde ----
  const titleLines = laneRaw.map((raw) => wrapLines(raw, LANE_TITLE_W - titlePad, base, measure, true));
  const contentH = lanes.map((_, i) => {
    const pieces = lanePieces[i];
    const placed = packVariants(pieces.map((p) => ({ alts: p.alts ?? [p], lock: p.lock, band: p.band })));
    pieces.forEach((p, j) => {
      const v = (p.alts ?? [p])[placed[j].k];
      Object.assign(p, { item: v.item, fx0: v.fx0, fx1: v.fx1, h: v.h });
      setY(p.item, placed[j].y);
    });
    const inner = pieces.reduce((m, p, j) => Math.max(m, placed[j].y + p.h), 0);
    return Math.max(inner + 2 * LANE_PAD, titleLines[i].length * lh + 2 * LANE_PAD, lh * 1.5);
  });
  // Lane med høyde valgt i appen: aldri lavere enn innholdet krever
  const minH = contentH.slice();
  lanes.forEach((l, i) => {
    if (l.height) contentH[i] = Math.max(minH[i], l.height * lh);
  });

  // ---- Legend ----
  const usedTrades = new Set<string>();
  lanePieces.flat().forEach((p) => p.item.kind === 'box' && usedTrades.add((p.item as BoxItem & { trade?: string }).trade ?? ''));
  // Som overskriften krymper ikke bunnteksten (legend og dato) når planen skaleres ned
  // for å få plass, ellers blir den uleselig på store planer
  const legendSize = opts.textSizePt * PT_TO_MM * Math.max(scale, 1) * (ny ? 1 : 0.85);
  const legendEntries: LegendEntry[] = [];
  let legendH = 0;
  if (file.plan.options.legend) {
    const sw = legendSize * 2.2;
    const sh = legendSize * 1.3;
    const rowStep = legendSize * 2;
    // Plass til datoen nede til høyre
    const lxMax = x1 - measure('00.00.0000', legendSize) - 6;
    let lx = MARGIN;
    let row = 0;
    const symbolEntries: { name: string; symbol: 'diamond' | 'flag' | 'holiday' }[] = ny
      ? [
          // Ruter og flagg betyr ulike ting fra plan til plan, så de navngis ikke i legenden
          ...(file.holidays.length ? [{ name: 'Ferie', symbol: 'holiday' as const }] : []),
        ]
      : [];
    const tradeEntries = fileColors.filter((c) => usedTrades.has(c.name));
    const entries = [...tradeEntries.map((c) => ({ c, symbol: undefined, trade: c.name as string | undefined })), ...symbolEntries.map((e) => ({ c: { name: e.name, fill: '#FFFFFF', border: null, text: '#000000' } as TradeColor, symbol: e.symbol, trade: undefined }))];
    for (const { c, symbol, trade } of entries) {
      const name = ny && c.name === '(none)' ? 'Uten fag' : c.name;
      const w = sw + 1.5 + measure(name, legendSize) + 5;
      if (lx + w > lxMax && lx > MARGIN) {
        lx = MARGIN;
        row++;
      }
      legendEntries.push({
        x: lx,
        y: row * rowStep,
        w: sw,
        h: sh,
        fill: c.fill ?? '#FFFFFF',
        border: ny ? derivedBorder(c.fill ?? '#FFFFFF') : c.border,
        textColor: c.text ?? '#000000',
        symbol,
        trade,
        label: { x: lx + sw + 1.5, y: row * rowStep + sh * 0.8, lines: [name], size: legendSize, color: '#000000', anchor: 'start' },
      });
      lx += w;
    }
    if (legendEntries.length) legendH = (row + 1) * rowStep + 2;
  }
  if (!legendH) legendH = legendSize * 2 + 2; // datoen nede til høyre

  // ---- Høydebudsjett ----
  const plotTop = MARGIN + headerH + calH;
  const fixedBottom = (bottomCal ? calH : 0) + legendH + MARGIN;
  const avail = H - plotTop - fixedBottom;
  const natural = contentH.reduce((a, b) => a + b, 0);
  const overflow = natural > avail + 1e-6;
  // Ledig plass fordeles på lanene med automatisk høyde
  const autoCount = lanes.filter((l) => !l.height).length;
  const extra = opts.heightMode === 'fill' && !overflow && autoCount ? (avail - natural) / autoCount : 0;

  const laneLayouts: LaneLayout[] = [];
  let y = plotTop;
  const items: Item[] = [];
  lanes.forEach((lane, i) => {
    const h = contentH[i] + (lane.height ? 0 : extra);
    const y0 = y;
    lanePieces[i].forEach((p) => {
      offsetY(p.item, y0 + LANE_PAD);
      items.push(p.item);
    });
    const tl = titleLines[i];
    laneLayouts.push({
      id: lane.id,
      y0,
      y1: y0 + h,
      fill: lane.fill,
      top: y0 + LANE_PAD,
      minH: minH[i],
      manual: !!lane.height,
      title: {
        x: laneTitleX + LANE_TITLE_W / 2,
        y: y0 + h / 2 - ((tl.length - 1) * lh) / 2 + base * 0.35,
        lines: tl,
        size: base,
        color: '#000000',
        anchor: 'middle',
        bold: true,
      },
    });
    y += h;
  });
  // Overskriftsbokser tegnes først, så boksene inne i dem ligger oppå
  const isHeader = (i: Item) => (i.kind === 'box' && i.header ? 0 : 1);
  items.sort((a, b) => isHeader(a) - isHeader(b));
  const plotBottom = y;

  // ---- Kalenderrader ----
  const calendarTop = calendarRows(axis, plotTop - calH, rowH, monthRowH, calSize, measure, false, rotateMonths, ny);
  const calendarBottom = bottomCal ? calendarRows(axis, plotBottom, rowH, monthRowH, calSize, measure, true, rotateMonths, ny) : [];
  const legendTop = plotBottom + (bottomCal ? calH : 0) + 2;
  const legend = legendEntries.map((e) => ({
    ...e,
    y: e.y + legendTop,
    label: { ...e.label, y: e.label.y + legendTop },
  }));
  const legendSizeMm = legendSize;
  const subtitle: TextBlock = {
    x: x1,
    y: legendTop + legendSizeMm * 1.3 * 0.8,
    lines: [formatLong(file.exportedAt.slice(0, 10))],
    size: legendSizeMm,
    color: '#000000',
    anchor: 'end',
    bold: true,
  };

  // ---- Rutenett og ferier ----
  const grid = axis.columns.slice(1).map((c, i) => ({
    x: c.x0,
    // Kraftig strek ved årsskifte. I ukesvisning får månedsskiftene en tynn strek.
    strong: c.year !== axis.columns[i].year,
    month: axis.mode === 'week' && c.monthLabel !== axis.columns[i].monthLabel,
  }));
  const bands: Band[] = monthBands(axis, ny);
  const holidays = file.holidays
    .map((h) => ({ s: parseIso(h.start), e: parseIso(h.end) }))
    .filter((h) => h.e >= axis.start && h.s < axis.end)
    .map((h) => ({ x0: axis.xStart(Math.max(h.s, axis.start)), x1: axis.xEnd(Math.min(h.e, addDays(axis.end, -1))) }));

  return {
    width: W,
    height: H,
    margin: MARGIN,
    textScale: scale,
    textSizePt: opts.textSizePt * scale,
    title,
    subtitle,
    plot: { x0, x1, y0: plotTop, y1: plotBottom },
    laneTitleX,
    calendarTop,
    calendarBottom,
    lanes: laneLayouts,
    grid,
    bands,
    holidays,
    items,
    legend,
    overflow,
    belowMin: false,
    style: ny ? 'ny' : 'excel',
    logo,
    critical: criticalLine(items, new Set(lanes.flatMap((l) => l.boxes.filter((b) => b.critical).map((b) => b.id))), file.plan.layout.criticalLine ?? CRITICAL_DEFAULT),
    unit: lh,
    dateAt(x: number) {
      let best = axis.start;
      for (let t = axis.start; t < axis.end; t = addDays(t, 1)) {
        if (axis.xStart(t) <= x + 1e-9) best = t;
        else break;
      }
      return toIso(best);
    },
  };
}

function setY(item: Item, y: number) {
  if (item.kind === 'box') {
    const dy = y - item.y;
    item.y = y;
    if (item.text) item.text.y += dy;
    if (item.callout) {
      item.callout.box.y += dy;
      item.callout.text.y += dy;
      for (let k = 1; k < item.callout.leader.length; k += 2) item.callout.leader[k] += dy;
    }
  } else {
    const top = Math.min(item.y - item.size / 2, item.labelBox.y);
    const dy = y - top;
    item.y += dy;
    item.labelBox.y += dy;
    item.label.y += dy;
  }
}

/** Gjør boksen høyere, med teksten (og callouten) midt i. */
function grow(it: BoxItem, target: number) {
  const d = it.header ? 0 : (target - it.h) / 2;
  it.h = target;
  if (it.text) it.text.y += d;
  if (it.callout) {
    it.callout.box.y += d;
    it.callout.text.y += d;
    for (let k = 1; k < it.callout.leader.length; k += 2) it.callout.leader[k] += d;
  }
}

const offsetY = (item: Item, dy: number) => setY(item, (item.kind === 'box' ? item.y : Math.min(item.y - item.size / 2, item.labelBox.y)) + dy);

function buildPieces(
  lane: Lane,
  file: PlanFile,
  axis: TimeAxis,
  base: number,
  lh: number,
  measure: Measure,
  colors: Map<string, TradeColor>,
  noneColor: TradeColor,
  ny = false,
): Piece[] {
  const pieces: Piece[] = [];
  const calloutMax = Math.max(15, file.plan.layout.calloutMaxWidthCm * 6);

  for (const box of lane.boxes) {
    if (!box.shown || box.hidden || !box.resolved || !isDrawable(box.resolved, { ...file, plan: { ...file.plan, calendar: { ...file.plan.calendar, mode: 'month' } } })) continue;
    const r = box.resolved;
    const { lines: rawLines, forcedCallout } = parseBoxText(box.text);
    const s = parseIso(r.start);
    const f = parseIso(r.finish);

    if (r.isMilestone) {
      pieces.push(milestonePiece(box, rawLines, r.finish, axis.xEnd(f), base, lh, measure, calloutMax, axis.x1, axis.x0));
      continue;
    }

    const c = colors.get(r.trade) ?? noneColor;
    // Farge valgt i appen går foran fagets farge
    const fill = box.fill ?? c.fill ?? '#FFFFFF';
    // Ny stil, eller egen farge: svart eller hvit tekst etter kontrast. Kant i mørkere utgave av fyllet.
    const textColor = box.textColor ?? (ny || box.fill ? autoTextColor(fill) : (c.text ?? '#000000'));
    const bx0 = axis.xStart(Math.max(s, axis.start));
    const bx1 = Math.max(bx0 + 0.6, axis.xEnd(Math.min(f, addDays(axis.end, -1))));
    const w = bx1 - bx0;
    const item: BoxItem & { trade: string } = {
      kind: 'box',
      id: box.id,
      trade: r.trade,
      x0: bx0,
      x1: bx1,
      y: 0,
      h: 0,
      fill,
      border: ny || box.fill ? derivedBorder(fill) : c.border,
      text: null,
      callout: null,
      arrowLeft: s < axis.start,
      arrowRight: f >= axis.end,
    };

    // Brukerens valg går foran forslaget. "*" først i teksten (fra Excel) betyr callout.
    const choice = box.callout ?? 'auto';
    // Overskriftsboks: teksten står alltid øverst i boksen, aldri i callout
    let useCallout = !box.header && (choice === 'on' || (choice === 'auto' && forcedCallout));
    const neverCallout = choice === 'off' || !!box.header;
    let lines: string[] = [];
    if (!useCallout && box.rotation !== 0) {
      // Rotert tekst: én linje per tekstlinje, boksen blir høy nok til teksten
      lines = rawLines;
      item.h = widest(lines, base, measure) + 2 * PAD_Y + 1;
      item.text = { x: bx0 + w / 2, y: item.h / 2, lines, size: base, color: textColor, anchor: 'middle', rotate: box.rotation };
      pieces.push({ item, fx0: bx0, fx1: bx1, h: item.h, sortX: bx0, sortW: w });
      continue;
    }
    if (!useCallout) {
      const inner = Math.max(w - 2 * PAD_X, 0.5);
      // Callout bare når teksten faktisk ikke får plass, ikke ut fra en fast bredde,
      // så like bokser med samme tekst behandles likt
      const longestWord = Math.max(...rawLines.flatMap((l) => l.split(/\s+/)).map((wd) => measure(wd, base)));
      if (inner < longestWord && !neverCallout) useCallout = true;
      else {
        lines = wrapLines(rawLines, inner, base, measure);
        const h = lines.length * lh + 2 * PAD_Y;
        // Callout når boksen er smal i forhold til teksten, eller et ord må deles for å få plass
        const words = new Set(rawLines.join(' ').split(/\s+/));
        const brokeWord = lines.some((l) => l.split(/\s+/).some((wd) => wd && !words.has(wd)));
        if ((w / h < 0.25 || brokeWord) && !neverCallout) useCallout = true;
        else {
          item.h = h;
          item.text = { x: bx0 + w / 2, y: PAD_Y + base * 0.85, lines, size: base, color: textColor, anchor: 'middle' };
        }
      }
    }

    if (useCallout) {
      item.h = lh + 2 * PAD_Y;
      const make = (side: 'right' | 'left', maxW: number): Variant => {
        const cl = wrapLines(rawLines, maxW, base, measure);
        const cw = widest(cl, base, measure) + 2 * PAD_X;
        const ch = cl.length * lh + 2 * PAD_Y;
        const cx = side === 'right' ? bx1 + 2 : bx0 - 2 - cw;
        const it: BoxItem & { trade: string } = { ...item, callout: null };
        it.callout = {
          box: { x: cx, y: 0, w: cw, h: ch },
          text: { x: cx + PAD_X, y: PAD_Y + base * 0.85, lines: cl, size: base, color: '#000000', anchor: 'start' },
          leader: ny
            ? side === 'right'
              ? [bx1, item.h / 2, cx, item.h / 2]
              : [bx0, item.h / 2, cx + cw, item.h / 2]
            : calloutLeader(bx0, bx1, item.h, side === 'right' ? cx : cx + cw, side),
        };
        return { item: it, fx0: Math.min(bx0, cx), fx1: Math.max(bx1, cx + cw), h: Math.max(item.h, ch) };
      };
      // Varianter: høyre eller venstre, vanlig bredde eller på én linje (inntil dobbel bredde)
      const alts: Variant[] = [];
      const sides = box.calloutSide === 'left' ? (['left'] as const) : box.calloutSide === 'right' ? (['right'] as const) : (['right', 'left'] as const);
      for (const side of sides)
        for (const maxW of [calloutMax, calloutMax * 2]) {
          const v = make(side, maxW);
          if (v.fx0 < axis.x0 - 1e-6 || v.fx1 > axis.x1 + 1e-6) continue;
          if (maxW > calloutMax && alts.some((a) => a.h <= v.h + 1e-6 && a.fx1 - a.fx0 <= v.fx1 - v.fx0 + 1e-6)) continue;
          alts.push(v);
        }
      if (!alts.length) alts.push(make(sides.length === 1 ? sides[0] : bx1 + 2 + calloutMax <= axis.x1 ? 'right' : 'left', calloutMax));
      pieces.push({ ...alts[0], alts, sortX: bx0, sortW: w });
    } else {
      pieces.push({ item, fx0: bx0, fx1: bx1, h: item.h, sortX: bx0, sortW: w });
    }
  }

  // Høyde og plass valgt i appen
  const byId = new Map(lane.boxes.map((b) => [b.id, b]));
  for (const p of pieces) {
    const box = byId.get(p.item.id);
    if (!box) continue;
    if (box.top !== undefined) p.lock = box.top * lh;
    if (p.item.kind !== 'box') continue;
    if (box.header) {
      (p.item as BoxItem).header = true;
      // Uten tekst stenger bare kanten øverst
      p.band = box.text.trim() ? p.item.h : PAD_Y * 2;
    }
    const target = (box.height ?? 0) * lh;
    for (const v of p.alts ?? [p]) {
      const it = v.item as BoxItem;
      it.minH = it.h;
      if (target > it.h) {
        grow(it, target);
        v.h = Math.max(v.h, it.h, it.callout ? it.callout.box.y + it.callout.box.h : 0);
      }
    }
    if (p.alts) Object.assign(p, { item: p.alts[0].item, h: p.alts[0].h });
  }

  // Tidligst først, lengst først ved lik start
  return pieces.sort((a, b) => a.sortX - b.sortX || b.sortW - a.sortW);
}

function milestonePiece(
  box: Box,
  rawLines: string[],
  finishIso: string,
  x: number,
  base: number,
  lh: number,
  measure: Measure,
  calloutMax: number,
  rightLimit: number,
  leftLimit: number,
): Piece {
  const style = { ...(box.milestone ?? { symbol: 'diamond', color: 'blue', showDate: true, verticalLine: false }), ...box.milestoneStyle };
  const color = MILESTONE_COLORS[style.color] ?? MILESTONE_COLORS.blue;
  const size = base * 1.6;
  const flag = style.symbol === 'flag';
  // Excel: datoen i vanlig skrift, teksten fet for rutermilepæler
  const textLines = wrapLines(rawLines, calloutMax, base, measure, !flag);
  const lines = [...(style.showDate ? [formatShort(finishIso)] : []), ...textLines];
  const boldLines = [...(style.showDate ? [false] : []), ...textLines.map(() => !flag)];
  const lw = Math.max(widest(lines.filter((_, i) => !boldLines[i]), base, measure), widest(lines.filter((_, i) => boldLines[i]), base, measure, true)) + 2 * PAD_X;
  const lhTot = lines.length * lh + 2 * PAD_Y;
  // Flagg: stangen står på datoen og teksten rett til høyre. Ruter: teksten litt til høyre for symbolet.
  // Teksten kan også stå til venstre når det gir lavere plassering i lanen.
  const right = flag ? x + 0.4 : x + size / 2 + 1.5;
  // Til venstre for et flagg må teksten gå klar av duken, som vaier mot venstre
  const left = flag ? x - size * 1.25 - 0.4 - lw : x - size / 2 - 1.5 - lw;
  const h = Math.max(size, lhTot);
  const sx0 = flag ? x - size * 1.25 : x - size / 2;
  const make = (lx: number): Variant => {
    const item: MilestoneItem = {
    kind: 'milestone',
    id: box.id,
    x,
    y: size / 2,
    size,
    symbol: style.symbol === 'flag' ? 'flag' : 'diamond',
    color: color.fill,
    label: { x: lx + PAD_X, y: PAD_Y + base * 0.85, lines, boldLines, size: base, color: '#000000', anchor: 'start' },
    labelBox: { x: lx, y: 0, w: lw, h: lhTot },
    verticalLine: !!style.verticalLine,
    };
    return { item, fx0: Math.min(sx0, lx), fx1: Math.max(x + size / 2, lx + lw), h };
  };
  const alts = [right, left].filter((lx) => lx >= leftLimit - 1e-6 && lx + lw <= rightLimit + 1e-6).map(make);
  if (!alts.length) alts.push(make(right + lw <= rightLimit ? right : left));
  return { ...alts[0], alts, sortX: sx0, sortW: 0 };
}

const MONTH_DARK = '#B4B4B4';
const MONTH_LIGHT = '#F7F7F7';
const BAND_DARK = '#EBEBEB';
const BAND_LIGHT = '#F7F7F7';
const monthIndex = (label: string) => Math.max(0, MONTHS_NB.indexOf(label));

/** Annenhver måned mørk (jan, mar, mai …) i planområdet. */
function monthBands(axis: TimeAxis, ny = false): Band[] {
  const bands: Band[] = [];
  for (const c of axis.columns) {
    // Ny stil i ukesvisning: annenhver uke, etter ukenummeret
    const shadeOn = ny && axis.mode === 'week' ? Number(c.label) % 2 === 1 : monthIndex(c.monthLabel) % 2 === 0;
    const fill = ny ? (shadeOn ? '#F3F3F3' : '#FFFFFF') : monthIndex(c.monthLabel) % 2 === 0 ? BAND_DARK : BAND_LIGHT;
    const last = bands[bands.length - 1];
    if (last && last.fill === fill && Math.abs(last.x1 - c.x0) < 1e-6) last.x1 = c.x1;
    else bands.push({ x0: c.x0, x1: c.x1, fill });
  }
  return bands;
}

/** Strek fra innsiden av boksen, ut til siden og bort til streken foran callout-teksten. */
function calloutLeader(bx0: number, bx1: number, h: number, tx: number, side: 'right' | 'left'): number[] {
  const w = bx1 - bx0;
  const reach = Math.min(w * 0.7, 6);
  if (side === 'right') {
    const inX = Math.max(bx0 + 0.3, bx1 - reach);
    return [inX, h * 0.62, bx1 + 0.8, h * 0.4, tx, h * 0.5];
  }
  const inX = Math.min(bx1 - 0.3, bx0 + reach);
  return [inX, h * 0.62, bx0 - 0.8, h * 0.4, tx, h * 0.5];
}

function calendarRows(
  axis: TimeAxis,
  top: number,
  rowH: number,
  monthRowH: number,
  size: number,
  measure: Measure,
  bottom: boolean,
  rotateMonths = true,
  ny = false,
): CalendarRow[] {
  // Ny stil: lysere veksling, men fortsatt annenhvert år, annenhver måned og annenhver uke
  const DARK = ny ? '#E4E4E4' : MONTH_DARK;
  const LIGHT = ny ? '#FFFFFF' : MONTH_LIGHT;
  const YEAR_A = ny ? '#D9D9D9' : MONTH_DARK;
  const YEAR_B = ny ? '#F0F0F0' : MONTH_DARK;
  const group = (key: (c: (typeof axis.columns)[number]) => string) => {
    const cells: CalendarRow['cells'] = [];
    for (const c of axis.columns) {
      const k = key(c);
      const last = cells[cells.length - 1];
      if (last && last.label === k && last.x1 === c.x0) last.x1 = c.x1;
      else cells.push({ x0: c.x0, x1: c.x1, label: k, strong: true, fill: DARK });
    }
    return cells;
  };
  const fitLabel = (cells: CalendarRow['cells'], rotated = false) =>
    cells.map((c) => {
      const w = rotated ? monthRowH - 1.5 : c.x1 - c.x0 - 0.6;
      if (rotated && c.x1 - c.x0 < size * 1.1) return { ...c, label: '' };
      if (measure(c.label, size) <= w) return c;
      if (measure(c.label.slice(0, 1), size) <= w) return { ...c, label: c.label.slice(0, 1) };
      return { ...c, label: '' };
    });

  const years = fitLabel(group((c) => String(c.year)).map((c, i) => ({ ...c, fill: i % 2 === 0 ? YEAR_A : YEAR_B })));
  const shade = (label: string) => (monthIndex(label) % 2 === 0 ? DARK : LIGHT);
  const rows: { cells: CalendarRow['cells']; h: number; rotate: boolean; size: number }[] =
    axis.mode === 'month'
      ? [
          { cells: years, h: rowH, rotate: false, size: size * 1.15 },
          {
            cells: fitLabel(axis.columns.map((c) => ({ x0: c.x0, x1: c.x1, label: c.label, strong: true, fill: shade(c.label) })), rotateMonths),
            h: monthRowH,
            rotate: rotateMonths,
            size,
          },
        ]
      : [
          { cells: years, h: rowH, rotate: false, size: size * 1.15 },
          {
            cells: fitLabel(group((c) => `${c.monthLabel}|${c.year}`).map((c) => ({ ...c, label: c.label.split('|')[0], fill: shade(c.label.split('|')[0]) }))),
            h: rowH,
            rotate: false,
            size,
          },
          {
            // Ny stil: annenhver uke. Excel-lik: ukene får månedens farge.
            cells: fitLabel(axis.columns.map((c) => ({ x0: c.x0, x1: c.x1, label: c.label, strong: false, fill: ny ? (Number(c.label) % 2 === 1 ? '#F0F0F0' : '#FFFFFF') : shade(c.monthLabel) }))),
            h: rowH,
            rotate: false,
            size,
          },
        ];
  const ordered = bottom ? [...rows].reverse() : rows;
  let y = top;
  return ordered.map((r) => {
    const row = { y, h: r.h, cells: r.cells, size: r.size, rotate: r.rotate };
    y += r.h;
    return row;
  });
}

/** dd.mm.åååå */
function formatLong(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
