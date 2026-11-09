import { describe, expect, it } from 'vitest';
import { testplan } from '../test/testplaner';
import type { PlanFile, Task } from '../format/types';
import { frontPoints, workClock, deltaText } from './progress';
import { resolveStatus, STATUS_DEFAULT } from './status';
import { computeLayout } from './layout';
import { addDays, parseIso } from './dates';
import { approxMeasure } from './text';

/** Plan med én lane og bokser med gitte aktiviteter. Ferie hele uke 30. */
function plan(boxes: { id: string; tasks: [string, string, number][] }[]): PlanFile {
  const p = testplan();
  let uid = 1;
  const tasks: Task[] = [];
  p.holidays = [{ start: '2026-07-20', end: '2026-07-26' }];
  p.lanes = [{
    id: 'L', name: 'Lane', fill: null, shown: true,
    boxes: boxes.map((b) => {
      const ids = b.tasks.map(([start, finish, pc]) => {
        tasks.push({ uid, name: `T${uid}`, start, finish, deadline: null, milestone: false, summary: false, flag20: false, percentComplete: pc, trade: null });
        return uid++;
      });
      const starts = b.tasks.map((t) => t[0]).sort();
      const fins = b.tasks.map((t) => t[1]).sort();
      return { id: b.id, text: b.id, taskIds: ids, rotation: 0, milestone: null, shown: true, resolved: { start: starts[0], finish: fins[fins.length - 1], isMilestone: false, trade: '(none)' } };
    }),
  }];
  p.tasks = tasks;
  return p;
}

/** «Oppdater som planlagt» til og med statusdagen: % som Project, heltall. */
function asScheduled(p: PlanFile, statusDay: string) {
  const c = workClock(p, parseIso('2026-01-01'), parseIso('2027-01-01'));
  const now = c.at(addDays(parseIso(statusDay), 1));
  for (const t of p.tasks) {
    const s = c.at(parseIso(t.start));
    const span = c.at(addDays(parseIso(t.finish), 1)) - s;
    t.percentComplete = Math.round(Math.min(100, Math.max(0, ((now - s) / span) * 100)));
  }
}

const statusFriday = (p: PlanFile, day: string) => {
  p.plan.statusDate = day;
  return resolveStatus({ ...STATUS_DEFAULT, on: true, source: 'project' }, p, day)!;
};

describe('fremdriftsfront: samme svar som Project', () => {
  it('oppdatert som planlagt gir en loddrett front, også med ulike aktiviteter i samme boks', () => {
    const p = plan([
      // A uke 2–3 og B uke 2–5 i samme boks: vektet snitt av % ville lagt punktet foran
      { id: 'ab', tasks: [['2026-01-05', '2026-01-16', 0], ['2026-01-05', '2026-01-30', 0]] },
      { id: 'c', tasks: [['2025-12-29', '2026-02-20', 0]] },
      // Over ferien i uke 30
      { id: 'd', tasks: [['2026-07-13', '2026-08-07', 0]] },
      // Lang aktivitet: % avrundet til heltall bommer med over en halv dag
      { id: 'e', tasks: [['2026-01-05', '2026-12-18', 0]] },
    ]);
    for (const day of ['2026-01-16', '2026-01-21', '2026-07-24', '2026-07-31']) {
      asScheduled(p, day);
      const pts = frontPoints(p, statusFriday(p, day), { late: false });
      expect(pts.length).toBeGreaterThan(0);
      expect(pts.map((x) => x.delta)).toEqual(pts.map(() => 0));
    }
  });

  it('det samme med mandag denne uken som statuslinje', () => {
    const p = plan([{ id: 'ab', tasks: [['2026-01-05', '2026-01-16', 0], ['2026-01-05', '2026-01-30', 0]] }]);
    asScheduled(p, '2026-01-16'); // til og med fredag
    const m = resolveStatus({ ...STATUS_DEFAULT, on: true, source: 'custom', date: '2026-01-19' }, p, '2026-01-19')!;
    expect(frontPoints(p, m, { late: false })[0].delta).toBe(0);
  });

  it('henger etter: punktet ligger til venstre, med antall arbeidsdager', () => {
    const p = plan([{ id: 'a', tasks: [['2026-01-05', '2026-01-30', 25]] }]);
    // 20 arbeidsdager, 25 % = 5 dager. Status fredag 16.1 = 10 dager. 5 dager bak.
    const [pt] = frontPoints(p, statusFriday(p, '2026-01-16'), { late: false });
    expect(pt.delta).toBe(-5);
    expect(deltaText(pt.delta)).toBe('−5 d');
  });

  it('det som skulle vært ferdig tas bare med når det er valgt', () => {
    const p = plan([{ id: 'a', tasks: [['2026-01-05', '2026-01-09', 60]] }]);
    const m = statusFriday(p, '2026-01-16');
    expect(frontPoints(p, m, { late: false })).toEqual([]);
    expect(frontPoints(p, m, { late: true })[0].delta).toBe(-7);
  });

  it('aktiviteter som ikke skal ha startet, trekker ikke punktet bakover', () => {
    const p = plan([{ id: 'a', tasks: [['2026-01-05', '2026-01-16', 100], ['2026-01-26', '2026-01-30', 0], ['2026-01-12', '2026-01-23', 50]] }]);
    expect(frontPoints(p, statusFriday(p, '2026-01-16'), { late: false })[0].delta).toBe(0);
  });
});

describe('fremdriftsfront: tegning', () => {
  it('sikksakk ut til boksen som henger etter, og tilbake', () => {
    const p = plan([{ id: 'a', tasks: [['2026-01-05', '2026-01-30', 25]] }, { id: 'b', tasks: [['2026-01-05', '2026-01-30', 50]] }]);
    p.plan.statusDate = '2026-01-16';
    const style = { ...STATUS_DEFAULT, on: true, source: 'project' as const, front: { on: true, against: 'plan' as const, late: false, deviation: true } };
    const m = resolveStatus(style, p, '2026-01-16')!;
    const L = computeLayout(p, { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: true, status: { moment: m, style } }, approxMeasure);
    const f = L.status!.front!;
    // Topp, tre punkter for boks a, bunn
    expect(f.points.length).toBe(2 * 5);
    expect(f.points[4]).toBeLessThan(L.status!.x);
    expect(f.labels.map((l) => l.text.lines[0])).toEqual(['−5 d']);
    const off = computeLayout(p, { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: true, status: { moment: m, style: { ...style, front: undefined } } }, approxMeasure);
    expect(off.status!.front).toBeNull();
  });
});
