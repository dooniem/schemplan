import { FORMAT_NAME, FORMAT_VERSION, type PlanFile } from './types';

export interface ValidationResult {
  /** Satt når filen kan brukes. Advarsler kan likevel finnes. */
  plan: PlanFile | null;
  errors: string[];
  warnings: string[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;

function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Leser og sjekker en planfil. Tar imot rå tekst (fra fil) eller et allerede parset objekt. */
export function validatePlan(input: string | unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let data: unknown = input;

  if (typeof input === 'string') {
    try {
      data = JSON.parse(input.replace(/^﻿/, ''));
    } catch (e) {
      return { plan: null, errors: [`Filen er ikke gyldig JSON: ${(e as Error).message}`], warnings };
    }
  }

  if (!isObj(data)) return { plan: null, errors: ['Filen inneholder ikke et planobjekt.'], warnings };
  if (data.format !== FORMAT_NAME) {
    return { plan: null, errors: ['Filen er ikke en skjematisk plan (feltet "format" mangler eller er feil).'], warnings };
  }
  if (typeof data.version !== 'number') errors.push('Feltet "version" mangler.');
  else if (data.version > FORMAT_VERSION) {
    errors.push(`Filen er laget med planformat v${data.version}, men appen kjenner bare til v${FORMAT_VERSION}. Last siden på nytt.`);
  }

  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  const needStr = (o: Obj, k: string, path: string) => {
    if (typeof o[k] !== 'string') err(`${path}.${k}`, 'må være tekst');
  };
  const needBool = (o: Obj, k: string, path: string) => {
    if (typeof o[k] !== 'boolean') err(`${path}.${k}`, 'må være true eller false');
  };
  const optPos = (o: Obj, k: string, path: string) => {
    if (o[k] !== undefined && !(typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) > 0)) err(`${path}.${k}`, 'må være et tall større enn 0');
  };
  const needNum = (o: Obj, k: string, path: string) => {
    if (typeof o[k] !== 'number' || !Number.isFinite(o[k])) err(`${path}.${k}`, 'må være et tall');
  };
  const needDate = (o: Obj, k: string, path: string, nullable = false) => {
    if (nullable && o[k] === null) return;
    if (!isIsoDate(o[k])) err(`${path}.${k}`, 'må være en dato på formen ÅÅÅÅ-MM-DD');
  };
  const needColor = (o: Obj, k: string, path: string) => {
    if (o[k] !== null && !(typeof o[k] === 'string' && HEX.test(o[k] as string))) err(`${path}.${k}`, 'må være en farge (#RRGGBB) eller null');
  };
  const needEnum = (o: Obj, k: string, path: string, values: readonly unknown[]) => {
    if (!values.includes(o[k])) err(`${path}.${k}`, `må være en av ${values.map((v) => JSON.stringify(v)).join(', ')}`);
  };

  // ---- plan ----
  const plan = data.plan;
  if (!isObj(plan)) err('plan', 'mangler');
  else {
    needStr(plan, 'title', 'plan');
    needNum(plan, 'schemNumber', 'plan');
    const cal = plan.calendar;
    if (!isObj(cal)) err('plan.calendar', 'mangler');
    else {
      needEnum(cal, 'mode', 'plan.calendar', ['month', 'week']);
      needDate(cal, 'start', 'plan.calendar');
      needDate(cal, 'end', 'plan.calendar');
      needNum(cal, 'workingDaysPerWeek', 'plan.calendar');
      needBool(cal, 'bottomCalendar', 'plan.calendar');
      if (isIsoDate(cal.start) && isIsoDate(cal.end) && cal.start > cal.end) err('plan.calendar', 'start er etter slutt');
    }
    const lay = plan.layout;
    if (!isObj(lay)) err('plan.layout', 'mangler');
    else {
      needEnum(lay, 'orientation', 'plan.layout', ['landscape', 'portrait']);
      needEnum(lay, 'heightMode', 'plan.layout', ['fill', 'compact']);
      needNum(lay, 'textSize', 'plan.layout');
      needNum(lay, 'calloutMaxWidthCm', 'plan.layout');
      needNum(lay, 'excelWidthMultiplier', 'plan.layout');
      if (lay.paper !== undefined) needEnum(lay, 'paper', 'plan.layout', ['A3', 'A2', 'A1']);
      if (lay.style !== undefined) needEnum(lay, 'style', 'plan.layout', ['excel', 'ny']);
      if (lay.fitToSheet !== undefined) needBool(lay, 'fitToSheet', 'plan.layout');
      if (lay.minTextSize !== undefined) needNum(lay, 'minTextSize', 'plan.layout');
      if (lay.titleSize !== undefined) optPos(lay, 'titleSize', 'plan.layout');
      if (lay.logo !== undefined) {
        const lg = lay.logo as Obj;
        if (!isObj(lg) || typeof lg.data !== 'string' || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(lg.data) || typeof lg.aspect !== 'number' || !(lg.aspect > 0))
          err('plan.layout.logo', 'må være et PNG- eller JPEG-bilde som data-URL, med forholdet mellom bredde og høyde');
      }
      if (lay.tradeColors !== undefined) {
        const tc = lay.tradeColors;
        const hex = (v: unknown) => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);
        if (!isObj(tc) || !Object.values(tc).every((v) => isObj(v) && hex(v.fill) && (v.text === undefined || hex(v.text))))
          err('plan.layout.tradeColors', 'må ha fill (og eventuelt text) som farge #RRGGBB for hvert fag');
      }
      if (lay.criticalLine !== undefined) {
        const c = lay.criticalLine;
        if (!isObj(c) || !(typeof c.width === 'number' && c.width > 0 && c.width <= 10) || !(typeof c.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.color)))
          err('plan.layout.criticalLine', 'må ha width (mm, over 0 og høyst 10) og color som #RRGGBB');
      }
    }
    const opt = plan.options;
    if (!isObj(opt)) err('plan.options', 'mangler');
    else {
      needBool(opt, 'legend', 'plan.options');
      needBool(opt, 'flag20Only', 'plan.options');
      needBool(opt, 'filterOutput', 'plan.options');
      needEnum(opt, 'colorBy', 'plan.options', ['trade', 'lane']);
    }
  }

  // ---- farger ----
  const tradeNames = new Set<string>();
  if (!Array.isArray(data.colors)) err('colors', 'må være en liste');
  else
    data.colors.forEach((c, i) => {
      const p = `colors[${i}]`;
      if (!isObj(c)) return err(p, 'må være et objekt');
      needStr(c, 'name', p);
      needColor(c, 'fill', p);
      needColor(c, 'border', p);
      needColor(c, 'text', p);
      if (typeof c.name === 'string') tradeNames.add(c.name);
    });

  // ---- ferier ----
  if (!Array.isArray(data.holidays)) err('holidays', 'må være en liste');
  else
    data.holidays.forEach((h, i) => {
      const p = `holidays[${i}]`;
      if (!isObj(h)) return err(p, 'må være et objekt');
      needDate(h, 'start', p);
      needDate(h, 'end', p);
    });

  // ---- aktiviteter ----
  const taskUids = new Set<number>();
  if (!Array.isArray(data.tasks)) err('tasks', 'må være en liste');
  else
    data.tasks.forEach((t, i) => {
      const p = `tasks[${i}]`;
      if (!isObj(t)) return err(p, 'må være et objekt');
      needNum(t, 'uid', p);
      needStr(t, 'name', p);
      needDate(t, 'start', p);
      needDate(t, 'finish', p);
      needDate(t, 'deadline', p, true);
      needBool(t, 'milestone', p);
      needBool(t, 'summary', p);
      needBool(t, 'flag20', p);
      needNum(t, 'percentComplete', p);
      if (t.trade !== null && typeof t.trade !== 'string') err(`${p}.trade`, 'må være tekst eller null');
      if (typeof t.uid === 'number') {
        if (taskUids.has(t.uid)) err(`${p}.uid`, `aktivitet ${t.uid} finnes flere ganger`);
        taskUids.add(t.uid);
      }
    });

  // ---- lanes og bokser ----
  const laneIds = new Set<string>();
  const boxIds = new Set<string>();
  const calStart = isObj(plan) && isObj(plan.calendar) ? plan.calendar.start : undefined;
  const calEnd = isObj(plan) && isObj(plan.calendar) ? plan.calendar.end : undefined;
  const weekMode = isObj(plan) && isObj(plan.calendar) && plan.calendar.mode === 'week';

  if (!Array.isArray(data.lanes)) err('lanes', 'må være en liste');
  else
    data.lanes.forEach((l, i) => {
      const p = `lanes[${i}]`;
      if (!isObj(l)) return err(p, 'må være et objekt');
      needStr(l, 'id', p);
      needStr(l, 'name', p);
      needColor(l, 'fill', p);
      needBool(l, 'shown', p);
      optPos(l, 'height', p);
      for (const k of ['hidden', 'manual'] as const) if (l[k] !== undefined && typeof l[k] !== 'boolean') err(`${p}.${k}`, 'må være true eller false');
      if (l.original !== undefined) {
        const o = l.original;
        if (!isObj(o) || typeof o.name !== 'string' || !(o.fill === null || (typeof o.fill === 'string' && /^#[0-9A-Fa-f]{6}$/.test(o.fill))))
          err(`${p}.original`, 'må ha name (tekst) og fill (farge eller null)');
      }
      if (typeof l.id === 'string') {
        if (laneIds.has(l.id)) err(`${p}.id`, `lane ${l.id} finnes flere ganger`);
        laneIds.add(l.id);
      }
      if (!Array.isArray(l.boxes)) return err(`${p}.boxes`, 'må være en liste');
      l.boxes.forEach((b, j) => {
        const bp = `${p}.boxes[${j}]`;
        if (!isObj(b)) return err(bp, 'må være et objekt');
        needStr(b, 'id', bp);
        needStr(b, 'text', bp);
        needBool(b, 'shown', bp);
        needEnum(b, 'rotation', bp, [0, 90, -90]);
        if (b.callout !== undefined) needEnum(b, 'callout', bp, ['auto', 'on', 'off']);
        if (b.calloutSide !== undefined) needEnum(b, 'calloutSide', bp, ['auto', 'left', 'right']);
        optPos(b, 'height', bp);
        for (const k of ['hidden', 'manual', 'header', 'critical'] as const) if (b[k] !== undefined && typeof b[k] !== 'boolean') err(`${bp}.${k}`, 'må være true eller false');
        if (b.fromLane !== undefined && typeof b.fromLane !== 'string') err(`${bp}.fromLane`, 'må være tekst');
        if (b.milestoneStyle !== undefined) {
          const m = b.milestoneStyle;
          const mp = `${bp}.milestoneStyle`;
          if (!isObj(m)) err(mp, 'må være et objekt');
          else {
            if (m.symbol !== undefined) needEnum(m, 'symbol', mp, ['flag', 'diamond']);
            if (m.color !== undefined) needEnum(m, 'color', mp, ['red', 'yellow', 'green', 'blue', 'orange', 'black']);
            for (const k of ['verticalLine', 'showDate'] as const) if (m[k] !== undefined) needBool(m, k, mp);
          }
        }
        if (b.top !== undefined && !(typeof b.top === 'number' && Number.isFinite(b.top) && b.top >= 0)) err(`${bp}.top`, 'må være et tall, 0 eller større');
        for (const k of ['fill', 'textColor'] as const)
          if (b[k] !== undefined && !(typeof b[k] === 'string' && /^#[0-9A-Fa-f]{6}$/.test(b[k] as string))) err(`${bp}.${k}`, 'må være en farge som #RRGGBB');
        if (!Array.isArray(b.taskIds) || !b.taskIds.every((n) => typeof n === 'number')) err(`${bp}.taskIds`, 'må være en liste med tall');
        const label = typeof b.id === 'string' ? `Boks ${b.id}` : bp;
        if (typeof b.id === 'string') {
          if (boxIds.has(b.id)) err(`${bp}.id`, `boks ${b.id} finnes flere ganger`);
          boxIds.add(b.id);
        }

        const m = b.milestone;
        if (m !== null) {
          if (!isObj(m)) err(`${bp}.milestone`, 'må være et objekt eller null');
          else {
            needEnum(m, 'dateSource', `${bp}.milestone`, ['deadline', 'scheduled']);
            needEnum(m, 'symbol', `${bp}.milestone`, ['flag', 'diamond']);
            needEnum(m, 'color', `${bp}.milestone`, ['red', 'yellow', 'green', 'blue', 'orange', 'black']);
            needBool(m, 'verticalLine', `${bp}.milestone`);
            needBool(m, 'rotateText', `${bp}.milestone`);
            needBool(m, 'showDate', `${bp}.milestone`);
          }
        }

        const r = b.resolved;
        if (r === null) {
          warnings.push(`${label} har ingen gyldige aktiviteter (eller er utenfor Flag20-utvalget) og tegnes ikke.`);
        } else if (!isObj(r)) {
          err(`${bp}.resolved`, 'må være et objekt eller null');
        } else {
          needDate(r, 'start', `${bp}.resolved`);
          needDate(r, 'finish', `${bp}.resolved`);
          needBool(r, 'isMilestone', `${bp}.resolved`);
          needStr(r, 'trade', `${bp}.resolved`);
          if (typeof r.trade === 'string' && tradeNames.size > 0 && !tradeNames.has(r.trade)) {
            warnings.push(`${label} har faget "${r.trade}", som ikke har noen farge. Fargen for (none) brukes.`);
          }
          if (isIsoDate(r.start) && isIsoDate(r.finish) && isIsoDate(calStart) && isIsoDate(calEnd)) {
            if (r.finish < calStart || r.start > calEnd) {
              warnings.push(`${label} ligger helt utenfor kalenderen (${r.start} til ${r.finish}).`);
            } else if (weekMode && (r.start < calStart || r.finish > calEnd)) {
              // Excel hopper over slike bokser i ukesvisning uten å si fra
              warnings.push(`${label} går utenfor kalenderen i ukesvisning (${r.start} til ${r.finish}). Excel tegner den ikke.`);
            }
          }
        }

        if (Array.isArray(b.taskIds) && taskUids.size > 0) {
          const missing = b.taskIds.filter((n) => typeof n === 'number' && !taskUids.has(n));
          if (missing.length) warnings.push(`${label} viser til aktiviteter som ikke finnes i Project: ${missing.join(', ')}.`);
        }
      });
    });

  return { plan: errors.length ? null : (data as unknown as PlanFile), errors, warnings };
}

/** Kort oppsummering for visning. */
export function summarize(plan: PlanFile) {
  const boxes = plan.lanes.flatMap((l) => l.boxes);
  return {
    title: plan.plan.title,
    mode: plan.plan.calendar.mode,
    start: plan.plan.calendar.start,
    end: plan.plan.calendar.end,
    lanes: plan.lanes.length,
    boxes: boxes.length,
    drawable: boxes.filter((b) => b.shown && isDrawable(b.resolved, plan)).length,
    milestones: boxes.filter((b) => b.resolved?.isMilestone).length,
    tasks: plan.tasks.length,
    holidays: plan.holidays.length,
    anonymized: plan.anonymized,
  };
}

/** Om Excel ville tegnet boksen: innenfor kalenderen, og helt innenfor i ukesvisning. */
export function isDrawable(r: PlanFile['lanes'][number]['boxes'][number]['resolved'], plan: PlanFile): boolean {
  if (!r) return false;
  const { start, end, mode } = plan.plan.calendar;
  if (r.finish < start || r.start > end) return false;
  if (mode === 'week' && (r.start < start || r.finish > end)) return false;
  return true;
}
