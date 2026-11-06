import type { Layout, TextBlock } from '../layout/layout';
import { LINE_HEIGHT } from '../layout/text';

export const FONT_FAMILY = "Calibri, Carlito, 'Segoe UI', Arial, sans-serif";
const NS = 'http://www.w3.org/2000/svg';
const GRID = '#C8C8C8';
const LINE = '#7F7F7F';

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
  if (t.bold) attrs['font-weight'] = 'bold';
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

  const { x0, x1, y0, y1 } = L.plot;
  const left = L.laneTitleX;

  // Lanes: bakgrunn og skillelinjer
  const lanesG = node('g', { class: 'lanes' }, svg);
  L.lanes.forEach((ln) => {
    if (ln.fill && ln.fill.toUpperCase() !== '#FFFFFF') node('rect', { x: left, y: ln.y0, width: x1 - left, height: ln.y1 - ln.y0, fill: ln.fill }, lanesG);
  });

  // Ferier
  const hol = node('g', { class: 'holidays' }, svg);
  L.holidays.forEach((h) => node('rect', { x: h.x0, y: y0, width: Math.max(0.3, h.x1 - h.x0), height: y1 - y0, fill: '#000000', 'fill-opacity': 0.07 }, hol));

  // Rutenett
  const grid = node('g', { class: 'grid' }, svg);
  L.grid.forEach((g) => node('line', { x1: g.x, x2: g.x, y1: y0, y2: y1, stroke: g.strong ? LINE : GRID, 'stroke-width': g.strong ? 0.25 : 0.15 }, grid));
  L.lanes.forEach((ln, i) => {
    if (i > 0) node('line', { x1: left, x2: x1, y1: ln.y0, y2: ln.y0, stroke: LINE, 'stroke-width': 0.25 }, lanesG);
    text(ln.title, lanesG);
  });

  // Kalender
  const cal = node('g', { class: 'calendar' }, svg);
  [...L.calendarTop, ...L.calendarBottom].forEach((row) => {
    row.cells.forEach((c) => {
      node('rect', { x: c.x0, y: row.y, width: c.x1 - c.x0, height: row.h, fill: '#F2F2F2', stroke: LINE, 'stroke-width': 0.2 }, cal);
      if (c.label)
        text({ x: (c.x0 + c.x1) / 2, y: row.y + row.h / 2 + row.size * 0.35, lines: [c.label], size: row.size, color: '#000000', anchor: 'middle', bold: row.cells.length < 60 && c.strong }, cal);
    });
  });

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
        const [ax, ay, bx, by] = it.callout.leader;
        node('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: '#404040', 'stroke-width': 0.2 }, g);
        const cb = it.callout.box;
        node('rect', { x: cb.x, y: cb.y, width: cb.w, height: cb.h, fill: '#FFFFFF', 'fill-opacity': 0.75 }, g);
        node('line', { x1: cb.x, x2: cb.x, y1: cb.y, y2: cb.y + cb.h, stroke: '#404040', 'stroke-width': 0.35 }, g);
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
    } else {
      const s = it.size / 2;
      if (it.symbol === 'diamond') {
        node('path', { d: `M${it.x} ${it.y - s} L${it.x + s} ${it.y} L${it.x} ${it.y + s} L${it.x - s} ${it.y} Z`, fill: it.color, stroke: '#000000', 'stroke-width': 0.15 }, g);
      } else {
        node('line', { x1: it.x, x2: it.x, y1: it.y - s, y2: it.y + s, stroke: '#000000', 'stroke-width': 0.3 }, g);
        node('path', { d: `M${it.x} ${it.y - s} L${it.x + s * 1.4} ${it.y - s * 0.55} L${it.x} ${it.y - s * 0.1} Z`, fill: it.color, stroke: '#000000', 'stroke-width': 0.15 }, g);
      }
      const lb = it.labelBox;
      node('rect', { x: lb.x, y: lb.y, width: lb.w, height: lb.h, fill: '#FFFFFF', 'fill-opacity': 0.75 }, g);
      text({ ...it.label, lines: it.label.lines }, g);
    }
  }

  // Ramme rundt planen og lane-kolonnen
  const yTop = L.calendarTop.length ? L.calendarTop[0].y : y0;
  node('rect', { x: left, y: yTop, width: x1 - left, height: y1 - yTop, fill: 'none', stroke: '#000000', 'stroke-width': 0.35 }, svg);
  node('line', { x1: x0, x2: x0, y1: yTop, y2: y1, stroke: '#000000', 'stroke-width': 0.35 }, svg);

  // Legend
  const leg = node('g', { class: 'legend' }, svg);
  L.legend.forEach((e) => {
    node('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: e.fill, stroke: e.border ?? '#7F7F7F', 'stroke-width': 0.2 }, leg);
    text(e.label, leg);
  });

  text(L.title, svg);
  text(L.subtitle, svg);
  return svg;
}
