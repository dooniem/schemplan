// Kritisk linje i redigeringen: tegnemodus der klikk tar en boks med i linjen eller ut av den,
// panelet for utseendet, og filteret «Vis bare kritiske aktiviteter» med egen PDF.
import type { PlanFile } from './format/types';
import type { Layout } from './layout/layout';
import { CRITICAL_DEFAULT } from './layout/critical';
import { criticalIds, criticalKeep } from './criticalonly';
import { findBox } from './editmodel';
import type { EditorHost } from './editor';
import type { ImageEditKit } from './imageedit';

/** Det kritisk linje får fra editoren: planen, angre, tegning og byggeklossene til panelet. */
export interface CriticalUiHost {
  host: EditorHost;
  panel: HTMLElement;
  /** Redigering er på. */
  active(): boolean;
  layout(): Layout | null;
  /** Fjerner valget av bokser, lanes, bilder, overskrift og fag. */
  clearSelection(): void;
  kit: Pick<ImageEditKit, 'el' | 'syncTools' | 'snapshot' | 'commit' | 'panelHead' | 'section' | 'segmented' | 'switchRow' | 'btn' | 'swatches' | 'buildPanel' | 'overlay'>;
}

export function createCriticalUi(ed: CriticalUiHost) {
  const { host, panel } = ed;
  const { el, syncTools, snapshot, commit, panelHead, section, segmented, switchRow, btn, swatches, buildPanel, overlay } = ed.kit;
  /** Tegnemodus: klikk på en boks tar den med i linjen eller ut av den. */
  let mode = false;
  /** «Vis bare kritiske aktiviteter»: bare på skjermen, og bare så lenge tegnemodusen er på. */
  let filterOn = false;
  /** Ta med overskriftsboksene de kritiske boksene ligger i. Huskes til appen lukkes. */
  let headers = true;

  /** Boksene som vises når filteret er på, ellers null. */
  const view = (): Set<string> | null => {
    const plan = host.getPlan();
    const L = ed.layout();
    if (!ed.active() || !mode || !filterOn || !plan || !L) return null;
    // Uten bokser i linjen er det ingenting å vise, så filteret slås av
    if (!criticalIds(plan).size) {
      filterOn = false;
      return null;
    }
    return criticalKeep(plan, L.items, headers);
  };

  /** Slår tegnemodusen på eller av. Filteret slås alltid av, og ingenting annet er valgt. */
  const setMode = (on: boolean) => {
    mode = on;
    filterOn = false;
    ed.clearSelection();
    buildPanel();
    overlay();
    syncTools();
  };

  const setCritical = (ids: string[], on: boolean) =>
    commit((pl) => ids.forEach((id) => {
      const x = findBox(pl, id);
      if (!x) return;
      if (on) x.critical = true;
      else delete x.critical;
    }));

  const CRITICAL_COLORS: [string, string][] = [['#E00000', 'Rød'], ['#FF6600', 'Oransje'], ['#C000C0', 'Lilla'], ['#0050D0', 'Blå'], ['#000000', 'Svart']];
  const buildCriticalPanel = (plan: PlanFile) => {
    const marked = plan.lanes.flatMap((l) => l.boxes.filter((x) => x.critical));
    panelHead('Kritisk linje', marked.length ? `${marked.length} ${marked.length === 1 ? 'boks' : 'bokser'} i linjen` : 'Ingen bokser ennå', () => setMode(false), 'Ferdig');
    if (!marked.length) filterOn = false;
    panel.append(el('p', { class: 'panel-note' }, filterOn
      ? 'Bare boksene i linjen vises. Slå av filteret under for å se og merke de andre igjen.'
      : marked.length
      ? 'Klikk en boks for å ta den med eller ut. Linjen følger datoene, så rekkefølgen du klikker i spiller ingen rolle.'
      : 'Klikk boksene som ligger på den kritiske linjen. Linjen tegnes gjennom dem i datorekkefølge og går utenom teksten.'));
    const vs = section('Visning');
    const sw = switchRow('Vis bare kritiske aktiviteter', filterOn, (v) => {
      filterOn = v;
      buildPanel();
      overlay();
    }, 'Skjuler de andre boksene og milepælene på skjermen. Planen og PDF-en endres ikke, og filteret slås av når du trykker Ferdig.');
    sw.querySelector('input')!.disabled = !marked.length;
    vs.append(sw);
    if (filterOn) {
      vs.append(switchRow('Ta med overskriftsboksene', headers, (v) => {
        headers = v;
        overlay();
      }, 'Viser overskriftsboksene som de kritiske boksene ligger i'));
      const save = btn('Lagre PDF', 'share', () => {
        const keep = view();
        if (keep) host.saveCriticalPdf(keep, save);
      }, 'Lagrer en PDF for deling med bare det som vises nå', 'button push crit-save');
      vs.append(save);
    }
    const style = plan.plan.layout.criticalLine ?? CRITICAL_DEFAULT;
    const setStyle = (v: Partial<typeof style>) => commit((pl) => (pl.plan.layout.criticalLine = { ...(pl.plan.layout.criticalLine ?? CRITICAL_DEFAULT), ...v }));

    const s = section('Utseende');
    const ww = el('div', { class: 'prop prop-inline' });
    const wl = el('label', { class: 'prop-label', for: 'critical-width' }, 'Tykkelse');
    const wv = el('span', { class: 'range-value' }, `${style.width.toFixed(1).replace('.', ',')} mm`);
    const wr = el('div', { class: 'row' });
    const range = el('input', { type: 'range', id: 'critical-width', min: '0.2', max: '3', step: '0.1', value: String(style.width) }) as HTMLInputElement;
    // Ett angre-steg per dra i glideren; linjen tegnes på nytt mens du drar
    let sliding = false;
    range.addEventListener('input', () => {
      const pl = host.getPlan();
      if (!pl) return;
      if (!sliding) snapshot();
      sliding = true;
      pl.plan.layout.criticalLine = { ...(pl.plan.layout.criticalLine ?? CRITICAL_DEFAULT), width: Number(range.value) };
      wv.textContent = `${Number(range.value).toFixed(1).replace('.', ',')} mm`;
      host.redraw();
    });
    range.addEventListener('change', () => {
      sliding = false;
      syncTools();
    });
    wr.append(range, wv);
    ww.append(wl, wr);
    s.append(ww);
    const cw = el('div', { class: 'prop prop-inline' });
    cw.append(el('span', { class: 'prop-label' }, 'Farge'), swatches(style.color.toUpperCase(), CRITICAL_COLORS, (c) => setStyle({ color: c })));
    s.append(cw);
    s.append(segmented('Strek', style.dash ?? 'solid', [['solid', 'Hel'], ['dashed', 'Stiplet'], ['dotted', 'Prikket']], (v) => setStyle({ dash: v })));

    const foot = el('div', { class: 'panel-foot' });
    const clear = btn('Fjern linjen', 'trash', () => setCritical(marked.map((x) => x.id), false), 'Tar alle boksene ut av linjen', 'button push');
    clear.disabled = !marked.length;
    foot.append(btn('Ferdig', 'check', () => setMode(false), undefined, 'button primary'), clear);
    panel.append(foot);
  };

  return {
    get mode() {
      return mode;
    },
    view,
    setMode,
    setCritical,
    buildCriticalPanel,
    /** Redigering slås av: tegnemodusen og filteret går med. */
    stop() {
      mode = false;
      filterOn = false;
    },
    /** Filteret av, for eksempel når en ny plan åpnes. */
    clearFilter() {
      filterOn = false;
    },
  };
}
