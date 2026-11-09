import type { Box, Lane, PlanFile, StatusLine, TradeColor } from '../format/types';
import { parseBoxText, splitLines } from '../format/text';
import { isDrawable } from '../format/validate';
import { sheetSize, type Orientation, type Paper } from '../sheet';
import { buildTimeAxis, type TimeAxis } from './calendar';
import { addDays, formatShort, MONTHS_NB, parseIso, toIso } from './dates';
import { LINE_HEIGHT, PT_TO_MM, widest, wrapLines, type Measure } from './text';
import { autoTextColor, derivedBorder } from './color';
import { criticalLine, CRITICAL_DEFAULT, type CriticalLine } from './critical';
import { statusLabel, type StatusMoment } from './status';
import { deltaText, frontPath, frontPoints } from './progress';
import type { LookaheadExtras } from './lookahead';

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
  /** Vis forklaringen. Standard: valget i planen. */
  showLegend?: boolean;
  /** Vis kalenderen også under planen. Standard: valget i planen. */
  showBottomCalendar?: boolean;
  /** Måneds- eller ukesvisning. Standard: valget i planen. Utkikken viser alltid uker. */
  calendarMode?: 'month' | 'week';
  /** Utkikk: hele planen i miniatyr under planen, og de neste milepælene. */
  lookahead?: LookaheadExtras;
  /** Statuslinjen, når den er slått på og har en dato. */
  status?: { moment: StatusMoment; style: StatusLine };
}

/** Statuslinjen i mm. */
export interface StatusMark {
  x: number;
  y0: number;
  y1: number;
  width: number;
  color: string;
  /** «Status 6.11» i en lapp øverst ved streken. */
  tag: { x: number; y: number; w: number; h: number; text: TextBlock } | null;
  /** Fremdriftsfronten: punkter x0,y0,x1,y1,… og avviket ved knekkpunktene. */
  front: { points: number[]; labels: { x: number; y: number; w: number; h: number; text: TextBlock }[] } | null;
}

/** Hele planen i miniatyr med perioden i utkikken markert. */
export interface Overview {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  bars: { x0: number; x1: number; y: number; h: number; fill: string }[];
  window: { x0: number; x1: number };
  months: number[];
  years: { x: number; label: TextBlock }[];
  label: TextBlock;
  upcoming: TextBlock | null;
}

export const DEFAULT_TITLE_PT = 16;
/** Største tekst i forklaringen og datoen nederst, i punkter. */
export const LEGEND_MAX_PT = 10;
/** Bredden på fargeruten i forklaringen, i forhold til tekststørrelsen. */
const SWATCH_W = 1.8;

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
  /** Excel-lik ukesrad: prikket grå strek ved månedsskifte. */
  dotMonths?: boolean;
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
  /** Nøkkelen i plan.layout.legendItems: fagnavnet, eller FERIE_KEY. */
  key: string;
}

/** Nøkkelen for ferie i plan.layout.legendItems. Fagnavn kan ikke ha parentes rundt hele navnet utenom «(none)». */
export const FERIE_KEY = '(ferie)';

export interface Layout {
  width: number;
  height: number;
  margin: number;
  textScale: number;
  textSizePt: number;
  title: TextBlock;
  /** Tekst øverst til høyre, hvis noen. */
  headerRight?: TextBlock;
  /** Nedre kant av toppfeltet med overskrift, logo og tekst til høyre, i mm. */
  headerBottom: number;
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
  /** Utkikk: hele planen i miniatyr under planen. */
  overview: Overview | null;
  /** Utkikk uten miniatyr: linjen med de neste milepælene står alene. */
  upcoming: TextBlock | null;
  /** Statuslinjen, eller null når den er av eller datoen er utenfor kalenderen. */
  status: StatusMark | null;
}

const MARGIN = 8;
export const PAD_X = 0.7;
export const PAD_Y = 0.25; // Excel har lite luft over og under teksten
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

/**
 * Linjene for rotert tekst. Linjene står side om side, så bredden på boksen bestemmer hvor mange
 * det er plass til. Teksten brytes så kort som mulig innenfor det, så boksen blir lavest mulig.
 * Er det ikke plass til flere linjer enn teksten har fra før, står hver tekstlinje hel, som før.
 */
export function rotatedLines(raw: string[], innerW: number, size: number, measure: Measure, room = 0): string[] {
  const maxLines = Math.floor((innerW + 1e-6) / (size * LINE_HEIGHT));
  if (maxLines <= raw.length) return raw;
  // Linjene kan være så lange som høyden boksen har fått
  if (room > 0) {
    const fit = wrapLines(raw, room, size, measure);
    const words = new Set(raw.join(' ').split(/\s+/));
    if (fit.length <= maxLines && fit.every((l) => l.split(/\s+/).every((wd) => !wd || words.has(wd)))) return fit;
  }
  const words = raw.flatMap((l) => l.split(/\s+/)).filter(Boolean);
  let lo = Math.max(0, ...words.map((wd) => measure(wd, size)));
  let hi = widest(raw, size, measure);
  if (hi <= lo) return raw;
  // Korteste linjelengde der teksten får plass i maxLines linjer
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(raw, mid, size, measure).length <= maxLines) hi = mid;
    else lo = mid;
  }
  return wrapLines(raw, hi, size, measure);
}

export const DEFAULT_MIN_TEXT_PT = 6;
/** Tekst i en boks eller lane-titlene er aldri mer enn dobbelt så stor, eller under halvparten av planens tekst. */
export const MAX_TEXT_SCALE = 2;
export const MIN_TEXT_SCALE = 0.5;
const clampScale = (s: number | undefined) => Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, s ?? 1));
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

function layoutAt(file: PlanFile, opts: LayoutOptions, measure: Measure, scale: number, arrange?: ArrangeRequest): Layout {
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
  // Toppteksten til høyre: litt mindre enn overskriften, midtstilt i høyden i toppfeltet
  const rightLines = (file.plan.layout.headerRight ?? '').split('|').map((s) => s.trim());
  while (rightLines.length && !rightLines[rightLines.length - 1]) rightLines.pop();
  const rightSize = titleSize * 0.6;
  const rightH = rightLines.length * rightSize * LINE_HEIGHT;
  const headerH = Math.max(titleSize * 1.4, logoH + 1.5, rightH + 1.5);
  const title: TextBlock = { x: W / 2, y: MARGIN + headerH / 2 + titleSize * 0.35, lines: [file.plan.layout.title ?? file.plan.title], size: titleSize, color: '#000000', anchor: 'middle', bold: true };
  const headerRight: TextBlock | undefined = rightLines.length
    ? { x: W - MARGIN, y: MARGIN + (headerH - rightH) / 2 + rightSize * 0.9, lines: rightLines, size: rightSize, color: '#000000', anchor: 'end' }
    : undefined;
  const logo = lg ? { x: MARGIN, y: MARGIN + (headerH - 1.5 - logoH) / 2, w: Math.min(logoH * lg.aspect, W / 3), h: Math.min(logoH, W / 3 / lg.aspect), href: lg.data } : null;

  // ---- Lane-kolonnen: bred nok til at ingen ord deles, inntil 30 mm for hele titler, aldri over 40 mm ----
  const lanes = file.lanes.filter((l) => l.shown && !l.hidden);
  const titlePad = 2 * PAD_X + 2;
  // Lane-titlene har én felles størrelse, i forhold til teksten i boksene
  const laneSize = base * clampScale(file.plan.layout.laneTitleScale);
  const laneLh = laneSize * LINE_HEIGHT;
  // "|" i lane-navnet er linjeskift, som i boksteksten
  const laneRaw = lanes.map((l) => splitLines(l.name));
  const longestWord = Math.max(0, ...laneRaw.flat().flatMap((t) => t.split(/\s+/).map((w) => measure(w, laneSize, true))));
  const widestName = Math.max(0, ...laneRaw.flat().map((t) => measure(t, laneSize, true)));
  const LANE_TITLE_W = Math.min(40, Math.max(18, longestWord + titlePad, Math.min(widestName + titlePad, 30)));
  // Luft i lanene følger tekststørrelsen
  const LANE_PAD = Math.max(0.5, base * 0.3);

  // ---- Tidsakse ----
  const laneTitleX = MARGIN;
  const x0 = MARGIN + LANE_TITLE_W;
  const x1 = W - MARGIN;
  const calMode = opts.lookahead ? file.plan.calendar.mode : (opts.calendarMode ?? file.plan.calendar.mode);
  const builtAxis = buildTimeAxis({ ...file.plan.calendar, mode: calMode }, x0, x1);
  // Excel-lik ukesvisning fordeler ukene på månedene slik Excel gjorde
  const axis: TimeAxis =
    !ny && builtAxis.mode === 'week' ? { ...builtAxis, columns: builtAxis.columns.map((c) => ({ ...c, monthLabel: c.excelMonth, monthYear: c.excelMonthYear })) } : builtAxis;
  const calSize = base * 0.9;
  const rowH = calSize * 1.8;
  // Månedsvisning: loddrette månedsnavn, raden må være høy nok til "Mai"/"Des"
  const colW = axis.columns.length ? (axis.x1 - axis.x0) / axis.columns.length : 0;
  // Ny stil: vannrette månedsnavn når de får plass
  const rotateMonths = axis.mode === 'month' && !(ny && measure('Aug', calSize, true) + 1.5 <= colW);
  const monthRowH = rotateMonths ? Math.max(rowH, measure('Aug', calSize, true) + 2.5) : rowH;
  const weekFit = axis.mode === 'week' ? fitWeekLabels(colW, calSize, rowH, measure) : undefined;
  // Excel-lik ukesvisning har to rader: «Okt 28» og ukenummer
  const calH = axis.mode === 'month' ? rowH + monthRowH : (ny ? rowH * 2 : rowH) + weekFit!.h;
  const bottomCal = opts.showBottomCalendar ?? file.plan.calendar.bottomCalendar;

  // ---- Bokser og milepæler per lane ----
  const lanePieces = lanes.map((lane) => buildPieces(lane, file, axis, base, lh, measure, colors, noneColor, ny));

  // ---- Lane-titler og innholdshøyde ----
  const titleLines = laneRaw.map((raw) => wrapLines(raw, LANE_TITLE_W - titlePad, laneSize, measure, true));
  const contentH = lanes.map((lane, i) => {
    if (arrange?.lanes.has(lane.id)) {
      // Boksene inne i en overskriftsboks som flyttes, følger den og pakkes ikke for seg
      const kidIds = new Set([...arrange.groups.values()].flat().map((k) => k.id));
      const kids = lanePieces[i].filter((p) => kidIds.has(p.item.id));
      let work = lanePieces[i].filter((p) => !kidIds.has(p.item.id));
      // Overskriftsboksen sperrer da i hele sin høyde, som en vanlig boks
      for (const p of work) if (arrange.groups.has(p.item.id)) delete p.band;
      const found = arrange.mode === 'tight' ? tightestOrder(work) : null;
      if (found) work = found;
      arrange.out.set(lane.id, found && found.map((p) => p.item.id));
      if (work.some((p) => arrange.groups.has(p.item.id))) {
        // Overskriftsbokser har alltid fast plass: der den havnet, og boksene inni like langt ned som før
        const placed = packVariants(work.map((p) => ({ alts: p.alts ?? [p], lock: p.lock, band: p.band })));
        work.forEach((p, j) => {
          const group = arrange.groups.get(p.item.id);
          if (!group) return;
          const top = Math.round((placed[j].y / lh) * 100) / 100;
          arrange.pins.set(p.item.id, top);
          for (const k of group) arrange.pins.set(k.id, Math.round((top + k.dy) * 100) / 100);
        });
      }
      lanePieces[i] = [...work, ...kids];
    }
    const pieces = lanePieces[i];
    const placed = packVariants(pieces.map((p) => ({ alts: p.alts ?? [p], lock: p.lock, band: p.band })));
    pieces.forEach((p, j) => {
      const v = (p.alts ?? [p])[placed[j].k];
      Object.assign(p, { item: v.item, fx0: v.fx0, fx1: v.fx1, h: v.h });
      setY(p.item, placed[j].y);
    });
    const inner = pieces.reduce((m, p, j) => Math.max(m, placed[j].y + p.h), 0);
    return Math.max(inner + 2 * LANE_PAD, titleLines[i].length * laneLh + 2 * LANE_PAD, lh * 1.5);
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
  // men har et tak, så forklaringen ikke tar mer plass enn den trenger når planen forstørres
  const legendSize = Math.min(opts.textSizePt * PT_TO_MM * Math.max(scale, 1) * (ny ? 1 : 0.85), LEGEND_MAX_PT * PT_TO_MM);
  const legendEntries: LegendEntry[] = [];
  let legendH = 0;
  if (opts.showLegend ?? file.plan.options.legend) {
    // Plass til datoen nede til høyre
    const lxMax = x1 - measure('00.00.0000', legendSize) - 6;
    const symbolEntries: { name: string; symbol: 'diamond' | 'flag' | 'holiday' }[] = ny
      ? [
          // Ruter og flagg betyr ulike ting fra plan til plan, så de navngis ikke i legenden
          ...(file.holidays.length ? [{ name: 'Ferie', symbol: 'holiday' as const }] : []),
        ]
      : [];
    // Oppføringer kan skjules eller få egen tekst i appen
    const items = file.plan.layout.legendItems ?? {};
    const tradeEntries = fileColors.filter((c) => usedTrades.has(c.name) && !items[c.name]?.hidden);
    const entries = [
      ...tradeEntries.map((c) => ({ c, symbol: undefined, trade: c.name as string | undefined, key: c.name })),
      ...symbolEntries.filter(() => !items[FERIE_KEY]?.hidden).map((e) => ({ c: { name: e.name, fill: '#FFFFFF', border: null, text: '#000000' } as TradeColor, symbol: e.symbol, trade: undefined, key: FERIE_KEY })),
    ];
    const names = entries.map(({ c, key }) => items[key]?.text?.trim() || (ny && c.name === '(none)' ? 'Uten fag' : c.name));
    // Forklaringen skal helst stå på én rad. Først tettes mellomrommet, så krympes den
    // ned mot minste tekststørrelse. Får den fortsatt ikke plass, brytes den til flere rader.
    const room = lxMax - MARGIN;
    const widthAt = (size: number, gap: number) =>
      names.reduce((sum, n) => sum + size * SWATCH_W + 1.5 + measure(n, size) + gap, 0) - gap;
    let gap = 4;
    let size = legendSize;
    if (widthAt(size, gap) > room) gap = 3;
    if (widthAt(size, gap) > room) {
      // Aldri mindre enn teksten i selve planen eller minste tekststørrelse
      const floor = Math.min(legendSize, Math.max(opts.minTextPt ?? DEFAULT_MIN_TEXT_PT, opts.textSizePt * scale) * PT_TO_MM);
      // Bredden er proporsjonal med størrelsen, bortsett fra de faste mellomrommene
      const fixed = widthAt(0, gap);
      const perSize = (widthAt(legendSize, gap) - fixed) / legendSize;
      size = Math.max(floor, (room - fixed) / perSize);
    }
    const sw = size * SWATCH_W;
    const sh = size * 1.1;
    const rowStep = size * 2;
    // Krympet forklaring står på samme grunnlinje som datoen
    const dy = (legendSize - size) * 1.1 * 0.8;
    let lx = MARGIN;
    let row = 0;
    for (const [i, { c, symbol, trade, key }] of entries.entries()) {
      const name = names[i];
      const w = sw + 1.5 + measure(name, size) + gap;
      if (lx + w - gap > lxMax && lx > MARGIN) {
        lx = MARGIN;
        row++;
      }
      legendEntries.push({
        x: lx,
        y: row * rowStep + dy,
        w: sw,
        h: sh,
        fill: c.fill ?? '#FFFFFF',
        border: ny ? derivedBorder(c.fill ?? '#FFFFFF') : c.border,
        textColor: c.text ?? '#000000',
        symbol,
        trade,
        key,
        label: { x: lx + sw + 1.5, y: row * rowStep + dy + sh * 0.8, lines: [name], size, color: '#000000', anchor: 'start' },
      });
      lx += w;
    }
    // Raden er aldri lavere enn datoen ved siden av
    if (legendEntries.length) legendH = Math.max((row + 1) * rowStep + dy, legendSize * 2) + 2;
  }
  if (!legendH) legendH = legendSize * 2 + 2; // datoen nede til høyre

  // ---- Utkikk: hele planen i miniatyr og de neste milepælene ----
  const la = opts.lookahead;
  const ovLabelSize = legendSize * 0.8;
  const ovUpH = la?.upcoming.length ? legendSize * 1.7 : 0;
  const ovStripH = la?.overview ? Math.min(12, Math.max(6, la.overview.lanes * 0.3)) : 0;
  // Uten miniatyr står bare milepælslinjen igjen
  const ovH = !la ? 0 : la.overview ? 2 + ovUpH + ovStripH + ovLabelSize * 1.5 : ovUpH ? 1 + ovUpH : 0;

  // ---- Høydebudsjett ----
  // Statuslappen står i en egen stripe over kalenderen, så den ikke dekker måneder eller uker
  const statusIn = (() => {
    const st = opts.status;
    if (!st?.style.label) return false;
    const d = parseIso(st.moment.day);
    return d >= axis.start && d < axis.end;
  })();
  const statusH = statusIn ? base * 0.85 * 1.35 + 0.6 : 0;
  const plotTop = MARGIN + headerH + statusH + calH;
  const fixedBottom = (bottomCal ? calH : 0) + ovH + legendH + MARGIN;
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
        y: y0 + h / 2 - ((tl.length - 1) * laneLh) / 2 + laneSize * 0.35,
        lines: tl,
        size: laneSize,
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
  const calendarTop = calendarRows(axis, plotTop - calH, rowH, monthRowH, calSize, measure, false, rotateMonths, ny, weekFit);
  const calendarBottom = bottomCal ? calendarRows(axis, plotBottom, rowH, monthRowH, calSize, measure, true, rotateMonths, ny, weekFit) : [];
  const ovTop = plotBottom + (bottomCal ? calH : 0) + 2;
  let overview: Overview | null = null;
  const upcoming: TextBlock | null = la?.upcoming.length ? { x: x0, y: ovTop + legendSize, lines: [`Neste milepæler: ${la.upcoming.join('  ·  ')}`], size: legendSize, color: '#000000', anchor: 'start' } : null;
  if (la?.overview) {
    const o = la.overview;
    const span = Math.max(1, o.end - o.start);
    const xOf = (t: number) => x0 + ((Math.min(Math.max(t, o.start), o.end) - o.start) / span) * (x1 - x0);
    const sy0 = ovTop + ovUpH;
    const slot = ovStripH / Math.max(1, o.lanes);
    const months: number[] = [];
    const years: Overview['years'] = [];
    for (let y = new Date(o.start).getUTCFullYear(), m = new Date(o.start).getUTCMonth() + 1; ; m++) {
      if (m === 12) (m = 0), y++;
      const t = Date.UTC(y, m, 1);
      if (t >= o.end) break;
      months.push(xOf(t));
      if (m === 0) years.push({ x: xOf(t), label: { x: xOf(t) + 0.6, y: sy0 + ovStripH + ovLabelSize * 1.1, lines: [String(y)], size: ovLabelSize, color: '#595959', anchor: 'start' } });
    }
    const firstYear = String(new Date(o.start).getUTCFullYear());
    years.unshift({ x: x0, label: { x: x0 + 0.6, y: sy0 + ovStripH + ovLabelSize * 1.1, lines: [firstYear], size: ovLabelSize, color: '#595959', anchor: 'start' } });
    overview = {
      x0,
      x1,
      y0: sy0,
      y1: sy0 + ovStripH,
      bars: o.bars.map((b) => {
        const c = colors.get(b.trade) ?? noneColor;
        const bx0 = xOf(b.start);
        return { x0: bx0, x1: Math.max(bx0 + 0.25, xOf(b.end)), y: sy0 + b.lane * slot + slot * 0.1, h: Math.max(0.12, slot * 0.8), fill: b.fill ?? c.fill ?? '#BFBFBF' };
      }),
      window: { x0: xOf(o.winStart), x1: Math.max(xOf(o.winStart) + 0.6, xOf(o.winEnd)) },
      months,
      years,
      label: { x: laneTitleX + LANE_TITLE_W / 2, y: sy0 + ovStripH / 2 + ovLabelSize * 0.35, lines: ['Hele planen'], size: ovLabelSize, color: '#595959', anchor: 'middle' },
      upcoming,
    };
  }
  // Forklaringen står rett under miniatyren
  const legendTop = ovTop + (ovH ? ovH - 1 : 0);
  const legend = legendEntries.map((e) => ({
    ...e,
    y: e.y + legendTop,
    label: { ...e.label, y: e.label.y + legendTop },
  }));
  const legendSizeMm = legendSize;
  const subtitle: TextBlock = {
    x: x1,
    y: legendTop + legendSizeMm * 1.1 * 0.8,
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
    strong: ny ? c.year !== axis.columns[i].year : c.monthYear !== axis.columns[i].monthYear,
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
    headerRight,
    headerBottom: MARGIN + headerH,
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
    overview,
    upcoming: overview ? null : upcoming,
    status: statusMark(file, items, opts.status, axis, plotTop - calH, plotTop, plotBottom, base, measure),
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

/** Gjør boksen høyere, med teksten midt i. Callouten midtstilles mot boksen når den får plass
    innenfor boksens høyde, ellers flukter den med toppen, så den stikker minst mulig ut under. */
function grow(it: BoxItem, target: number) {
  const d = it.header ? 0 : (target - it.h) / 2;
  const scale = target / it.h;
  it.h = target;
  if (it.text) it.text.y += d;
  if (it.callout) {
    const c = it.callout;
    const dc = Math.max(0, (target - c.box.h) / 2) - c.box.y;
    c.box.y += dc;
    c.text.y += dc;
    // Streken går ut i samme forhold til boksens høyde som før
    for (let k = 1; k < c.leader.length; k += 2) c.leader[k] *= scale;
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

    // Tekststørrelse valgt for boksen, i forhold til planens tekst. Høyder og plass i lanen
    // regnes fortsatt i planens tekstlinjer (lh), så de ikke endres når teksten i boksen gjør det.
    const bs = base * clampScale(box.textScale);
    const blh = bs * LINE_HEIGHT;
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
      // Rotert tekst brytes i så mange linjer som får plass i bredden, så boksen ikke blir høyere enn nødvendig
      // Høyde valgt i appen gir plass til lengre linjer: dra boksen høyere for færre linjer, til slutt én
      lines = rotatedLines(rawLines, w - 2 * PAD_X, bs, measure, box.height ? box.height * lh - 2 * PAD_Y - 1 : 0);
      item.h = widest(lines, bs, measure) + 2 * PAD_Y + 1;
      item.text = { x: bx0 + w / 2, y: item.h / 2, lines, size: bs, color: textColor, anchor: 'middle', rotate: box.rotation };
      pieces.push({ item, fx0: bx0, fx1: bx1, h: item.h, sortX: bx0, sortW: w });
      continue;
    }
    if (!useCallout) {
      const inner = Math.max(w - 2 * PAD_X, 0.5);
      // Callout bare når teksten faktisk ikke får plass, ikke ut fra en fast bredde,
      // så like bokser med samme tekst behandles likt
      const longestWord = Math.max(...rawLines.flatMap((l) => l.split(/\s+/)).map((wd) => measure(wd, bs)));
      if (inner < longestWord && !neverCallout) useCallout = true;
      else {
        lines = wrapLines(rawLines, inner, bs, measure);
        const h = lines.length * blh + 2 * PAD_Y;
        // Callout når boksen er smal i forhold til teksten, eller et ord må deles for å få plass
        const words = new Set(rawLines.join(' ').split(/\s+/));
        const brokeWord = lines.some((l) => l.split(/\s+/).some((wd) => wd && !words.has(wd)));
        if ((w / h < 0.25 || brokeWord) && !neverCallout) useCallout = true;
        else {
          item.h = h;
          item.text = { x: bx0 + w / 2, y: PAD_Y + bs * 0.85, lines, size: bs, color: textColor, anchor: 'middle' };
        }
      }
    }

    if (useCallout) {
      item.h = blh + 2 * PAD_Y;
      const make = (side: 'right' | 'left', maxW: number): Variant => {
        const cl = wrapLines(rawLines, maxW, bs, measure);
        const cw = widest(cl, bs, measure) + 2 * PAD_X;
        const ch = cl.length * blh + 2 * PAD_Y;
        const cx = side === 'right' ? bx1 + 2 : bx0 - 2 - cw;
        const it: BoxItem & { trade: string } = { ...item, callout: null };
        it.callout = {
          box: { x: cx, y: 0, w: cw, h: ch },
          text: { x: cx + PAD_X, y: PAD_Y + bs * 0.85, lines: cl, size: bs, color: '#000000', anchor: 'start' },
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
  pieces.sort((a, b) => a.sortX - b.sortX || b.sortW - a.sortW);
  return lane.order ? applyOrder(pieces, lane.order) : pieces;
}

/**
 * Rekkefølgen valgt med «Omplasser» gjelder for boksene den kjenner. Bokser som er kommet til
 * siden, settes inn etter startdato: foran den første kjente boksen som starter senere.
 */
export function applyOrder<T extends { item: { id: string }; sortX: number }>(pieces: T[], order: string[]): T[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  const out = pieces.filter((p) => pos.has(p.item.id)).sort((a, b) => pos.get(a.item.id)! - pos.get(b.item.id)!);
  for (const p of pieces) {
    if (pos.has(p.item.id)) continue;
    const at = out.findIndex((q) => pos.has(q.item.id) && q.sortX > p.sortX + 1e-9);
    out.splice(at < 0 ? out.length : at, 0, p);
  }
  return out;
}

export interface ArrangeOptions {
  mode: 'tight' | 'chrono';
  /** Overskriftsbokser som skal flyttes, med boksene inni og hvor langt ned i den de står (tekstlinjer). */
  groups?: Map<string, { id: string; dy: number }[]>;
}

export interface ArrangeResult {
  /** Ny rekkefølge per lane, eller null når den vanlige (tidligst først) er like tett. */
  orders: Map<string, string[] | null>;
  /** Ny fast plass (tekstlinjer) for overskriftsboksene som ble flyttet og boksene inni dem. */
  pins: Map<string, number>;
}

interface ArrangeRequest {
  lanes: Set<string>;
  mode: 'tight' | 'chrono';
  groups: Map<string, { id: string; dy: number }[]>;
  out: Map<string, string[] | null>;
  pins: Map<string, number>;
}

/**
 * Finner rekkefølgen som gir lavest lane når brikkene pakkes en etter en. Starter med vanlig
 * rekkefølge og noen andre gode gjetninger, og prøver så å flytte én brikke om gangen.
 * Ved lik høyde foretrekkes rekkefølgen som ligger nærmest tidligst først, så planen er lett å lese.
 * Gir null når ingen rekkefølge er lavere enn den vanlige. Brikker med fast plass står der de står.
 */
export function tightestOrder<P extends { alts?: { fx0: number; fx1: number; h: number }[]; fx0: number; fx1: number; h: number; lock?: number; band?: number }>(pieces: P[], gap = GAP): P[] | null {
  const free = pieces.map((_, i) => i).filter((i) => pieces[i].lock === undefined);
  if (free.length < 2) return null;
  const fixed = pieces.map((_, i) => i).filter((i) => pieces[i].lock !== undefined);
  const height = (seq: number[]) => {
    const order = [...fixed, ...seq];
    const placed = packVariants(order.map((i) => ({ alts: pieces[i].alts ?? [pieces[i]], lock: pieces[i].lock, band: pieces[i].band })), gap);
    return placed.reduce((m, r, j) => Math.max(m, r.y + (pieces[order[j]].alts ?? [pieces[order[j]]])[r.k].h), 0);
  };
  const rank = new Map(free.map((i, k) => [i, k]));
  const drift = (seq: number[]) => seq.reduce((s, i, k) => s + Math.abs(k - rank.get(i)!), 0);
  const EPS = 1e-6;
  const better = (a: { h: number; d: number }, b: { h: number; d: number }) => a.h < b.h - EPS || (a.h <= b.h + EPS && a.d < b.d);
  const footprint = (i: number) => pieces[i].fx1 - pieces[i].fx0;
  const starts = [
    free,
    [...free].sort((a, b) => pieces[b].h - pieces[a].h || rank.get(a)! - rank.get(b)!),
    [...free].sort((a, b) => footprint(b) * pieces[b].h - footprint(a) * pieces[a].h || rank.get(a)! - rank.get(b)!),
  ];
  const base = { seq: free, h: height(free), d: 0 };
  let best = base;
  for (const seq of starts.slice(1)) {
    const c = { seq, h: height(seq), d: drift(seq) };
    if (better(c, best)) best = c;
  }
  // Fast frø, så samme plan alltid gir samme forslag
  let seed = 12345 + free.length;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let cur = best;
  const tries = Math.min(3000, 150 * free.length);
  for (let t = 0; t < tries; t++) {
    const seq = cur.seq.slice();
    const [moved] = seq.splice(Math.floor(rnd() * seq.length), 1);
    seq.splice(Math.floor(rnd() * (seq.length + 1)), 0, moved);
    const c = { seq, h: height(seq), d: drift(seq) };
    // Godta like høye forslag av og til, så søket ikke står fast
    if (better(c, cur) || (Math.abs(c.h - cur.h) <= EPS && rnd() < 0.1)) cur = c;
    if (better(cur, best)) best = cur;
  }
  if (best.h >= base.h - EPS) return null;
  return [...fixed, ...best.seq].map((i) => pieces[i]);
}

/**
 * Omplasserer lanene: finner for hver lane rekkefølgen som gir lavest lane, ved tekststørrelsen
 * planen har nå. Gir null for en lane når vanlig rekkefølge er like tett.
 */
export function arrangeLanes(file: PlanFile, opts: LayoutOptions, measure: Measure, laneIds: string[], how: ArrangeOptions = { mode: 'tight' }): ArrangeResult {
  const scale = computeLayout(file, opts, measure).textScale;
  const out = new Map<string, string[] | null>();
  const pins = new Map<string, number>();
  layoutAt(file, opts, measure, scale, { lanes: new Set(laneIds), mode: how.mode, groups: how.groups ?? new Map(), out, pins });
  return { orders: out, pins };
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

/** Hvor mye et loddrett tall tar i bredden, i forhold til skriftstørrelsen (sifferhøyde og litt luft). */
const DIGIT_H = 0.8;

interface WeekFit {
  size: number;
  /** 1 = hver uke, 2 = annenhver, 4 = hver fjerde. 0 = ingen. */
  step: number;
  rotate: boolean;
  h: number;
}

/** Ukenummer deles aldri. Får de ikke plass liggende, står de loddrett (og krymper litt om nødvendig).
    Er kolonnene for smale også til det, står de liggende igjen, men bare for annenhver eller hver
    fjerde uke (uke 1 er alltid med). */
function fitWeekLabels(colW: number, size: number, rowH: number, measure: Measure): WeekFit {
  const cw = colW - 0.4;
  if (measure('53', size) <= cw) return { size, step: 1, rotate: false, h: rowH };
  // Loddrett bare når det gir nummer på hver uke; ellers er liggende tall lettere å lese
  const up = Math.min(size, cw / DIGIT_H);
  if (up >= size * 0.7) return { size: up, step: 1, rotate: true, h: Math.max(rowH, measure('53', up) + 1.6) };
  const wide = measure('53', size);
  const sz = Math.max(size * 0.7, (size * cw) / wide);
  const step = [1, 2, 4, 13].find((k) => measure('53', sz) <= cw * k - 0.4) ?? 0;
  return { size: sz, step, rotate: false, h: rowH };
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
  weekFit?: WeekFit,
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
  const weekRow = (cells: CalendarRow['cells']) => {
    const { size: sz, step, rotate, h } = weekFit ?? { size, step: 1, rotate: false, h: rowH };
    const across = (l: string) => (rotate ? sz * DIGIT_H : measure(l, sz));
    return {
      size: sz,
      rotate,
      h,
      cells: cells.map((c, i) => {
        const keep = step && (Number(c.label) - 1) % step === 0;
        // Ytterst kan et nummer som er bredere enn kolonnen, ikke låne plass fra naboen
        const edge = (i === 0 || i === cells.length - 1) && across(c.label) > c.x1 - c.x0 - 0.2;
        return keep && !edge ? c : { ...c, label: '' };
      }),
    };
  };

  const years = fitLabel(group((c) => String(c.year)).map((c, i) => ({ ...c, fill: i % 2 === 0 ? YEAR_A : YEAR_B })));
  const shade = (label: string) => (monthIndex(label) % 2 === 0 ? DARK : LIGHT);
  const rows: { cells: CalendarRow['cells']; h: number; rotate: boolean; size: number; dotMonths?: boolean }[] =
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
      : !ny
        ? [
            {
              // Som i Excel: «Okt 28» over ukene, annenhver måned grå
              cells: (() => {
                const cells = group((c) => `${c.monthLabel}|${c.monthYear}`);
                const fits = (l: string, c: (typeof cells)[number]) => measure(l, size) <= c.x1 - c.x0 - 0.6;
                const full = (c: (typeof cells)[number]) => c.label.replace('|', ' ').replace(/ \d\d(\d\d)$/, ' $1');
                // Året står på alle månedene når det får plass, ellers bare på januar og den første
                const allYears = cells.every((c) => fits(full(c), c));
                return cells.map((c, i) => {
                  const m = c.label.split('|')[0];
                  const tries = allYears || i === 0 || m === 'Jan' ? [full(c), m, m.slice(0, 1)] : [m, m.slice(0, 1)];
                  return { ...c, label: tries.find((l) => fits(l, c)) ?? '', fill: shade(m) };
                });
              })(),
              h: rowH,
              rotate: false,
              size,
            },
            {
              // Oddetallsukene grå
              ...weekRow(axis.columns.map((c) => ({ x0: c.x0, x1: c.x1, label: c.label, strong: true, fill: Number(c.label) % 2 === 1 ? MONTH_DARK : MONTH_LIGHT }))),
              dotMonths: true,
            },
          ]
        : [
          { cells: years, h: rowH, rotate: false, size: size * 1.15 },
          {
            cells: fitLabel(group((c) => `${c.monthLabel}|${c.monthYear}`).map((c) => ({ ...c, label: c.label.split('|')[0], fill: shade(c.label.split('|')[0]) }))),
            h: rowH,
            rotate: false,
            size,
          },
          {
            // Ny stil: annenhver uke
            ...weekRow(axis.columns.map((c) => ({ x0: c.x0, x1: c.x1, label: c.label, strong: false, fill: Number(c.label) % 2 === 1 ? '#F0F0F0' : '#FFFFFF' }))),
          },
        ];
  const ordered = bottom ? [...rows].reverse() : rows;
  let y = top;
  return ordered.map((r) => {
    const row: CalendarRow = { y, h: r.h, cells: r.cells, size: r.size, rotate: r.rotate, dotMonths: r.dotMonths };
    y += r.h;
    return row;
  });
}

/** dd.mm.åååå */
function statusMark(
  file: PlanFile,
  items: Item[],
  st: LayoutOptions['status'],
  axis: TimeAxis,
  calTop: number,
  y0: number,
  y1: number,
  base: number,
  measure: Measure,
): StatusMark | null {
  if (!st) return null;
  const { moment: m, style } = st;
  const d = parseIso(m.day);
  if (d < axis.start || d >= axis.end) return null;
  const x = m.endOfDay ? axis.xEnd(d) : axis.xStart(d);
  let tag: StatusMark['tag'] = null;
  if (style.label) {
    const size = base * 0.85;
    const label = statusLabel(m);
    const w = measure(label, size, true) + 1.2;
    const h = size * 1.35;
    // Lappen står til høyre for streken, eller til venstre når den ellers går utenfor planen.
    const tx = x + w > axis.x1 ? x - w : x;
    // Som et flagg over kalenderen: streken går opp gjennom kalenderen til lappen
    const ty = calTop - h - 0.3;
    tag = { x: tx, y: ty, w, h, text: { x: tx + w / 2, y: ty + h * 0.74, lines: [label], size, color: '#FFFFFF', anchor: 'middle', bold: true } };
  }
  let front: StatusMark['front'] = null;
  // Fronten måles foreløpig bare mot planen slik den er nå
  if (style.front?.on && style.front.against === 'plan') {
    const pts = frontPoints(file, m, { late: style.front.late });
    const path = frontPath(pts, items, axis, x, y0, y1);
    const size = base * 0.8;
    // Avviket i en lapp i linjens farge ytterst ved punktet, innenfor planen
    const labels: NonNullable<StatusMark['front']>['labels'] = style.front.deviation
      ? path.labels.map((l) => {
          const t = deltaText(l.delta);
          const w = measure(t, size, true) + 1;
          const h = size * 1.3;
          const left = l.side === 'left' ? l.x - 0.6 - w >= axis.x0 : l.x + 0.6 + w > axis.x1;
          const x = left ? l.x - 0.6 - w : l.x + 0.6;
          const y = l.y - h / 2;
          return { x, y, w, h, text: { x: x + w / 2, y: y + h * 0.74, lines: [t], size, color: '#FFFFFF', anchor: 'middle', bold: true } };
        })
      : [];
    front = { points: path.points, labels };
  }
  return { x, y0: tag ? tag.y : y0, y1, width: style.width, color: style.color, tag, front };
}

function formatLong(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
