// Datafanen: tabell over alle bokser med filter, sortering og eksport til Excel.
import type { PlanFile } from '../format/types';
import { cell, COLUMNS, planRows, type DataRow } from './rows';

export interface DataView {
  /** Tegner tabellen på nytt fra planen (kalles etter hver endring mens fanen vises). */
  refresh(): void;
  /** Radene slik filteret og sorteringen viser dem nå. */
  visibleRows(): DataRow[];
}

const norm = (s: string) => s.toLocaleLowerCase('nb');
const collator = new Intl.Collator('nb', { numeric: true, sensitivity: 'base' });

export function createDataView(
  root: HTMLElement,
  getPlan: () => PlanFile | null,
  onPick: (id: string) => void,
): DataView {
  const filter = root.querySelector<HTMLInputElement>('#data-filter')!;
  const onlyEdited = root.querySelector<HTMLInputElement>('#data-edited')!;
  const showHidden = root.querySelector<HTMLInputElement>('#data-hidden')!;
  const count = root.querySelector<HTMLElement>('#data-count')!;
  const table = root.querySelector<HTMLTableElement>('#data-table')!;
  // Standard: planens rekkefølge (lane, så start)
  let sortKey: keyof DataRow | null = null;
  let sortDir = 1;

  const thead = table.createTHead();
  const headRow = thead.insertRow();
  const ths = COLUMNS.map((c) => {
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
    headRow.append(th);
    return th;
  });
  const tbody = table.createTBody();

  function visibleRows(): DataRow[] {
    const plan = getPlan();
    if (!plan) return [];
    const words = norm(filter.value).split(/\s+/).filter(Boolean);
    let rows = planRows(plan).filter((r) => (showHidden.checked || !r.hidden) && (!onlyEdited.checked || r.edited));
    if (words.length) {
      rows = rows.filter((r) => {
        const all = norm(COLUMNS.map((c) => cell(r, c.key)).join(' '));
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
    const rows = visibleRows();
    const total = plan ? planRows(plan).length : 0;
    count.textContent = plan ? (rows.length === total ? `${total} rader` : `${rows.length} av ${total} rader`) : '';
    ths.forEach((th, i) => th.setAttribute('aria-sort', COLUMNS[i].key === sortKey ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'));
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      if (r.hidden) tr.className = 'is-hidden';
      for (const c of COLUMNS) {
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
    if (plan && !rows.length) {
      const tr = tbody.insertRow();
      const td = tr.insertCell();
      td.colSpan = COLUMNS.length;
      td.className = 'empty';
      td.textContent = 'Ingen rader passer filteret.';
    }
  }

  tbody.addEventListener('click', (e) => {
    const tr = (e.target as Element).closest<HTMLTableRowElement>('tr[data-id]');
    if (tr && !tr.classList.contains('is-hidden')) onPick(tr.dataset.id!);
  });
  filter.addEventListener('input', refresh);
  onlyEdited.addEventListener('change', refresh);
  showHidden.addEventListener('change', refresh);

  return { refresh, visibleRows };
}
