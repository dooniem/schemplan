import type { Box, Lane, PlanFile, TradeColor } from '../format/types';
import { parseBoxText } from '../format/text';
import { isDrawable } from '../format/validate';
import { a3Size, type Orientation } from '../sheet';
import { buildTimeAxis, type TimeAxis } from './calendar';
import { addDays, formatShort, MONTHS_NB, parseIso } from './dates';
import { LINE_HEIGHT, PT_TO_MM, widest, wrapLines, type Measure } from './text';
import { autoTextColor, derivedBorder } from './color';

export interface LayoutOptions {
  orientation: Orientation;
  heightMode: 'fill' | 'compact';
  /** Skriftstørrelse i punkter på det ferdige A3-arket. */
  textSizePt: number;
  /** Krymp teksten til planen får plass på arket. */
  fitToSheet: boolean;
  /** 'excel' etterligner VBA-utskriften, 'ny' er lesbarhetsforslaget. */
  style?: PlanStyle;
}

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
  style: PlanStyle;
}

const MARGIN = 8;
const LANE_TITLE_W = 30;
const PAD_X = 0.7;
const PAD_Y = 0.25; // Excel har lite luft over og under teksten
const GAP = 0; // Excel stabler boksene kant i kant
const LANE_PAD = 1.2;

const MILESTONE_COLORS: Record<string, { fill: string; text: string }> = {
  red: { fill: '#FF0000', text: '#FFFFFF' },
  yellow: { fill: '#FCF600', text: '#000000' },
  green: { fill: '#008000', text: '#FFFFFF' },
  blue: { fill: '#0033CC', text: '#FFFFFF' },
  orange: { fill: '#FFA500', text: '#000000' },
  black: { fill: '#000000', text: '#FFFFFF' },
};

interface Piece {
  item: Item;
  fx0: number;
  fx1: number;
  h: number;
  sortX: number;
  sortW: number;
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

export function computeLayout(file: PlanFile, opts: LayoutOptions, measure: Measure): Layout {
  if (!opts.fitToSheet) return layoutAt(file, opts, measure, 1);
  let best = layoutAt(file, opts, measure, 1);
  for (let f = 0.95; best.overflow && f >= 0.45; f -= 0.05) best = layoutAt(file, opts, measure, f);
  return best;
}

function layoutAt(file: PlanFile, opts: LayoutOptions, measure: Measure, scale: number): Layout {
  const { width: W, height: H } = a3Size(opts.orientation);
  const ny = opts.style === 'ny';
  const base = opts.textSizePt * PT_TO_MM * scale;
  const lh = base * LINE_HEIGHT;
  const colors = new Map<string, TradeColor>(file.colors.map((c) => [c.name, c]));
  const noneColor = colors.get('(none)') ?? { name: '(none)', fill: '#FFFAC8', border: '#000000', text: '#000000' };

  // ---- Overskrift ----
  const titleSize = base * 1.5;
  const title: TextBlock = { x: W / 2, y: MARGIN + titleSize * 0.85, lines: [file.plan.title], size: titleSize, color: '#000000', anchor: 'middle', bold: true };
  const headerH = titleSize * 1.4;

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
  const lanes = file.lanes.filter((l) => l.shown);
  const lanePieces = lanes.map((lane) => buildPieces(lane, file, axis, base, lh, measure, colors, noneColor, ny));

  // ---- Lane-titler og innholdshøyde ----
  const titleLines = lanes.map((l) => wrapLines([l.name], LANE_TITLE_W - 2 * PAD_X - 2, base, measure, true));
  const contentH = lanes.map((_, i) => {
    const pieces = lanePieces[i];
    const ys = pack(pieces);
    pieces.forEach((p, j) => setY(p.item, ys[j]));
    const inner = pieces.reduce((m, p, j) => Math.max(m, ys[j] + p.h), 0);
    return Math.max(inner + 2 * LANE_PAD, titleLines[i].length * lh + 2 * LANE_PAD, lh * 2);
  });

  // ---- Legend ----
  const usedTrades = new Set<string>();
  lanePieces.flat().forEach((p) => p.item.kind === 'box' && usedTrades.add((p.item as BoxItem & { trade?: string }).trade ?? ''));
  const legendSize = base * (ny ? 1 : 0.85);
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
    const tradeEntries = file.colors.filter((c) => usedTrades.has(c.name));
    const entries = [...tradeEntries.map((c) => ({ c, symbol: undefined })), ...symbolEntries.map((e) => ({ c: { name: e.name, fill: '#FFFFFF', border: null, text: '#000000' } as TradeColor, symbol: e.symbol }))];
    for (const { c, symbol } of entries) {
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
  const extra = opts.heightMode === 'fill' && !overflow && lanes.length ? (avail - natural) / lanes.length : 0;

  const laneLayouts: LaneLayout[] = [];
  let y = plotTop;
  const items: Item[] = [];
  lanes.forEach((lane, i) => {
    const h = contentH[i] + extra;
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
      title: {
        x: ny ? laneTitleX + PAD_X + 1 : laneTitleX + LANE_TITLE_W / 2,
        y: y0 + h / 2 - ((tl.length - 1) * lh) / 2 + base * 0.35,
        lines: tl,
        size: base,
        color: '#000000',
        anchor: ny ? 'start' : 'middle',
        bold: true,
      },
    });
    y += h;
  });
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
    style: ny ? 'ny' : 'excel',
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
    if (!box.shown || !box.resolved || !isDrawable(box.resolved, { ...file, plan: { ...file.plan, calendar: { ...file.plan.calendar, mode: 'month' } } })) continue;
    const r = box.resolved;
    const { lines: rawLines, forcedCallout } = parseBoxText(box.text);
    const s = parseIso(r.start);
    const f = parseIso(r.finish);

    if (r.isMilestone) {
      pieces.push(milestonePiece(box, rawLines, r.finish, axis.xEnd(f), base, lh, measure, calloutMax, axis.x1));
      continue;
    }

    const c = colors.get(r.trade) ?? noneColor;
    const fill = c.fill ?? '#FFFFFF';
    // Ny stil: svart eller hvit tekst etter kontrast, kant i mørkere utgave av fyllet
    const textColor = ny ? autoTextColor(fill) : (c.text ?? '#000000');
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
      border: ny ? derivedBorder(fill) : c.border,
      text: null,
      callout: null,
      arrowLeft: s < axis.start,
      arrowRight: f >= axis.end,
    };

    let useCallout = forcedCallout;
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
      const inner = w - 2 * PAD_X;
      if (inner < base * 1.6) useCallout = true;
      else {
        lines = wrapLines(rawLines, inner, base, measure);
        const h = lines.length * lh + 2 * PAD_Y;
        // Callout når boksen er smal i forhold til teksten, eller et ord må deles for å få plass
        const words = new Set(rawLines.join(' ').split(/\s+/));
        const brokeWord = lines.some((l) => l.split(/\s+/).some((wd) => wd && !words.has(wd)));
        if (w / h < 0.25 || brokeWord) useCallout = true;
        else {
          item.h = h;
          item.text = { x: bx0 + w / 2, y: PAD_Y + base * 0.85, lines, size: base, color: textColor, anchor: 'middle' };
        }
      }
    }

    if (useCallout) {
      item.h = lh + 2 * PAD_Y;
      const cl = wrapLines(rawLines, calloutMax, base, measure);
      const cw = widest(cl, base, measure) + 2 * PAD_X;
      const ch = cl.length * lh + 2 * PAD_Y;
      let cx = bx1 + 2;
      let side: 'right' | 'left' = 'right';
      if (cx + cw > axis.x1) {
        cx = bx0 - 2 - cw;
        side = 'left';
      }
      item.callout = {
        box: { x: cx, y: 0, w: cw, h: ch },
        text: { x: cx + PAD_X, y: PAD_Y + base * 0.85, lines: cl, size: base, color: '#000000', anchor: 'start' },
        leader: ny
          ? side === 'right'
            ? [bx1, item.h / 2, cx, item.h / 2]
            : [bx0, item.h / 2, cx + cw, item.h / 2]
          : calloutLeader(bx0, bx1, item.h, side === 'right' ? cx : cx + cw, side),
      };
      pieces.push({ item, fx0: Math.min(bx0, cx), fx1: Math.max(bx1, cx + cw), h: Math.max(item.h, ch), sortX: bx0, sortW: w });
    } else {
      pieces.push({ item, fx0: bx0, fx1: bx1, h: item.h, sortX: bx0, sortW: w });
    }
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
): Piece {
  const style = box.milestone ?? { symbol: 'diamond', color: 'blue', showDate: true, verticalLine: false };
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
  let lx = flag ? x + 0.4 : x + size / 2 + 1.5;
  if (lx + lw > rightLimit) lx = flag ? x - 0.4 - lw : x - size / 2 - 1.5 - lw;
  const h = Math.max(size, lhTot);
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
  const sx0 = flag ? x - size : x - size / 2;
  return { item, fx0: Math.min(sx0, lx), fx1: Math.max(x + size / 2, lx + lw), h, sortX: sx0, sortW: 0 };
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
    const fill = ny ? (monthIndex(c.monthLabel) % 2 === 0 ? '#F3F3F3' : '#FFFFFF') : monthIndex(c.monthLabel) % 2 === 0 ? BAND_DARK : BAND_LIGHT;
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
            cells: fitLabel(axis.columns.map((c, i) => ({ x0: c.x0, x1: c.x1, label: c.label, strong: false, fill: ny ? (i % 2 === 0 ? '#F0F0F0' : '#FFFFFF') : shade(c.monthLabel) }))),
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
