// Start og slutt på tidsaksen i Innstillinger › Kalender og stil.

import type { CalendarRange, IsoDate, PlanFile } from './format/types';
import { boxesOutside, columnCount, columnLabel, effectiveRange, stepColumn } from './layout/range';

type Mode = 'month' | 'week';
type End = 'start' | 'end';

interface Deps {
  plan: () => PlanFile | null;
  mode: () => Mode;
  /** Kalles etter hver endring, så planen tegnes på nytt. */
  changed: () => void;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const unit = (mode: Mode, n: number) => (mode === 'month' ? (n === 1 ? 'måned' : 'måneder') : n === 1 ? 'uke' : 'uker');
const boxes = (n: number) => (n === 1 ? '1 boks' : `${n} bokser`);
const line = (text: string) => {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
};

/** «Apr–Sep 2026», «Nov 2026 – Feb 2027», «Uke 15–36 2026» */
export function shortRange(start: IsoDate, end: IsoDate, mode: Mode): string {
  const a = columnLabel(start, mode).split(' ');
  const b = columnLabel(end, mode).split(' ');
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  if (mode === 'week') {
    // [«uke», nr, år]
    if (a[2] === b[2]) return a[1] === b[1] ? `Uke ${a[1]} ${a[2]}` : `Uke ${a[1]}–${b[1]} ${a[2]}`;
    return `Uke ${a[1]} ${a[2]} – uke ${b[1]} ${b[2]}`;
  }
  if (a[1] === b[1]) return a[0] === b[0] ? cap(a.join(' ')) : `${a[0]}–${b[0]} ${a[1]}`;
  return `${a.join(' ')} – ${b.join(' ')}`;
}

export function setupRangeMenu(d: Deps): { sync: () => void } {
  const input = (k: End) => $<HTMLInputElement>(`#cal-${k}`);

  const set = (k: End, iso: IsoDate | null) => {
    const p = d.plan();
    if (!p) return;
    const cal = p.plan.calendar;
    const next: CalendarRange = { ...p.plan.layout.calendarRange };
    // Samme dag som Project er det samme som å følge Project
    if (iso === null || iso === cal[k]) delete next[k];
    else next[k] = iso;
    // Start etter slutt: den andre enden flyttes med, så kalenderen alltid har minst én kolonne
    const r = effectiveRange({ ...p, plan: { ...p.plan, layout: { ...p.plan.layout, calendarRange: next } } }, d.mode());
    if (iso && k === 'start' && iso > r.end) next.end = iso;
    if (iso && k === 'end' && iso < r.start) next.start = iso;
    if (next.start === cal.start) delete next.start;
    if (next.end === cal.end) delete next.end;
    if (next.start || next.end) p.plan.layout.calendarRange = next;
    else delete p.plan.layout.calendarRange;
    d.changed();
  };

  for (const k of ['start', 'end'] as const) {
    input(k).addEventListener('change', () => {
      const v = input(k).value;
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) set(k, v);
      else sync();
    });
  }
  document.querySelectorAll<HTMLButtonElement>('[data-cal-nudge]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = d.plan();
      if (!p) return;
      const k = b.dataset.calNudge as End;
      const r = effectiveRange(p, d.mode());
      set(k, stepColumn(r[k], d.mode(), Number(b.dataset.dir) as 1 | -1));
    }),
  );
  $<HTMLButtonElement>('#cal-range-reset').addEventListener('click', () => {
    const p = d.plan();
    if (!p) return;
    delete p.plan.layout.calendarRange;
    d.changed();
    input('start').focus();
  });

  function sync() {
    const p = d.plan();
    const mode = d.mode();
    const help = $('#cal-range-help');
    const reset = $<HTMLButtonElement>('#cal-range-reset');
    document.querySelectorAll<HTMLButtonElement>('[data-cal-nudge]').forEach((b) => {
      b.disabled = !p;
      const label = `${b.dataset.calNudge === 'start' ? 'Start' : 'Slutt'} én ${mode === 'month' ? 'måned' : 'uke'} ${b.dataset.dir === '1' ? 'senere' : 'tidligere'}`;
      b.title = label;
      b.setAttribute('aria-label', label);
    });
    for (const k of ['start', 'end'] as const) input(k).disabled = !p;
    if (!p) {
      for (const k of ['start', 'end'] as const) input(k).value = '';
      help.textContent = '';
      reset.hidden = true;
      return;
    }
    const own = p.plan.layout.calendarRange ?? {};
    const r = effectiveRange(p, mode);
    for (const k of ['start', 'end'] as const) {
      const inp = input(k);
      if (document.activeElement !== inp) inp.value = r[k];
      inp.closest('.num')!.classList.toggle('is-own', !!own[k]);
      inp.title = own[k] ? `Valgt her. Project: ${p.plan.calendar[k].split('-').reverse().join('.')}` : 'Fra Project';
    }
    const n = columnCount(r.start, r.end, mode);
    const span = `${shortRange(r.start, r.end, mode)} · ${n} ${unit(mode, n)}`;
    if (!own.start && !own.end) {
      help.replaceChildren(line(span), line('Som i Project'));
      reset.hidden = true;
      return;
    }
    const out = boxesOutside(p, mode);
    help.replaceChildren(line(span), line(out ? `${boxes(out)} utenfor vises ikke. De ligger urørt og kommer tilbake når kalenderen utvides.` : 'Alle bokser er med.'));
    reset.hidden = false;
  }

  return { sync };
}

/** Kort tekst til oppsummeringen i Innstillinger, eller null når kalenderen følger Project. */
export function rangeSummary(p: PlanFile | null, mode: Mode): string | null {
  if (!p?.plan.layout.calendarRange) return null;
  const r = effectiveRange(p, mode);
  return shortRange(r.start, r.end, mode);
}
