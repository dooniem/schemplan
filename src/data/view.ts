// Datafanen: tabell over alle bokser med filter, sortering og eksport til Excel.
import type { PlanFile } from '../format/types';
import { cell, columnsFor, COLUMNS, planRows, type DataRow, type DataWindow } from './rows';
import { createCtxMenu } from '../ctxmenu';

export interface DataView {
  /** Tegner tabellen på nytt fra planen (kalles etter hver endring mens fanen vises). */
  refresh(): void;
  /** Radene slik filteret og sorteringen viser dem nå. */
  visibleRows(): DataRow[];
  /** Kolonnene som vises nå (med «I utkikken» når utkikken er på). */
  columns(): typeof COLUMNS;
}

const norm = (s: string) => s.toLocaleLowerCase('nb');
const collator = new Intl.Collator('nb', { numeric: true, sensitivity: 'base' });

export function createDataView(
  root: HTMLElement,
  getPlan: () => PlanFile | null,
  onPick: (id: string) => void,
  /** Perioden i utkikken, eller null når den er av. */
  getWindow: () => (DataWindow & { label: string }) | null = () => null,
): DataView {
  const filter = root.querySelector<HTMLInputElement>('#data-filter')!;
  const onlyEdited = root.querySelector<HTMLInputElement>('#data-edited')!;
  const showHidden = root.querySelector<HTMLInputElement>('#data-hidden')!;
  const onlyWindow = root.querySelector<HTMLInputElement>('#data-window')!;
  const windowField = root.querySelector<HTMLElement>('#data-window-field')!;
  const windowLabel = root.querySelector<HTMLElement>('#data-window-label')!;
  const count = root.querySelector<HTMLElement>('#data-count')!;
  const table = root.querySelector<HTMLTableElement>('#data-table')!;
  // Standard: planens rekkefølge (lane, så start)
  let sortKey: keyof DataRow | null = null;
  let sortDir = 1;

  const thead = table.createTHead();
  const headRow = thead.insertRow();
  let cols = COLUMNS;
  let ths: HTMLTableCellElement[] = [];
  /** Overskriftene bygges på nytt når kolonnene endres (utkikken slås av eller på). */
  function buildHead() {
    ths = cols.map((c) => {
      const th = document.createElement('th');
      th.scope = 'col';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.title;
      b.title = 'Sorter';
      b.addEventListener('click', () => {
        if (sortKey === c.key) sortDir === 1 ? (sortDir = -1) : ((sortKey = null), (sortDir = 1));
        else (sortKey = c.key), (sortDir = 1);
        refresh();
      });
      th.append(b);
      return th;
    });
    headRow.replaceChildren(...ths);
  }
  buildHead();
  const tbody = table.createTBody();

  function visibleRows(): DataRow[] {
    const plan = getPlan();
    if (!plan) return [];
    const words = norm(filter.value).split(/\s+/).filter(Boolean);
    const win = getWindow();
    let rows = planRows(plan, win).filter((r) => (showHidden.checked || !r.hidden) && (!onlyEdited.checked || r.edited) && (!win || !onlyWindow.checked || r.inWindow));
    if (words.length) {
      rows = rows.filter((r) => {
        const all = norm(cols.map((c) => cell(r, c.key)).join(' '));
        return words.every((w) => all.includes(w));
      });
    }
    const byPlan = (a: DataRow, b: DataRow) => a.laneOrder - b.laneOrder || a.start.localeCompare(b.start) || a.finish.localeCompare(b.finish);
    if (sortKey) {
      const k = sortKey;
      rows.sort((a, b) => sortDir * collator.compare(cell(a, k), cell(b, k)) || byPlan(a, b));
    } else rows.sort(byPlan);
    return rows;
  }

  const shortDate = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

  function refresh() {
    const plan = getPlan();
    const win = getWindow();
    windowField.hidden = !win;
    if (win) windowLabel.textContent = `Bare i utkikken (${win.label.charAt(0).toLowerCase()}${win.label.slice(1)})`;
    const next = columnsFor(win);
    if (next.length !== cols.length) {
      cols = next;
      if (sortKey && !cols.some((c) => c.key === sortKey)) sortKey = null;
      buildHead();
    }
    const rows = visibleRows();
    const total = plan ? planRows(plan).length : 0;
    count.textContent = plan ? (rows.length === total ? `${total} rader` : `${rows.length} av ${total} rader`) : '';
    ths.forEach((th, i) => th.setAttribute('aria-sort', cols[i].key === sortKey ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'));
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      if (r.hidden) tr.className = 'is-hidden';
      for (const c of cols) {
        const td = document.createElement('td');
        td.textContent = c.date ? shortDate(r[c.key] as string) : cell(r, c.key);
        if (c.key === 'edited' && r.edited) td.className = 'yes';
        if (c.key === 'fill' && r.fill) {
          const sw = document.createElement('span');
          sw.className = 'data-swatch';
          sw.style.background = r.fill;
          td.prepend(sw);
        }
        tr.append(td);
      }
      frag.append(tr);
    }
    tbody.replaceChildren(frag);
    mark();
    if (plan && !rows.length) {
      const tr = tbody.insertRow();
      const td = tr.insertCell();
      td.colSpan = cols.length;
      td.className = 'empty';
      td.textContent = 'Ingen rader passer filteret.';
    }
  }

  // Klikk markerer bare raden. «Vis i planen» ligger i høyreklikkmenyen, så et feilklikk ikke tar deg ut av tabellen.
  let picked = '';
  const mark = () => tbody.querySelectorAll<HTMLTableRowElement>('tr[data-id]').forEach((tr) => tr.classList.toggle('is-selected', tr.dataset.id === picked));
  tbody.addEventListener('click', (e) => {
    const tr = (e.target as Element).closest<HTMLTableRowElement>('tr[data-id]');
    picked = tr?.dataset.id ?? '';
    mark();
  });
  const ctx = createCtxMenu();
  tbody.addEventListener('contextmenu', (e) => {
    const tr = (e.target as Element).closest<HTMLTableRowElement>('tr[data-id]');
    if (!tr) return;
    e.preventDefault();
    picked = tr.dataset.id!;
    mark();
    const hidden = tr.classList.contains('is-hidden');
    const id = picked;
    ctx.open(e.clientX, e.clientY, tr.cells[1]?.textContent?.trim() || 'Boks', [
      { items: [{ label: 'Vis i planen', icon: 'target', disabled: hidden, hint: hidden ? 'Boksen er skjult og vises ikke i planen.' : 'Går til planen og viser boksen, klar til å redigere.', onSelect: () => onPick(id) }] },
    ]);
  });
  filter.addEventListener('input', refresh);
  onlyEdited.addEventListener('change', refresh);
  showHidden.addEventListener('change', refresh);
  onlyWindow.addEventListener('change', refresh);

  return { refresh, visibleRows, columns: () => cols };
}
