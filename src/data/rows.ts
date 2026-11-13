// Datafanen: én rad per boks og milepæl, slik planen ser ut nå (med endringene fra appen).
import type { Box, BoxChange, PlanFile, Task } from '../format/types';
import { plainText } from '../format/text';
import { boxTrade, tradeColors } from '../trades';

export interface DataRow {
  id: string;
  lane: string;
  /** Plassen lanen har i planen, til sortering. */
  laneOrder: number;
  text: string;
  start: string;
  finish: string;
  trade: string;
  type: 'Boks' | 'Milepæl' | 'Overskriftsboks' | 'Multi Lane-boks';
  source: 'Project' | 'Appen';
  edited: boolean;
  /** Hva som er endret i appen, med vanlige ord. */
  changes: string[];
  hidden: boolean;
  /** Med i den kritiske linjen. */
  critical: boolean;
  movedFrom: string;
  /** Endring ved siste oppdatering fra Project: ny, eller nye datoer (med datoene før). Tom ellers. */
  fromProject: string;
  /** Snitt av % ferdig for aktivitetene i boksen. Tom uten aktiviteter. */
  progress: string;
  /** Slutt mot baseline (siste baseline-slutt blant aktivitetene), i kalenderdager. Tom uten baseline. */
  baseline: string;
  taskIds: string;
  taskNames: string;
  fill: string;
  /** Utkikk: om boksen starter, slutter eller pågår i perioden. Tom uten utkikk. */
  period: string;
  /** Med i perioden i utkikken. */
  inWindow: boolean;
}

/** Perioden i utkikken, med første og siste dag. */
export interface DataWindow {
  start: string;
  end: string;
}

/** Teksten slik den leses: linjeskift og streker blir mellomrom, tvunget callout fjernes. */
export { plainText };

function changesOf(b: Box): string[] {
  const c: string[] = [];
  if (b.manual) c.push('laget i appen');
  if (b.original && b.text !== b.original.text) c.push('tekst');
  if (b.original && b.rotation !== b.original.rotation) c.push('rotasjon');
  if (b.trade !== undefined) c.push('fag');
  if (b.fill) c.push('farge');
  if (b.textColor) c.push('tekstfarge');
  if (b.callout && b.callout !== 'auto') c.push('callout');
  if (b.calloutSide && b.calloutSide !== 'auto') c.push('callout-side');
  if (b.calloutWidthCm) c.push('callout-bredde');
  if (b.height) c.push('høyde');
  if (b.top !== undefined) c.push('plass i lanen');
  if (b.fromLane) c.push('flyttet');
  if (b.header) c.push('overskriftsboks');
  if (b.spanTo !== undefined) c.push('multi lane-boks');
  if (b.bold) c.push('fet skrift');
  if (b.textMiddle) c.push('tekst i midten');
  if (b.milestoneStyle) c.push('milepælsutseende');
  if (b.textScale !== undefined) c.push('tekststørrelse');
  if (b.follows) c.push('følger en annen boks');
  if (b.hidden) c.push('skjult');
  return c;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
function changeText(c: BoxChange | undefined, milestone: boolean): string {
  if (!c) return '';
  if (c.kind === 'new') return 'Ny';
  if (!c.finish) return 'Nye datoer';
  return milestone || !c.start ? `Ny dato (var ${ddmm(c.finish)})` : `Nye datoer (var ${ddmm(c.start)}–${ddmm(c.finish)})`;
}

const DAY_MS = 86400000;
/** % ferdig og avvik mot baseline for aktivitetene bak en boks. */
export function progressOf(tasks: Task[], finish: string | undefined): { progress: string; baseline: string } {
  const progress = tasks.length ? `${Math.round(tasks.reduce((s, t) => s + t.percentComplete, 0) / tasks.length)} %` : '';
  const base = tasks.map((t) => t.baselineFinish).filter((d): d is string => !!d).sort().pop();
  if (!base || !finish) return { progress, baseline: '' };
  const d = Math.round((Date.parse(`${finish}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / DAY_MS);
  const days = (n: number) => `${n} ${n === 1 ? 'dag' : 'dager'}`;
  return { progress, baseline: d === 0 ? 'I rute' : d > 0 ? `${days(d)} senere` : `${days(-d)} tidligere` };
}

export function planRows(plan: PlanFile, win: DataWindow | null = null): DataRow[] {
  const names = new Map(plan.tasks.map((t) => [t.uid, t.name]));
  const taskOf = new Map(plan.tasks.map((t) => [t.uid, t]));
  const laneName = new Map(plan.lanes.map((l) => [l.id, plainText(l.name)]));
  const tradeFill = new Map(tradeColors(plan).map((c) => [c.name, c.fill ?? '']));
  const rows: DataRow[] = [];
  plan.lanes.forEach((l, li) => {
    if (!l.shown) return;
    for (const b of l.boxes) {
      if (!b.shown) continue;
      const r = b.resolved;
      const changes = changesOf(b);
      const ms = !!r?.isMilestone;
      const trade = boxTrade(b);
      rows.push({
        id: b.id,
        lane: laneName.get(l.id) ?? '',
        laneOrder: li,
        text: plainText(b.text),
        start: r ? (ms ? r.finish : r.start) : '',
        finish: r?.finish ?? '',
        trade: !r || trade === '(none)' ? '' : (trade ?? ''),
        type: ms ? 'Milepæl' : b.spanTo !== undefined ? 'Multi Lane-boks' : b.header ? 'Overskriftsboks' : 'Boks',
        source: b.manual ? 'Appen' : 'Project',
        edited: changes.length > 0 || !!l.hidden,
        changes: l.hidden ? [...changes, 'lanen er skjult'] : changes,
        hidden: !!b.hidden || !!l.hidden,
        critical: !!b.critical,
        movedFrom: b.fromLane ? (laneName.get(b.fromLane) ?? b.fromLane) : '',
        fromProject: changeText(plan.plan.layout.changes?.[b.id], ms),
        ...progressOf(b.taskIds.map((id) => taskOf.get(id)).filter((t): t is Task => !!t), r?.finish),
        taskIds: b.taskIds.join(', '),
        taskNames: b.taskIds.map((id) => names.get(id) ?? '').filter(Boolean).join('; '),
        fill: (b.fill ?? (r && trade ? tradeFill.get(trade) : '') ?? '').toUpperCase(),
        ...periodOf(r, win),
      });
    }
  });
  return rows;
}

/** Hva som skjer med boksen i perioden: starter, slutter, begge deler eller pågår. */
function periodOf(r: Box['resolved'], win: DataWindow | null): { period: string; inWindow: boolean } {
  if (!win || !r || r.finish < win.start || r.start > win.end) return { period: '', inWindow: false };
  if (r.isMilestone) return { period: 'Milepæl', inWindow: true };
  const starts = r.start >= win.start;
  const ends = r.finish <= win.end;
  return { period: starts && ends ? 'Starter og slutter' : starts ? 'Starter' : ends ? 'Slutter' : 'Pågår', inWindow: true };
}

/** Kolonnen som kommer med når utkikken er på, etter Slutt. */
const PERIOD_COLUMN = { key: 'period' as const, title: 'I utkikken', width: 18 };
/** Kolonnene i tabellen og Excel-filen, med utkikkens kolonne når den er på. */
export function columnsFor(win: DataWindow | null): typeof COLUMNS {
  if (!win) return COLUMNS;
  const i = COLUMNS.findIndex((c) => c.key === 'finish') + 1;
  return [...COLUMNS.slice(0, i), PERIOD_COLUMN, ...COLUMNS.slice(i)];
}

/** Kolonnene i tabellen og i Excel-filen. */
export const COLUMNS: { key: keyof DataRow; title: string; width: number; date?: boolean }[] = [
  { key: 'lane', title: 'Lane', width: 24 },
  { key: 'text', title: 'Tekst', width: 40 },
  { key: 'start', title: 'Start', width: 11, date: true },
  { key: 'finish', title: 'Slutt', width: 11, date: true },
  { key: 'trade', title: 'Fag', width: 16 },
  { key: 'type', title: 'Type', width: 14 },
  { key: 'source', title: 'Kilde', width: 9 },
  { key: 'edited', title: 'Redigert', width: 9 },
  { key: 'changes', title: 'Endret', width: 30 },
  { key: 'hidden', title: 'Skjult', width: 8 },
  { key: 'critical', title: 'Kritisk linje', width: 12 },
  { key: 'movedFrom', title: 'Flyttet fra', width: 20 },
  { key: 'fromProject', title: 'Siste oppdatering', width: 30 },
  { key: 'progress', title: '% ferdig', width: 9 },
  { key: 'baseline', title: 'Mot baseline', width: 16 },
  { key: 'fill', title: 'Farge', width: 9 },
  { key: 'taskIds', title: 'Aktivitets-ID', width: 14 },
  { key: 'taskNames', title: 'Aktiviteter i Project', width: 40 },
];

/** Verdien slik den vises og eksporteres. */
export function cell(r: DataRow, key: keyof DataRow): string {
  const v = r[key];
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nei';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}
