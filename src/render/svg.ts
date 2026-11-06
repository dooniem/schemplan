import type { Layout, TextBlock } from '../layout/layout';
import { LINE_HEIGHT } from '../layout/text';

export const FONT_FAMILY = "Calibri, Carlito, 'Segoe UI', Arial, sans-serif";
const NS = 'http://www.w3.org/2000/svg';
const GRID = '#C8C8C8';
const LEADER = '#1F2D3D';
const r = (v: number) => Math.round(v * 1000) / 1000;

type Attrs = Record<string, string | number>;

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v);
  parent?.append(el);
  return el;
}

function text(t: TextBlock, parent: Element) {
  const lh = t.size * LINE_HEIGHT;
  const attrs: Attrs = {
    x: t.x,
    y: t.y,
    'font-size': t.size,
    fill: t.color,
    'text-anchor': t.anchor,
  };
  if (t.bold && !t.boldLines) attrs['font-weight'] = 'bold';
  if (t.rotate) {
    // Senter i (x, y). Linjene ligger side om side når teksten er rotert.
    attrs.y = t.y + t.size * 0.35;
    attrs.transform = `rotate(${t.rotate} ${t.x} ${t.y})`;
  }
  const el = node('text', attrs, parent);
  const n = t.lines.length;
  t.lines.forEach((line, i) => {
    const span = node('tspan', { x: t.x }, el);
    if (t.rotate) span.setAttribute('dy', String(i === 0 ? (-(n - 1) * lh) / 2 : lh));
    else if (i > 0) span.setAttribute('dy', String(lh));
    if (t.boldLines?.[i]) span.setAttribute('font-weight', 'bold');
    span.textContent = line;
  });
  return el;
}

export function renderPlan(L: Layout): SVGSVGElement {
  const svg = node('svg', {
    viewBox: `0 0 ${L.width} ${L.height}`,
    width: `${L.width}mm`,
    height: `${L.height}mm`,
    role: 'img',
    'aria-label': L.title.lines[0] || 'Skjematisk plan',
    'font-family': FONT_FAMILY,
    class: 'plan',
  });
  node('rect', { width: L.width, height: L.height, fill: '#FFFFFF' }, svg);

  // Skravur for ferier (mønster i defs, kun presentasjonsattributter pga. CSP)
  const defs = node('defs', {}, svg);
  const pat = node('pattern', { id: 'ferie', width: 1.4, height: 1.4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  node('rect', { width: 1.4, height: 1.4, fill: '#FFFFFF' }, pat);
  node('rect', { width: 0.55, height: 1.4, fill: '#D9D9D9' }, pat);

  const { x0, x1, y0, y1 } = L.plot;
  const ny = L.style === 'ny';
  const labelBg = 0.75;
  const left = L.laneTitleX;

  // Annenhver måned skyggelagt
  const bands = node('g', { class: 'bands' }, svg);
  L.bands.forEach((b) => node('rect', { x: b.x0, y: y0, width: b.x1 - b.x0, height: y1 - y0, fill: b.fill }, bands));

  // Lanes: tittelcelle med lanefarge, tynne skillelinjer i planområdet
  const lanesG = node('g', { class: 'lanes' }, svg);
  L.lanes.forEach((ln, i) => {
    node('rect', { x: left, y: ln.y0, width: x0 - left, height: ln.y1 - ln.y0, fill: ln.fill ?? '#FFFFFF', stroke: '#000000', 'stroke-width': 0.3 }, lanesG);
    if (i > 0) node('line', { x1: x0, x2: x1, y1: ln.y0, y2: ln.y0, stroke: GRID, 'stroke-width': 0.15 }, lanesG);
    text(ln.title, lanesG);
  });

  // Ferier: skravert
  const hol = node('g', { class: 'holidays' }, svg);
  L.holidays.forEach((h) =>
    node('rect', { x: h.x0, y: y0, width: Math.max(0.3, h.x1 - h.x0), height: y1 - y0, fill: 'url(#ferie)', stroke: '#C8C8C8', 'stroke-width': 0.12 }, hol),
  );

  // Rutenett: kraftig strek ved årsskifte
  const grid = node('g', { class: 'grid' }, svg);
  L.grid.forEach((g) => {
    if (g.strong) node('line', { x1: g.x, x2: g.x, y1: y0, y2: y1, stroke: '#000000', 'stroke-width': 0.45 }, grid);
    else if (g.month) node('line', { x1: g.x, x2: g.x, y1: y0, y2: y1, stroke: GRID, 'stroke-width': 0.15 }, grid);
  });

  // Kalender
  const cal = node('g', { class: 'calendar' }, svg);
  [...L.calendarTop, ...L.calendarBottom].forEach((row) => {
    row.cells.forEach((c) => {
      node('rect', { x: c.x0, y: row.y, width: c.x1 - c.x0, height: row.h, fill: c.fill, stroke: ny ? '#BFBFBF' : '#000000', 'stroke-width': ny ? 0.15 : 0.2 }, cal);
      if (!c.label) return;
      const bold = row.cells.length < 60 && c.strong;
      if (row.rotate) text({ x: (c.x0 + c.x1) / 2, y: row.y + row.h / 2, lines: [c.label], size: row.size, color: '#000000', anchor: 'middle', bold, rotate: 90 }, cal);
      else text({ x: (c.x0 + c.x1) / 2, y: row.y + row.h / 2 + row.size * 0.35, lines: [c.label], size: row.size, color: '#000000', anchor: 'middle', bold }, cal);
    });
  });
  // Kraftig ramme rundt kalenderradene og strek ved årsskifte
  for (const rows of [L.calendarTop, L.calendarBottom]) {
    if (!rows.length) continue;
    const top = rows[0].y;
    const bot = rows[rows.length - 1].y + rows[rows.length - 1].h;
    node('rect', { x: x0, y: top, width: x1 - x0, height: bot - top, fill: 'none', stroke: '#000000', 'stroke-width': ny ? 0.35 : 0.5 }, cal);
    L.grid.forEach((g) => g.strong && node('line', { x1: g.x, x2: g.x, y1: top, y2: bot, stroke: '#000000', 'stroke-width': 0.45 }, cal));
  }

  // Milepælslinjer bak boksene
  const vlines = node('g', { class: 'milestone-lines' }, svg);
  L.items.forEach((it) => {
    if (it.kind === 'milestone' && it.verticalLine) node('line', { x1: it.x, x2: it.x, y1: y0, y2: y1, stroke: it.color, 'stroke-width': 0.5 }, vlines);
  });

  // Bokser og milepæler
  const itemsG = node('g', { class: 'items' }, svg);
  for (const it of L.items) {
    const g = node('g', { 'data-id': it.id }, itemsG);
    if (it.kind === 'box') {
      if (it.callout) {
        const cb = it.callout.box;
        node('rect', { x: cb.x, y: cb.y, width: cb.w, height: cb.h, fill: '#FFFFFF', 'fill-opacity': ny ? 0.6 : 0.75 }, g);
        text(it.callout.text, g);
      }
      node('rect', {
        x: it.x0,
        y: it.y,
        width: it.x1 - it.x0,
        height: it.h,
        fill: it.fill,
        stroke: it.border ?? 'none',
        'stroke-width': it.border ? 0.25 : 0,
      }, g);
      if (it.arrowLeft) node('path', { d: `M${it.x0} ${it.y} l-1.6 ${it.h / 2} l1.6 ${it.h / 2} z`, fill: it.fill, stroke: it.border ?? 'none', 'stroke-width': 0.2 }, g);
      if (it.arrowRight) node('path', { d: `M${it.x1} ${it.y} l1.6 ${it.h / 2} l-1.6 ${it.h / 2} z`, fill: it.fill, stroke: it.border ?? 'none', 'stroke-width': 0.2 }, g);
      if (it.text) text(it.text, g);
      if (it.callout) {
        // Leder og strek tegnes oppå boksen, slik Excel-callouten gjør
        const pts = it.callout.leader;
        const d = pts.reduce((acc, v, k) => acc + (k % 2 === 0 ? `${k === 0 ? 'M' : ' L'}${r(v)}` : ` ${r(v)}`), '');
        node('path', { d, fill: 'none', stroke: LEADER, 'stroke-width': 0.3 }, g);
        const cb = it.callout.box;
        const bx = pts[pts.length - 2];
        node('line', { x1: bx, x2: bx, y1: cb.y, y2: cb.y + Math.max(cb.h, it.h), stroke: LEADER, 'stroke-width': 0.35 }, g);
      }
    } else {
      const s = it.size / 2;
      const lb = it.labelBox;
      node('rect', { x: lb.x, y: lb.y, width: lb.w, height: lb.h, fill: '#FFFFFF', 'fill-opacity': labelBg }, g);
      const left = lb.x >= it.x;
      if (it.symbol === 'diamond') {
        // Ruter, strek bort til en loddrett strek foran teksten
        const bar = left ? lb.x : lb.x + lb.w;
        node('line', { x1: it.x, x2: bar, y1: it.y, y2: it.y + s * 0.3, stroke: LEADER, 'stroke-width': 0.3 }, g);
        node('line', { x1: bar, x2: bar, y1: lb.y, y2: lb.y + lb.h, stroke: LEADER, 'stroke-width': 0.35 }, g);
        node('path', { d: `M${r(it.x)} ${r(it.y - s)} L${r(it.x + s)} ${r(it.y)} L${r(it.x)} ${r(it.y + s)} L${r(it.x - s)} ${r(it.y)} Z`, fill: it.color, stroke: '#000000', 'stroke-width': 0.3 }, g);
      } else {
        // Flagg: stangen står på datoen og går ned langs teksten, duken vaier mot venstre
        const top = it.y - s;
        node('line', { x1: it.x, x2: it.x, y1: top, y2: Math.max(it.y + s, lb.y + lb.h), stroke: '#404040', 'stroke-width': 0.3 }, g);
        const fw = s * 2.8;
        node('path', {
          d: `M${r(it.x)} ${r(top)} C${r(it.x - fw * 0.35)} ${r(top + s * 0.35)} ${r(it.x - fw * 0.6)} ${r(top - s * 0.15)} ${r(it.x - fw)} ${r(top + s * 0.45)} C${r(it.x - fw * 0.6)} ${r(top + s * 0.6)} ${r(it.x - fw * 0.35)} ${r(top + s)} ${r(it.x)} ${r(top + s * 1.1)} Z`,
          fill: it.color,
          stroke: '#1E4D1E',
          'stroke-width': 0.12,
        }, g);
      }
      text(it.label, g);
    }
  }

  // Ramme rundt planen og lane-kolonnen
  const yTop = L.calendarTop.length ? L.calendarTop[0].y : y0;
  node('rect', { x: left, y: yTop, width: x1 - left, height: y1 - yTop, fill: 'none', stroke: '#000000', 'stroke-width': 0.35 }, svg);
  node('line', { x1: x0, x2: x0, y1: yTop, y2: y1, stroke: '#000000', 'stroke-width': 0.35 }, svg);

  // Legend
  const leg = node('g', { class: 'legend' }, svg);
  L.legend.forEach((e) => {
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const s = e.h / 2;
    if (e.symbol === 'diamond') {
      node('path', { d: `M${r(cx)} ${r(cy - s)} L${r(cx + s)} ${r(cy)} L${r(cx)} ${r(cy + s)} L${r(cx - s)} ${r(cy)} Z`, fill: '#FF0000', stroke: '#000000', 'stroke-width': 0.3 }, leg);
    } else if (e.symbol === 'flag') {
      node('line', { x1: cx + s * 0.6, x2: cx + s * 0.6, y1: cy - s, y2: cy + s, stroke: '#404040', 'stroke-width': 0.3 }, leg);
      node('path', { d: `M${r(cx + s * 0.6)} ${r(cy - s)} L${r(cx - s * 1.2)} ${r(cy - s * 0.45)} L${r(cx + s * 0.6)} ${r(cy + s * 0.1)} Z`, fill: '#008000' }, leg);
    } else if (e.symbol === 'holiday') {
      node('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: 'url(#ferie)', stroke: '#C8C8C8', 'stroke-width': 0.12 }, leg);
    } else {
      node('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: e.fill, stroke: e.border ?? '#7F7F7F', 'stroke-width': ny ? 0.25 : 0.2 }, leg);
      if (!ny) text({ x: cx, y: e.label.y, lines: ['X'], size: e.label.size, color: e.textColor, anchor: 'middle' }, leg);
    }
    text(e.label, leg);
  });

  text(L.title, svg);
  text(L.subtitle, svg);
  return svg;
}
