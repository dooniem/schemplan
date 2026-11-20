// Kritiske linjer i redigeringen: tegnemodus der klikk tar en boks med i linjen som tegnes eller ut
// av den, valg av linje (inntil tre), panelet for utseendet, og filteret «Vis bare kritiske
// aktiviteter» med egen PDF.
import type { Box, PlanFile } from './format/types';
import type { Layout } from './layout/layout';
import { CRITICAL_NUMBERS, inLine, setInLine, setStyle as setLineStyle, styleOf, usedLines } from './criticallines';
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
  /** Linjen som tegnes nå, 1 til 3. */
  let cur = 1;
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

  /** Tar boksene med i linje n (uten n: linjen som tegnes) eller ut av den. */
  const setCritical = (ids: string[], on: boolean, n = cur) =>
    commit((pl) => ids.forEach((id) => {
      const x = findBox(pl, id);
      if (x) setInLine(x, n, on);
    }));

  /** Knapper for linje 1–3 med fargen til hver linje. pressed: hvilke som står inne. */
  const lineButtons = (plan: PlanFile, label: string, pressed: (n: number) => boolean, onPick: (n: number) => void, title: (n: number) => string) => {
    const wrap = el('div', { class: 'prop prop-inline' });
    wrap.append(el('span', { class: 'prop-label' }, label));
    const g = el('div', { class: 'group crit-lines', role: 'group', 'aria-label': label });
    for (const n of CRITICAL_NUMBERS) {
      const b = el('button', { type: 'button', 'aria-pressed': String(pressed(n)), title: title(n) });
      const dot = el('span', { class: 'crit-dot', 'aria-hidden': 'true' });
      dot.style.background = styleOf(plan.plan.layout, n).color;
      b.append(dot, String(n));
      b.addEventListener('click', () => onPick(n));
      g.append(b);
    }
    wrap.append(g);
    return wrap;
  };

  /**
   * Valget i panelet for valgte bokser: alltid en knapp per linje, så valget ser likt ut
   * enten planen har én eller flere linjer. Navnet står over knappene.
   */
  const boxLineRow = (plan: PlanFile, boxes: Box[]) => {
    const all = (n: number) => boxes.every((x) => inLine(x, n));
    const row = lineButtons(plan, 'Med i linje', all, (n) => setCritical(boxes.map((x) => x.id), !all(n), n), (n) => `Ta med i eller ut av kritisk linje ${n}`);
    row.classList.replace('prop-inline', 'prop');
    return row;
  };

  const CRITICAL_COLORS: [string, string][] = [['#E00000', 'Rød'], ['#FF6600', 'Oransje'], ['#C000C0', 'Lilla'], ['#0050D0', 'Blå'], ['#000000', 'Svart']];
  const buildCriticalPanel = (plan: PlanFile) => {
    const marked = plan.lanes.flatMap((l) => l.boxes.filter((x) => inLine(x, cur)));
    const any = criticalIds(plan).size > 0;
    const many = usedLines(plan).some((n) => n > 1) || cur > 1;
    const head = many ? `Kritisk linje ${cur}` : 'Kritisk linje';
    panelHead('Kritisk linje', marked.length ? `${marked.length} ${marked.length === 1 ? 'boks' : 'bokser'} i ${many ? `linje ${cur}` : 'linjen'}` : `Ingen bokser i ${many ? `linje ${cur}` : 'linjen'} ennå`, () => setMode(false), 'Ferdig');
    if (!any) filterOn = false;
    section('Linje').append(lineButtons(plan, 'Tegner', (n) => n === cur, (n) => {
      cur = n;
      buildPanel();
      overlay();
    }, (n) => `Tegn kritisk linje ${n}. Klikk boksene for å ta dem med eller ut av denne linjen.`));
    panel.append(el('p', { class: 'panel-note' }, filterOn
      ? 'Bare boksene i de kritiske linjene vises. Slå av filteret under for å se og merke de andre igjen.'
      : marked.length
      ? `Klikk en boks for å ta den med i ${head.toLowerCase()} eller ut. Linjen følger datoene, så rekkefølgen du klikker i spiller ingen rolle.`
      : `Klikk boksene som ligger på ${head.toLowerCase()}. Linjen tegnes gjennom dem i datorekkefølge og går utenom teksten. Planen kan ha inntil tre linjer, og en boks kan være med i flere.`));
    const vs = section('Visning');
    const sw = switchRow('Vis bare kritiske aktiviteter', filterOn, (v) => {
      filterOn = v;
      buildPanel();
      overlay();
    }, 'Skjuler de andre boksene og milepælene på skjermen. Planen og PDF-en endres ikke, og filteret slås av når du trykker Ferdig.');
    sw.querySelector('input')!.disabled = !any;
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
    const n = cur;
    const style = styleOf(plan.plan.layout, n);
    const setStyle = (v: Partial<typeof style>) => commit((pl) => setLineStyle(pl.plan.layout, n, v));

    const s = section(many ? `Utseende, linje ${n}` : 'Utseende');
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
      setLineStyle(pl.plan.layout, n, { width: Number(range.value) });
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
    const clear = btn('Fjern linjen', 'trash', () => setCritical(marked.map((x) => x.id), false, n), many ? `Tar alle boksene ut av linje ${n}. De andre linjene blir som de er.` : 'Tar alle boksene ut av linjen', 'button push');
    clear.disabled = !marked.length;
    foot.append(btn('Ferdig', 'check', () => setMode(false), undefined, 'button primary'), clear);
    panel.append(foot);
  };

  return {
    get mode() {
      return mode;
    },
    /** Linjen som tegnes nå. */
    get line() {
      return cur;
    },
    boxLineRow,
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
