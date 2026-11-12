// Fag: fagene fra Project, fag laget i appen, og hvilket fag en boks har.
import type { Box, HexColor, PlanFile, TradeColor } from './format/types';
import { autoTextColor } from './layout/color';

/** Faget for bokser uten fag. */
export const NO_TRADE = '(none)';

/** Faget boksen har nå: valgt i appen, ellers fra Project. */
export function boxTrade(b: Box): string | undefined {
  return b.trade ?? b.resolved?.trade;
}

/**
 * Alle fag med fargen de har nå: fagene fra Project først, så fagene laget i appen.
 * Farger valgt i appen går foran fargene fra Project. Et fag fra appen som Project
 * senere har fått med samme navn, står bare én gang.
 */
export function tradeColors(plan: PlanFile): TradeColor[] {
  const tc = plan.plan.layout.tradeColors ?? {};
  const out: TradeColor[] = plan.colors.map((c) => (tc[c.name] ? { ...c, fill: tc[c.name].fill, text: tc[c.name].text ?? autoTextColor(tc[c.name].fill) } : c));
  const known = new Set(out.map((c) => c.name));
  for (const name of plan.plan.layout.appTrades ?? []) {
    if (known.has(name)) continue;
    known.add(name);
    const fill = tc[name]?.fill ?? '#FFFFFF';
    out.push({ name, fill, border: '#000000', text: tc[name]?.text ?? autoTextColor(fill) });
  }
  return out;
}

/** Faget er laget i appen og finnes ikke i Project. */
export function isAppTrade(plan: PlanFile, name: string): boolean {
  return !plan.colors.some((c) => c.name === name) && (plan.plan.layout.appTrades ?? []).includes(name);
}

/** Fyllet et fag gir, med farger valgt i appen. */
export function tradeFill(plan: PlanFile, name: string | undefined): HexColor {
  const all = tradeColors(plan);
  const c = all.find((x) => x.name === (name ?? NO_TRADE)) ?? all.find((x) => x.name === NO_TRADE);
  return (c?.fill ?? '#FFFAC8').toUpperCase();
}

/**
 * Fargen boksen ville hatt rett fra Project: Project-faget med fargen fra Project,
 * uten fag eller farger valgt i appen. null for bokser laget i appen.
 */
export function projectFill(plan: PlanFile, b: Box): HexColor | null {
  if (b.manual || !b.resolved) return null;
  const c = plan.colors.find((x) => x.name === b.resolved!.trade) ?? plan.colors.find((x) => x.name === NO_TRADE);
  return (c?.fill ?? '#FFFAC8').toUpperCase();
}

/** Fyllet boksen har nå. */
export function currentFill(plan: PlanFile, b: Box): HexColor {
  return (b.fill ?? tradeFill(plan, boxTrade(b))).toUpperCase();
}

/** Lyse farger til nye fag, i rekkefølgen de foreslås. */
export const NEW_TRADE_COLORS = ['#8DCDF8', '#BEE5B0', '#FCC781', '#D7B4F3', '#98DEDE', '#F8F1AE', '#EA8183', '#D7CAB7', '#FFC5D3', '#CEE5ED', '#F6CDC7', '#DDDDDD'];

/** Navn og farge til et nytt fag: «Nytt fag», «Nytt fag 2» … og første farge som ikke er brukt. */
export function newTradeDefaults(plan: PlanFile): { name: string; fill: HexColor } {
  const names = new Set(tradeColors(plan).map((c) => c.name.toLowerCase()));
  let name = 'Nytt fag';
  for (let n = 2; names.has(name.toLowerCase()); n++) name = `Nytt fag ${n}`;
  const used = new Set(tradeColors(plan).map((c) => (c.fill ?? '').toUpperCase()));
  const fill = NEW_TRADE_COLORS.find((c) => !used.has(c)) ?? NEW_TRADE_COLORS[0];
  return { name, fill };
}

/**
 * Lager et nytt fag i appen og gir det til boksene. Gir navnet.
 * Bokser fra Project som får sitt eget Project-fag tilbake, mister valget fra appen.
 */
export function addTrade(plan: PlanFile, boxIds: string[] = []): string {
  const { name, fill } = newTradeDefaults(plan);
  plan.plan.layout.appTrades = [...(plan.plan.layout.appTrades ?? []), name];
  plan.plan.layout.tradeColors = { ...plan.plan.layout.tradeColors, [name]: { fill } };
  setBoxTrade(plan, boxIds, name);
  return name;
}

/** Gir boksene faget. Får en boks faget den har fra Project, lagres ikke noe valg. */
export function setBoxTrade(plan: PlanFile, boxIds: string[], name: string): void {
  const ids = new Set(boxIds);
  for (const l of plan.lanes)
    for (const b of l.boxes) {
      if (!ids.has(b.id)) continue;
      if (b.resolved?.trade === name) delete b.trade;
      else b.trade = name;
    }
}

/** Gyldig nytt navn på et fag: ikke tomt og ikke likt et annet fag. Gir feilmelding, eller null. */
export function tradeNameProblem(plan: PlanFile, oldName: string, newName: string): string | null {
  const n = newName.trim();
  if (!n) return 'Faget må ha et navn.';
  if (n === NO_TRADE || n.toLowerCase() === 'uten fag') return 'Navnet er tatt av «Uten fag».';
  if (tradeColors(plan).some((c) => c.name !== oldName && c.name.toLowerCase() === n.toLowerCase())) return `Det finnes allerede et fag som heter «${n}».`;
  return null;
}

/** Gir et fag laget i appen nytt navn. Farge, forklaring og bokser følger med. */
export function renameTrade(plan: PlanFile, oldName: string, newName: string): void {
  const n = newName.trim();
  const lay = plan.plan.layout;
  lay.appTrades = (lay.appTrades ?? []).map((x) => (x === oldName ? n : x));
  const move = <T,>(rec: Record<string, T> | undefined) => {
    if (!rec || !(oldName in rec)) return rec;
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(rec)) out[k === oldName ? n : k] = v;
    return out;
  };
  if (lay.tradeColors) lay.tradeColors = move(lay.tradeColors);
  if (lay.legendItems) lay.legendItems = move(lay.legendItems);
  for (const l of plan.lanes) for (const b of l.boxes) if (b.trade === oldName) b.trade = n;
}

/** Sletter et fag laget i appen. Boksene får faget fra Project tilbake. */
export function deleteTrade(plan: PlanFile, name: string): void {
  const lay = plan.plan.layout;
  lay.appTrades = (lay.appTrades ?? []).filter((x) => x !== name);
  if (!lay.appTrades.length) delete lay.appTrades;
  if (lay.tradeColors) {
    delete lay.tradeColors[name];
    if (!Object.keys(lay.tradeColors).length) delete lay.tradeColors;
  }
  if (lay.legendItems) {
    delete lay.legendItems[name];
    if (!Object.keys(lay.legendItems).length) delete lay.legendItems;
  }
  for (const l of plan.lanes) for (const b of l.boxes) if (b.trade === name) delete b.trade;
}

/** Antall bokser (ikke milepæler) som har faget nå. */
export function tradeCount(plan: PlanFile, name: string): number {
  return plan.lanes.reduce((n, l) => n + l.boxes.filter((b) => boxTrade(b) === name && !b.resolved?.isMilestone).length, 0);
}

/**
 * Gir boksen fargen den har i Project. Gir faget den har nå samme farge, fjernes egen farge,
 * så boksen følger faget videre.
 */
export function setProjectColor(plan: PlanFile, b: Box): void {
  const pf = projectFill(plan, b);
  if (!pf) return;
  if (tradeFill(plan, boxTrade(b)) === pf) delete b.fill;
  else b.fill = pf;
}
