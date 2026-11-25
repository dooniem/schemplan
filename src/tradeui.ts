// Fag og forklaringen i redigeringen: panelet for et fag (navn, farge, tekstfarge, boksene i faget)
// og teksten og størrelsen i forklaringen nederst på arket.
import type { PlanFile } from './format/types';
import type { Layout } from './layout/layout';
import { FERIE_KEY, PROGRESS_KEY } from './layout/layout';
import { markName, markOfKey } from './layout/marks';
import type { EditorHost } from './editor';
import type { ImageEditKit } from './imageedit';
import { BOX_PALETTE } from './editmodel';
import { innerEdgeTone, type InnerEdgeChoice } from './layout/inneredge';
import { boxTrade, deleteTrade, isAppTrade, renameTrade, tradeColors, tradeCount, tradeFill, tradeNameProblem } from './trades';

type TextColorKey = 'auto' | 'black' | 'white';

/** Det fagpanelet får fra editoren: planen, angre, tegning og byggeklossene til panelet. */
export interface TradeUiHost {
  host: EditorHost;
  panel: HTMLElement;
  layout(): Layout | null;
  /** Navnefeltet skal ha fokus neste gang panelet bygges (rett etter «Nytt fag»). Nullstilles når det leses. */
  takeNameFocus(): boolean;
  kit: Pick<ImageEditKit, 'el' | 'syncTools' | 'commit' | 'trial' | 'panelHead' | 'section' | 'segmented' | 'switchRow' | 'btn' | 'swatches' | 'colorRow' | 'buildPanel'> & {
    /** Rad med pluss og minus for en tekststørrelse, og en knapp tilbake til standarden. */
    sizeStepper: (scaleNow: number | undefined, planPt: number, set: (s: number | undefined) => void, o?: { note?: string; def?: number; resetLabel?: string; resetTitle?: string; std?: string; unit?: string; step?: number; what?: string }) => HTMLElement[];
    /** Ett angresteg per endring, men skriving i samme felt samles i ett steg. */
    stepFor: (typing?: boolean) => void;
    /** Tegner planen på nytt: straks, eller litt etter siste tastetrykk mens det skrives. */
    redrawFor: (typing?: boolean) => void;
    endTyping: () => void;
    textColorKey: (c?: string) => TextColorKey;
    TEXT_COLORS: [TextColorKey, string][];
    tradeName: (t: string) => string;
    select: (id: string | null) => void;
    selectTrade: (t: string) => void;
    setGroup: (ids: string[]) => void;
  };
}

export function createTradeUi(ed: TradeUiHost) {
  const { host, panel } = ed;
  const { el, syncTools, commit, trial, panelHead, section, segmented, switchRow, btn, swatches, colorRow, buildPanel, sizeStepper, stepFor, redrawFor, endTyping, textColorKey, TEXT_COLORS, tradeName, select, selectTrade, setGroup } = ed.kit;

  /** Endrer fargen for et helt fag. undefined fjerner fargen fra appen. */
  const setTradeColor = (trade: string, v: { fill: string; text?: string } | undefined) =>
    commit((pl) => {
      const all = { ...pl.plan.layout.tradeColors };
      if (v) all[trade] = v;
      else delete all[trade];
      if (Object.keys(all).length) pl.plan.layout.tradeColors = all;
      else delete pl.plan.layout.tradeColors;
    });

  /** Oppføring i forklaringen: skjult eller egen tekst. Tomt valg fjernes, så filen holdes ren. */
  const setLegendItem = (key: string, patch: { hidden?: boolean; text?: string }, typing = false) => {
    const plan = host.getPlan();
    if (!plan) return;
    stepFor(typing);
    const all = { ...plan.plan.layout.legendItems };
    const v = { ...all[key], ...patch };
    if (!v.hidden) delete v.hidden;
    if (!v.text?.trim()) delete v.text;
    if (Object.keys(v).length) all[key] = v;
    else delete all[key];
    if (Object.keys(all).length) plan.plan.layout.legendItems = all;
    else delete plan.plan.layout.legendItems;
    redrawFor(typing);
    if (!typing) {
      buildPanel();
    }
    syncTools();
  };
  const legendName = (key: string) => (key === FERIE_KEY ? 'Ferie' : key === PROGRESS_KEY ? 'Ferdig' : markOfKey(key) ? markName(markOfKey(key)!, host.getPlan()?.plan.layout.customMark?.name) : tradeName(key));
  /** Vis eller skjul i forklaringen, og teksten som står der. */
  const legendSection = (plan: PlanFile, key: string, ownText = true) => {
    const item = plan.plan.layout.legendItems?.[key] ?? {};
    const s = section('I forklaringen');
    const inp = el('input', { type: 'text', id: 'legend-text', 'aria-label': 'Tekst i forklaringen', placeholder: legendName(key), value: item.text ?? '' }) as HTMLInputElement;
    inp.addEventListener('focus', () => (endTyping()));
    inp.addEventListener('input', () => setLegendItem(key, { text: inp.value }, true));
    inp.addEventListener('blur', () => {
      endTyping();
      syncTools();
    });
    const lab = el('label', { class: 'prop', for: 'legend-text' });
    lab.append(el('span', { class: 'prop-label' }, 'Tekst'), inp);
    s.append(switchRow('Vis i forklaringen', !item.hidden, (v) => setLegendItem(key, { hidden: !v })));
    // Et fag laget i appen står med navnet sitt, som endres over, så det trenger ingen egen tekst
    if (ownText || item.text)
      s.append(lab, el('p', { class: 'hint' }, key === FERIE_KEY ? 'Tom tekst gir «Ferie».' : markOfKey(key) ? `Tom tekst gir «${legendName(key)}».` : 'Tom tekst gir fagnavnet. Endrer bare forklaringen, ikke faget i Project. Beholdes når du oppdaterer fra Project.'));
    // Forklaringen har én felles størrelse, som lane-navnene
    const L = ed.layout();
    if (L) {
      const base = L.legendBasePt;
      s.append(
        ...sizeStepper(plan.plan.layout.legendScale, base, (v) =>
          commit((pl) => {
            if (v === undefined) delete pl.plan.layout.legendScale;
            else pl.plan.layout.legendScale = v;
          }), {
          note: 'Egen størrelse for hele forklaringen',
          std: `standard er ${base.toLocaleString('nb-NO', { maximumFractionDigits: 2 })} pt`,
          resetLabel: 'Standard',
          resetTitle: 'Standardstørrelsen for forklaringen',
        }),
        el('p', { class: 'hint' }, 'Størrelsen gjelder hele forklaringen og datoen nederst, så alt er like stort. Blir den for bred, går den over flere rader.'),
      );
    }
  };

  /** Lys innerkant for faget: automatisk, på eller av. Tomt valg fjernes, så filen holdes ren. */
  const setInnerEdge = (trade: string, v: InnerEdgeChoice | 'auto') =>
    commit((pl) => {
      const all = { ...pl.plan.layout.innerEdge };
      if (v === 'auto') delete all[trade];
      else all[trade] = v;
      if (Object.keys(all).length) pl.plan.layout.innerEdge = all;
      else delete pl.plan.layout.innerEdge;
    });

  const innerEdgeSection = (plan: PlanFile, trade: string) => {
    const L = ed.layout();
    if (L && L.style !== 'ny') return;
    const choice = plan.plan.layout.innerEdge?.[trade] ?? 'auto';
    const s = section('Lys innerkant');
    const auto = !!L?.innerEdgeAuto.includes(trade);
    const tone = innerEdgeTone(tradeFill(plan, trade));
    const why =
      choice === 'on' ? 'På for alle boksene i faget.'
      : choice === 'off' ? 'Av for faget.'
      : auto ? 'Auto: på nå, fordi bokser i faget ligger kant i kant.'
      : tone ? 'Auto: av nå. Slås på når to bokser i faget ligger kant i kant.'
      : 'Auto: av. Fargen er for lys eller mørk til at en lys linje hjelper.';
    s.append(
      segmented('Innerkant', choice, [['auto', 'Auto'], ['on', 'På'], ['off', 'Av']], (v) => setInnerEdge(trade, v)),
      el('p', { class: 'hint' }, `${why} En tynn lys linje innenfor kanten skiller like bokser som ligger inntil hverandre.`),
    );
  };

  const buildTradePanel = (plan: PlanFile, trade: string) => {
    const app = isAppTrade(plan, trade);
    const own = plan.plan.layout.tradeColors?.[trade];
    const fill = tradeFill(plan, trade);
    const ids = plan.lanes.flatMap((l) => l.boxes.filter((b) => boxTrade(b) === trade && !b.resolved?.isMilestone && b.shown && !b.hidden).map((b) => b.id));
    const count = tradeCount(plan, trade);
    const own1 = plan.lanes.reduce((n, l) => n + l.boxes.filter((b) => boxTrade(b) === trade && b.fill).length, 0);
    panelHead(tradeName(trade), `${app ? 'Fag laget i appen' : 'Fag'} · ${count} ${count === 1 ? 'boks' : 'bokser'}`);
    if (own1) panel.append(el('p', { class: 'panel-note' }, `${own1} av boksene har egen farge og endres ikke.`));

    if (app) {
      // Navnet på et fag fra appen kan endres. Boksene, fargen og forklaringen følger med.
      const sn = section('Navn');
      const inp = el('input', { type: 'text', id: 'trade-name', 'aria-label': 'Navn på faget', value: trade, spellcheck: 'true' }) as HTMLInputElement;
      const msg = el('p', { class: 'hint field-error', role: 'alert' });
      msg.hidden = true;
      const save = () => {
        const v = inp.value.trim();
        if (v === trade) return;
        const problem = tradeNameProblem(plan, trade, v);
        if (problem) {
          msg.textContent = problem;
          msg.hidden = false;
          inp.setAttribute('aria-invalid', 'true');
          return;
        }
        commit((pl) => renameTrade(pl, trade, v));
        selectTrade(v);
      };
      inp.addEventListener('input', () => {
        msg.hidden = true;
        inp.removeAttribute('aria-invalid');
      });
      inp.addEventListener('change', save);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          inp.blur();
        }
        if (e.key === 'Escape') {
          inp.value = trade;
          msg.hidden = true;
          inp.blur();
        }
      });
      sn.append(inp, msg);
      if (ed.takeNameFocus()) {
        requestAnimationFrame(() => {
          inp.focus();
          inp.select();
        });
      }
    }

    const s = section('Farge for hele faget');
    const keepText = own?.text ? { text: own.text } : {};
    const tt = trial(`trade:${trade}`, fill, (f) => setTradeColor(trade, { fill: f, ...keepText }));
    s.append(
      swatches(fill, [
        ...BOX_PALETTE,
        ...tradeColors(plan).filter((c) => c.fill && c.name !== trade).map((c): [string, string] => [c.fill!, tradeName(c.name)]),
      ], tt),
      colorRow(fill, tt, app ? undefined : { text: 'Fargen fra Project', disabled: !own, onClick: () => setTradeColor(trade, undefined) }),
      segmented('Tekstfarge', textColorKey(own?.text), TEXT_COLORS, (v) =>
        setTradeColor(trade, { fill, ...(v === 'auto' ? {} : { text: v === 'black' ? '#000000' : '#FFFFFF' }) }),
      ),
      el('p', { class: 'hint' }, app
        ? 'Gjelder alle bokser i faget som ikke har egen farge, og forklaringen nederst. Faget følger med når du oppdaterer fra Project.'
        : 'Gjelder alle bokser i faget som ikke har egen farge, og forklaringen nederst. Følger med når du oppdaterer fra Project.'),
    );

    innerEdgeSection(plan, trade);

    const sb = section('Bokser');
    const pick = btn(`Velg boksene i faget`, null, () => setGroup(ids), 'Velger alle synlige bokser i faget, så du kan gi dem et annet fag eller endre dem samlet', 'button');
    pick.disabled = !ids.length;
    sb.append(pick);
    sb.append(el('p', { class: 'hint' }, count
      ? 'Da kan du gi dem et annet fag samlet.'
      : 'Ingen bokser har faget ennå, så det står ikke i forklaringen. Velg bokser og velg faget under Fag i panelet.'));

    legendSection(plan, trade, !app);

    if (app) {
      const foot = el('div', { class: 'panel-foot' });
      foot.append(btn('Slett faget', 'trash', () => {
        commit((pl) => deleteTrade(pl, trade));
        select(null);
      }, count ? `Boksene i faget får faget fra Project igjen (${count})` : 'Sletter faget', 'button push'));
      panel.append(foot);
    }
  };

  return { setLegendItem, legendName, legendSection, buildTradePanel };
}
