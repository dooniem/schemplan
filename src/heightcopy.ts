// «Gi andre bokser samme høyde»: høyden på én boks overføres til andre bokser, enten ved at du
// klikker dem etter hverandre (som en formatpensel), eller til alle valgte bokser på én gang.
// Brukeren trenger aldri se et tall: høyden hentes fra boksen slik den står på arket.
import type { Box, PlanFile } from './format/types';
import type { BoxItem, Layout } from './layout/layout';
import { findBox, lines } from './editmodel';
import { plainText } from './format/text';

const NS = 'http://www.w3.org/2000/svg';

/** same: like høy. callout: teksten flyttet ut i callout for å få samme høyde. taller: teksten krever mer, og callout er ikke mulig. */
export type HeightResult = 'same' | 'callout' | 'taller' | 'skip';

/** Milepæler og Multi Lane-bokser har ingen høyde som kan kopieres. */
export const canTakeHeight = (b: Box | null | undefined): b is Box => !!b && !b.resolved?.isMilestone && b.spanTo === undefined;

/**
 * Gir boksen høyden `h` (tekstlinjer). `need` er høyden teksten krever i boksen nå (tekstlinjer).
 * Får ikke teksten plass, flyttes den ut i callout så boksen likevel blir like høy, så sant
 * callout er mulig (ikke overskriftsboks, og ikke slått av for boksen).
 */
export function giveHeight(b: Box, h: number, need: number): HeightResult {
  if (!canTakeHeight(b)) return 'skip';
  b.height = h;
  if (need <= h + 0.01) return 'same';
  if (b.header || b.callout === 'off') return 'taller';
  b.callout = 'on';
  return 'callout';
}

/** Høyden boksen har på arket, og høyden teksten krever, i tekstlinjer. */
export function heightsOf(L: Layout, id: string): { h: number; need: number } | null {
  const it = L.items.find((i) => i.id === id);
  if (!it || it.kind !== 'box') return null;
  // Høyden lagres med flere desimaler enn ellers, så boksene blir helt like høye som kilden
  const exact = (mm: number) => Math.round((mm / L.unit) * 10000) / 10000;
  return { h: exact(it.h), need: lines((it as BoxItem).minH ?? it.h, L.unit) };
}

/** Gir boksene `ids` samme høyde som `src`. Gir hvor mange som fikk callout eller ble høyere. */
export function sameHeight(plan: PlanFile, L: Layout, src: string, ids: string[]): { callout: number; taller: number } {
  const from = heightsOf(L, src);
  const out = { callout: 0, taller: 0 };
  if (!from) return out;
  for (const id of ids) {
    if (id === src) continue;
    const b = findBox(plan, id);
    const now = heightsOf(L, id);
    if (!b || !now) continue;
    const r = giveHeight(b, from.h, now.need);
    if (r === 'callout') out.callout++;
    if (r === 'taller') out.taller++;
  }
  return out;
}

/** «… fikk callout» / «… er høyere» etter en overføring til flere bokser, eller tom tekst. */
export function resultWords(r: { callout: number; taller: number }): string {
  const n = (k: number) => (k === 1 ? '1 boks' : `${k} bokser`);
  return [
    r.callout && `${n(r.callout)} fikk callout fordi teksten ikke fikk plass.`,
    r.taller && `${n(r.taller)} ble høyere fordi teksten krever det.`,
  ].filter(Boolean).join(' ');
}

type Before = { height?: number; callout?: Box['callout'] };

export interface HeightCopy {
  /** Boksen høyden hentes fra, eller null når valget ikke er i gang. */
  readonly from: string | null;
  start(id: string): void;
  end(): void;
  /** Klikk på en boks: gir den høyden, eller setter den tilbake hvis den alt har fått den. */
  click(id: string | null): void;
  /** Boksen musen er over. Gir true når merkingen må tegnes på nytt. */
  hover(id: string | null): boolean;
  /** Merker boksen høyden hentes fra (heltrukket) og boksene som har fått den (stiplet). */
  draw(g: SVGGElement, L: Layout): void;
}

export function createHeightCopy(o: {
  bar: HTMLElement;
  accent: string;
  getPlan: () => PlanFile | null;
  layout: () => Layout | null;
  /** Endrer planen. Samme nøkkel flere ganger på rad blir ett angresteg. */
  commit: (fn: (plan: PlanFile) => void, key: string) => void;
  /** Valget startet eller sluttet: oppdater verktøylinje, markør og merking. */
  onChange: () => void;
}): HeightCopy {
  const text = o.bar.querySelector<HTMLElement>('.heightcopy-text')!;
  let from: string | null = null;
  let src = 0;
  let key = '';
  let runs = 0;
  /** Boksene som har fått høyden, slik de var før, så et nytt klikk setter dem tilbake. */
  let done = new Map<string, Before>();
  /** Boksen musen er over, som får en stiplet ramme med høyden den vil få. */
  let over: string | null = null;

  const name = (b: Box | null | undefined) => `«${(b && plainText(b.text.replace(/\|/g, ' '))) || 'Boks'}»`;
  const say = (s: string) => (text.textContent = s);
  const prompt = () => {
    const plan = o.getPlan();
    say(`Klikk boksene som skal bli like høye som ${name(plan && from ? findBox(plan, from) : null)}. Klikk igjen for å angre en boks.`);
  };

  const start = (id: string) => {
    const L = o.layout();
    const h = L && heightsOf(L, id);
    if (!h) return;
    from = id;
    src = h.h;
    key = `heightcopy:${++runs}`;
    done = new Map();
    prompt();
    o.bar.hidden = false;
    o.onChange();
  };
  const end = () => {
    if (from === null) return;
    from = null;
    over = null;
    done = new Map();
    o.bar.hidden = true;
    o.onChange();
  };

  const click = (id: string | null) => {
    const plan = o.getPlan();
    const L = o.layout();
    if (!plan || !L || from === null || !id) return;
    if (id === from) return say('Det er denne boksen høyden hentes fra. Klikk en annen boks.');
    const b = findBox(plan, id);
    if (!canTakeHeight(b)) return say(findBox(plan, id)?.resolved?.isMilestone ? 'Milepæler har ingen høyde å endre. Klikk en boks.' : 'Multi Lane-bokser får høyden fra lanene. Klikk en annen boks.');
    const before = done.get(id);
    if (before) {
      done.delete(id);
      o.commit((pl) => {
        const x = findBox(pl, id);
        if (!x) return;
        if (before.height === undefined) delete x.height;
        else x.height = before.height;
        if (before.callout === undefined) delete x.callout;
        else x.callout = before.callout;
      }, key);
      return say(`${name(b)} er satt tilbake. Klikk flere bokser, eller Ferdig.`);
    }
    over = null;
    const need = heightsOf(L, id)?.need ?? 0;
    done.set(id, { height: b.height, callout: b.callout });
    let r = 'skip' as HeightResult;
    o.commit((pl) => {
      const x = findBox(pl, id);
      if (x) r = giveHeight(x, src, need);
    }, key);
    say(
      r === 'callout'
        ? `${name(b)} fikk callout, for teksten fikk ikke plass i den høyden. Klikk igjen for å angre.`
        : r === 'taller'
          ? `${name(b)} er høyere fordi teksten ikke får plass${b.header ? '' : ' og callout er slått av'}.`
          : `${done.size === 1 ? '1 boks' : `${done.size} bokser`} har fått samme høyde. Klikk flere, eller Ferdig.`,
    );
  };

  const rect = (g: SVGGElement, a: Record<string, string | number>) => {
    const r = document.createElementNS(NS, 'rect');
    for (const [k, v] of Object.entries(a)) r.setAttribute(k, String(v));
    g.append(r);
  };
  const hover = (id: string | null) => {
    const plan = o.getPlan();
    const next = from !== null && id && id !== from && !done.has(id) && plan && canTakeHeight(findBox(plan, id)) ? id : null;
    if (next === over) return false;
    over = next;
    return true;
  };
  const draw = (g: SVGGElement, L: Layout) => {
    if (from === null) return;
    const pad = 0.9;
    for (const it of L.items) {
      if (it.kind !== 'box') continue;
      const box = { x: it.x0 - pad, y: it.y - pad, width: it.x1 - it.x0 + 2 * pad, height: it.h + 2 * pad, rx: 0.8, fill: o.accent };
      // Boksen høyden hentes fra er valgt og har alt en ramme, så den får bare en svak farge
      if (it.id === from) rect(g, { ...box, 'fill-opacity': 0.1, stroke: 'none' });
      else if (done.has(it.id)) rect(g, { ...box, 'fill-opacity': 0.05, stroke: o.accent, 'stroke-width': 0.5, 'stroke-dasharray': '1.4 0.9' });
      // Under musen: høyden boksen vil få
      else if (it.id === over) rect(g, { x: it.x0, y: it.y, width: it.x1 - it.x0, height: src * L.unit, rx: 0.4, fill: o.accent, 'fill-opacity': 0.12, stroke: o.accent, 'stroke-width': 0.5, 'stroke-dasharray': '1.4 0.9' });
    }
  };

  o.bar.querySelector('#heightcopy-done')?.addEventListener('click', () => end());

  return {
    get from() {
      return from;
    },
    start,
    end,
    click,
    hover,
    draw,
  };
}
