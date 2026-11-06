// Datafanen: én rad per boks og milepæl, slik planen ser ut nå (med endringene fra appen).
import type { Box, PlanFile } from '../format/types';

export interface DataRow {
  id: string;
  lane: string;
  /** Plassen lanen har i planen, til sortering. */
  laneOrder: number;
  text: string;
  start: string;
  finish: string;
  trade: string;
  type: 'Boks' | 'Milepæl' | 'Overskriftsboks';
  source: 'Project' | 'Appen';
  edited: boolean;
  /** Hva som er endret i appen, med vanlige ord. */
  changes: string[];
  hidden: boolean;
  movedFrom: string;
  taskIds: string;
  taskNames: string;
  fill: string;
}

/** Teksten slik den leses: linjeskift og streker blir mellomrom, tvunget callout fjernes. */
export const plainText = (s: string) => s.replace(/\/?\|/g, ' ').replace(/^\*/, '').replace(/\s+/g, ' ').trim();

function changesOf(b: Box): string[] {
  const c: string[] = [];
  if (b.manual) c.push('laget i appen');
  if (b.original && b.text !== b.original.text) c.push('tekst');
  if (b.original && b.rotation !== b.original.rotation) c.push('rotasjon');
  if (b.fill) c.push('farge');
  if (b.textColor) c.push('tekstfarge');
  if (b.callout && b.callout !== 'auto') c.push('callout');
  if (b.calloutSide && b.calloutSide !== 'auto') c.push('callout-side');
  if (b.height) c.push('høyde');
  if (b.top !== undefined) c.push('plass i lanen');
  if (b.fromLane) c.push('flyttet');
  if (b.header) c.push('overskriftsboks');
  if (b.milestoneStyle) c.push('milepælsutseende');
  if (b.hidden) c.push('skjult');
  return c;
}

export function planRows(plan: PlanFile): DataRow[] {
  const names = new Map(plan.tasks.map((t) => [t.uid, t.name]));
  const laneName = new Map(plan.lanes.map((l) => [l.id, plainText(l.name)]));
  const tc = plan.plan.layout.tradeColors ?? {};
  const tradeFill = new Map(plan.colors.map((c) => [c.name, tc[c.name]?.fill ?? c.fill ?? '']));
  const rows: DataRow[] = [];
  plan.lanes.forEach((l, li) => {
    if (!l.shown) return;
    for (const b of l.boxes) {
      if (!b.shown) continue;
      const r = b.resolved;
      const changes = changesOf(b);
      const ms = !!r?.isMilestone;
      rows.push({
        id: b.id,
        lane: laneName.get(l.id) ?? '',
        laneOrder: li,
        text: plainText(b.text),
        start: r ? (ms ? r.finish : r.start) : '',
        finish: r?.finish ?? '',
        trade: !r || r.trade === '(none)' ? '' : r.trade,
        type: ms ? 'Milepæl' : b.header ? 'Overskriftsboks' : 'Boks',
        source: b.manual ? 'Appen' : 'Project',
        edited: changes.length > 0 || !!l.hidden,
        changes: l.hidden ? [...changes, 'lanen er skjult'] : changes,
        hidden: !!b.hidden || !!l.hidden,
        movedFrom: b.fromLane ? (laneName.get(b.fromLane) ?? b.fromLane) : '',
        taskIds: b.taskIds.join(', '),
        taskNames: b.taskIds.map((id) => names.get(id) ?? '').filter(Boolean).join('; '),
        fill: (b.fill ?? (r ? tradeFill.get(r.trade) : '') ?? '').toUpperCase(),
      });
    }
  });
  return rows;
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
  { key: 'movedFrom', title: 'Flyttet fra', width: 20 },
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
