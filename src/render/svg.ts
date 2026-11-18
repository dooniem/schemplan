import { CHANGE_COLOR, FLAG_HOIST, FLAG_WAVE, type BoxItem, type Layout, type TextBlock } from '../layout/layout';
import { LINE_HEIGHT } from '../layout/text';
import { dashArray } from '../layout/critical';
import type { PlacedImage } from '../layout/image';
import type { PlacedArrow } from '../layout/arrow';
import { isStraight } from '../layout/area';
import { markRects, markShapes, type MarkKind } from '../layout/marks';

// Carlito følger med appen og bygges inn i PDF-en, så skjerm og PDF blir like
export const FONT_FAMILY = "Carlito, Calibri, 'Segoe UI', Arial, sans-serif";
/** Hvor langt spissen på en boks som fortsetter utenfor kalenderen går inn i boksen, i mm. */
const ARROW_MM = 1.6;
const NS = 'http://www.w3.org/2000/svg';
const GRID = '#C8C8C8';
const MONTH_DOT = '#ADADAF';
const LEADER = '#1F2D3D';
const r = (v: number) => Math.round(v * 1000) / 1000;
/** Gjennomsiktig fyll på bokser bak de andre; kanten er hel. */
const seeThrough = (it: BoxItem): Attrs => (it.fillOpacity !== undefined && it.fillOpacity < 1 ? { 'fill-opacity': r(it.fillOpacity) } : {});

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
  // Datoraden (sub) er mindre enn resten, så linjeavstanden regnes per linje
  const sub = t.sub;
  const isSub = (i: number) => !!sub && i >= sub.from;
  const hOf = (i: number) => (isSub(i) ? sub!.size * LINE_HEIGHT : lh);
  const total = t.lines.reduce((sum, _l, i) => sum + hOf(i), 0);
  t.lines.forEach((line, i) => {
    const span = node('tspan', { x: t.x }, el);
    // Rotert: linjene står side om side, sentrert om (x, y)
    if (t.rotate) span.setAttribute('dy', String(i === 0 ? -(total - hOf(0)) / 2 : (hOf(i - 1) + hOf(i)) / 2));
    else if (i > 0) span.setAttribute('dy', String(hOf(i)));
    if (t.boldLines?.[i]) span.setAttribute('font-weight', 'bold');
    if (isSub(i)) {
      span.setAttribute('font-size', String(Math.round(sub!.size * 1000) / 1000));
      span.setAttribute('fill', sub!.color);
      span.setAttribute('font-weight', 'normal');
      span.setAttribute('class', 'box-dates');
    }
    span.textContent = line;
  });
  return el;
}

/**
 * Tegner et bilde med beskjæring. Gruppen er flyttet og rotert, så beskjæringen kan regnes i
 * bildets egne mål. suffix skiller klippene når samme bilde tegnes flere ganger (markering ved redigering).
 */
export function drawImage(p: PlacedImage, parent: Element, suffix = '', opts: { full?: boolean; opacity?: number } = {}) {
  const g = node('g', { 'data-image': p.id, ...(p.milestone ? { 'data-for': p.milestone } : {}), transform: `translate(${r(p.cx)} ${r(p.cy)}) rotate(${r(p.rotation)})` }, parent);
  if (opts.opacity !== undefined) g.setAttribute('opacity', String(opts.opacity));
  const x = -p.w / 2;
  const y = -p.h / 2;
  const img = node('image', { x, y, width: p.w, height: p.h, href: p.href, preserveAspectRatio: 'none' });
  if (opts.full) {
    g.append(img);
    return g;
  }
  const key = `${p.id}${suffix}`.replace(/[^A-Za-z0-9_-]/g, '_');
  const defs = node('defs', {}, g);
  const [u0, v0, u1, v1] = p.crop;
  const rc = node('clipPath', { id: `imc-${key}` }, defs);
  node('rect', { x: x + u0 * p.w, y: y + v0 * p.h, width: (u1 - u0) * p.w, height: (v1 - v0) * p.h }, rc);
  const inner = node('g', { 'clip-path': `url(#imc-${key})` }, g);
  if (p.points) {
    const pc = node('clipPath', { id: `imp-${key}` }, defs);
    node('polygon', { points: p.points.map(([u, v]) => `${r(x + u * p.w)},${r(y + v * p.h)}`).join(' ') }, pc);
    img.setAttribute('clip-path', `url(#imp-${key})`);
  }
  inner.append(img);
  return g;
}

/** Pil fra en fritekst: streken og en fylt pilspiss. Bare path, så PDF-en tegner den som vektor. */
/** Ikonet for høylytt arbeid eller nattarbeid i kvadratet (x, y) med siden s. */
export function drawMark(kind: MarkKind, x: number, y: number, s: number, parent: Element, customHref: string | null = null) {
  const g = node('g', { class: `mark mark-${kind}` }, parent);
  // Eget merke: bildet brukeren lastet opp, tilpasset kvadratet uten å forvrenges. PDF-en tegner det for seg (mark-img).
  if (kind === 'custom') {
    if (customHref) node('image', { class: 'mark-img', x: r(x), y: r(y), width: r(s), height: r(s), href: customHref, preserveAspectRatio: 'xMidYMid meet' }, g);
    return;
  }
  for (const sh of markShapes(kind, x, y, s)) node(sh.tag, sh.attrs, g);
}

export function drawArrow(a: PlacedArrow, parent: Element) {
  const g = node('g', { 'data-arrow': a.id }, parent);
  node('path', { d: a.d, fill: 'none', stroke: a.color, 'stroke-width': r(a.width) }, g);
  const [t, b1, b2] = a.head;
  node('path', { d: `M ${r(t.x)} ${r(t.y)} L ${r(b1.x)} ${r(b1.y)} L ${r(b2.x)} ${r(b2.y)} Z`, fill: a.color }, g);
  // Bred, usynlig strek som er lett å treffe med musen ved redigering
  node('path', { d: a.hit, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(2.5, r(a.width * 3)), class: 'arrow-hit' }, g);
  return g;
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

  // Egendefinert planområde: striper, lanes, ferier, rutenett og milepælslinjer klippes til omrisset.
  // data-clip leses av PDF-eksporten.
  const area = L.area;
  const clipAttrs: Record<string, string> = {};
  if (area) {
    const pts = area.polygon.map(([x, y]) => `${r(x)} ${r(y)}`).join(' ');
    const cp = node('clipPath', { id: 'plan-area' }, defs);
    node('polygon', { points: pts }, cp);
    Object.assign(clipAttrs, { 'clip-path': 'url(#plan-area)', 'data-clip': pts });
  }
  const back = area ? node('g', { class: 'plan-area', ...clipAttrs }, svg) : svg;

  // Annenhver måned (eller uke) skyggelagt, lysere i annenhver lane
  const bands = node('g', { class: 'bands' }, back);
  L.bands.forEach((b) => {
    const top = b.y0 ?? y0;
    const bottom = b.y1 ?? y1;
    node('rect', { x: b.x0, y: top, width: b.x1 - b.x0, height: bottom - top, fill: b.fill }, bands);
  });

  // Lanes: tittelcelle med lanefarge, tynne skillelinjer i planområdet
  const lanesG = node('g', { class: 'lanes' }, back);
  L.lanes.forEach((ln, i) => {
    node('rect', { x: ln.titleX0, y: ln.y0, width: x0 - ln.titleX0, height: ln.y1 - ln.y0, fill: ln.fill ?? '#FFFFFF', stroke: '#000000', 'stroke-width': 0.3 }, lanesG);
    if (i > 0) node('line', { x1: x0, x2: x1, y1: ln.y0, y2: ln.y0, stroke: GRID, 'stroke-width': 0.15 }, lanesG);
    text(ln.title, lanesG);
  });
  // Grupper av lanes: smal bar til venstre for lane-navnene
  L.laneGroups.forEach((gr) => {
    const g = node('g', { 'data-lane-group': gr.id }, lanesG);
    node('rect', { x: gr.x0, y: gr.y0, width: gr.x1 - gr.x0, height: gr.y1 - gr.y0, fill: gr.fill, stroke: '#000000', 'stroke-width': 0.3 }, g);
    text(gr.title, g);
  });

  // Ferier: skravert
  const hol = node('g', { class: 'holidays' }, back);
  L.holidays.forEach((h) =>
    node('rect', { x: h.x0, y: y0, width: Math.max(0.3, h.x1 - h.x0), height: y1 - y0, fill: 'url(#ferie)', stroke: '#C8C8C8', 'stroke-width': 0.12 }, hol),
  );

  // Rutenett: kraftig strek ved årsskifte
  const grid = node('g', { class: 'grid' }, back);
  L.grid.forEach((g) => {
    if (g.strong) node('line', { x1: g.x, x2: g.x, y1: y0, y2: y1, stroke: '#000000', 'stroke-width': 0.45 }, grid);
    else if (g.month && ny) node('line', { x1: g.x, x2: g.x, y1: y0, y2: y1, stroke: GRID, 'stroke-width': 0.15 }, grid);
    // Excel-lik: prikket grå strek ved månedsskifte, som rammen Excel la rundt hver måned
    else if (g.month) node('line', { x1: g.x, x2: g.x, y1: y0, y2: y1, stroke: MONTH_DOT, 'stroke-width': 0.25, 'stroke-dasharray': '0.35 0.35' }, grid);
  });

  // Omrisset der kantene er dratt inn, så planen ser avsluttet ut mot det ledige feltet
  if (area) {
    const edge = (pts: [number, number][]) => pts.map(([x, y], k) => `${k ? 'L' : 'M'}${r(x)} ${r(y)}`).join(' ');
    const outline = node('g', { class: 'plan-outline' }, svg);
    for (const e of [area.top, area.bottom]) if (!isStraight(e)) node('path', { d: edge(e), fill: 'none', stroke: '#000000', 'stroke-width': 0.3, 'stroke-linejoin': 'round' }, outline);
  }

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
  // Ukesraden i Excel-lik stil: månedsskiftet prikkes over den svarte cellekanten
  [...L.calendarTop, ...L.calendarBottom].forEach((row) => {
    if (!row.dotMonths) return;
    L.grid.forEach((g) => {
      if (!g.month || g.strong) return;
      node('line', { x1: g.x, x2: g.x, y1: row.y, y2: row.y + row.h, stroke: '#FFFFFF', 'stroke-width': 0.3 }, cal);
      node('line', { x1: g.x, x2: g.x, y1: row.y, y2: row.y + row.h, stroke: MONTH_DOT, 'stroke-width': 0.3, 'stroke-dasharray': '0.35 0.35' }, cal);
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

  // Milepælslinjer bak boksene. Det som hører til en boks, men tegnes utenfor den, merkes med
  // boksens id (data-for), så et filter kan skjule alt samlet.
  const vlines = node('g', { class: 'milestone-lines' }, area ? node('g', clipAttrs, svg) : svg);
  L.items.forEach((it) => {
    if (it.kind === 'milestone' && it.verticalLine) node('line', { 'data-for': it.id, x1: it.x, x2: it.x, y1: y0, y2: y1, stroke: it.color, 'stroke-width': 0.5 }, vlines);
  });

  // Endringer fra siste oppdatering: stiplet omriss der boksen sto før, bak boksene
  if (L.changes.some((c) => c.ghost)) {
    const gg = node('g', { class: 'change-ghosts', 'pointer-events': 'none' }, svg);
    for (const c of L.changes)
      if (c.ghost) node('rect', { 'data-for': c.id, x: c.ghost.x0, y: c.y, width: Math.max(0.6, c.ghost.x1 - c.ghost.x0), height: c.h, fill: CHANGE_COLOR, 'fill-opacity': 0.08, stroke: CHANGE_COLOR, 'stroke-width': 0.3, 'stroke-dasharray': '1 0.7' }, gg);
  }

  // Bokser og milepæler
  const itemsG = node('g', { class: 'items' }, svg);
  const markEdges: [BoxItem, number][] = [];
  for (const it of L.items) {
    // Multi Lane-bokser går over flere lanes og klippes til planområdets omriss
    const g = node('g', { 'data-id': it.id, ...(it.kind === 'box' && it.span ? clipAttrs : {}) }, itemsG);
    if (it.kind === 'box') {
      if (it.callout) {
        const cb = it.callout.box;
        node('rect', { x: cb.x, y: cb.y, width: cb.w, height: cb.h, fill: '#FFFFFF', 'fill-opacity': ny ? 0.6 : 0.75 }, g);
        text(it.callout.text, g);
      }
      // Boksen fortsetter utenfor kalenderen: spissen står innenfor kanten, så den ikke går inn i
      // lane-kolonnen eller ut av arket. Spissen er aldri mer enn en tredjedel av boksen.
      const tip = Math.min(ARROW_MM, (it.x1 - it.x0) / 3);
      const xl = it.arrowLeft ? it.x0 + tip : it.x0;
      const xr = it.arrowRight ? it.x1 - tip : it.x1;
      if (!it.arrowLeft && !it.arrowRight) {
        node('rect', { x: it.x0, y: it.y, width: it.x1 - it.x0, height: it.h, fill: it.fill, ...seeThrough(it), stroke: it.border ?? 'none', 'stroke-width': it.border ? 0.25 : 0 }, g);
      } else {
        const mid = it.y + it.h / 2;
        const bottom = it.y + it.h;
        const d = `M${xl} ${it.y} L${xr} ${it.y} ${it.arrowRight ? `L${it.x1} ${mid} ` : ''}L${xr} ${bottom} L${xl} ${bottom} ${it.arrowLeft ? `L${it.x0} ${mid} ` : ''}Z`;
        node('path', { d, fill: it.fill, ...seeThrough(it), stroke: it.border ?? 'none', 'stroke-width': it.border ? 0.25 : 0 }, g);
      }
      if (it.text) text(it.text, g);
      // Høylytt arbeid og nattarbeid på høyre kant, innenfor pilspissen når boksen fortsetter
      if (it.marks) markEdges.push([it, xr]);
      if (it.callout) {
        // Leder og strek tegnes oppå boksen, slik Excel-callouten gjør
        const pts = it.callout.leader;
        const d = pts.reduce((acc, v, k) => acc + (k % 2 === 0 ? `${k === 0 ? 'M' : ' L'}${r(v)}` : ` ${r(v)}`), '');
        node('path', { d, fill: 'none', stroke: LEADER, 'stroke-width': 0.3 }, g);
        const cb = it.callout.box;
        const bx = pts[pts.length - 2];
        const by = pts[pts.length - 1];
        // Streken følger callout-teksten, og når alltid ned eller opp til lederen, også når boksen er høyere
        node('line', { x1: bx, x2: bx, y1: Math.min(cb.y, by), y2: Math.max(cb.y + cb.h, by), stroke: LEADER, 'stroke-width': 0.35 }, g);
      }
    } else {
      const s = it.size / 2;
      const lb = it.labelBox;
      node('rect', { x: lb.x, y: lb.y, width: lb.w, height: lb.h, fill: '#FFFFFF', 'fill-opacity': labelBg }, g);
      const left = lb.x >= it.x;
      if (it.imageSymbol) {
        // Bildet er symbolet og tegnes oppå planen sammen med de andre bildene
      } else if (it.symbol === 'diamond' && it.label.rotate) {
        // Rotert: strek fra ruteren til en vannrett strek langs teksten, over den eller under den
        const below = lb.y < it.y;
        const barY = below ? lb.y + lb.h : lb.y;
        // Med loddrett linje står teksten ved siden av: streken går da skrått bort til den vannrette streken
        const ex = it.verticalLine ? (lb.x >= it.x ? lb.x + Math.min(lb.w, 2) / 2 : lb.x + lb.w - Math.min(lb.w, 2) / 2) : Math.min(Math.max(it.x - s * 0.3, lb.x + 0.2), lb.x + lb.w - 0.2);
        node('line', { x1: it.x, x2: ex, y1: it.y, y2: barY, stroke: LEADER, 'stroke-width': 0.3 }, g);
        node('line', { x1: lb.x, x2: lb.x + lb.w, y1: barY, y2: barY, stroke: LEADER, 'stroke-width': 0.35 }, g);
        node('path', { d: `M${r(it.x)} ${r(it.y - s)} L${r(it.x + s)} ${r(it.y)} L${r(it.x)} ${r(it.y + s)} L${r(it.x - s)} ${r(it.y)} Z`, fill: it.color, stroke: '#000000', 'stroke-width': 0.3 }, g);
      } else if (it.symbol === 'diamond') {
        // Ruter, strek bort til en loddrett strek foran teksten
        const bar = left ? lb.x : lb.x + lb.w;
        node('line', { x1: it.x, x2: bar, y1: it.y, y2: it.y + s * 0.3, stroke: LEADER, 'stroke-width': 0.3 }, g);
        node('line', { x1: bar, x2: bar, y1: lb.y, y2: lb.y + lb.h, stroke: LEADER, 'stroke-width': 0.35 }, g);
        node('path', { d: `M${r(it.x)} ${r(it.y - s)} L${r(it.x + s)} ${r(it.y)} L${r(it.x)} ${r(it.y + s)} L${r(it.x - s)} ${r(it.y)} Z`, fill: it.color, stroke: '#000000', 'stroke-width': 0.3 }, g);
      } else {
        // Flagg: stangen står på datoen og går ned langs teksten, duken vaier mot venstre.
        // Snudd flagg: stangen ligger øverst og går bortover fra datoen, duken henger ned fra den.
        const top = it.y - s;
        const d = it.turned;
        // Punkt på duken, målt fra toppen av stangen: ut fra stangen (u) og langs den (v)
        const at = (u: number, v: number) => (d ? `${r(it.x + d * v)} ${r(top + u)}` : `${r(it.x - u)} ${r(top + v)}`);
        if (d) node('line', { x1: it.x, x2: it.x + d * Math.max(FLAG_HOIST * s + 0.3, lb.w), y1: top, y2: top, stroke: '#404040', 'stroke-width': 0.3 }, g);
        else node('line', { x1: it.x, x2: it.x, y1: top, y2: Math.max(it.y + s, lb.y + lb.h), stroke: '#404040', 'stroke-width': 0.3 }, g);
        const fw = s * FLAG_WAVE;
        node('path', {
          d: `M${at(0, 0)} C${at(fw * 0.35, s * 0.35)} ${at(fw * 0.6, -s * 0.15)} ${at(fw, s * 0.45)} C${at(fw * 0.6, s * 0.6)} ${at(fw * 0.35, s)} ${at(0, s * FLAG_HOIST)} Z`,
          fill: it.color,
          stroke: '#1E4D1E',
          'stroke-width': 0.12,
        }, g);
      }
      text(it.label, g);
    }
  }
  // Ikonene ligger oppå alle boksene, så delen som stikker ut ikke dekkes av naboen
  if (markEdges.length) {
    const mg = node('g', { class: 'marks', 'pointer-events': 'none' }, svg);
    for (const [it, edge] of markEdges) {
      const g = node('g', { 'data-for': it.id }, mg);
      for (const m of markRects(it.marks!, edge, it.y, it.h, it.lineBoxH ?? it.h)) drawMark(m.kind, m.x, m.y, m.s, g, L.customMark);
    }
  }

  // Kritisk linje oppå boksene. Klikk går gjennom den til boksene under.
  // Fremdrift (stripe nederst i boksen) og baseline (strek under boksen)
  if (L.progress.length) {
    const pg = node('g', { class: 'progress', 'pointer-events': 'none' }, svg);
    for (const m of L.progress) {
      if (m.done) {
        const sh = Math.min(1.2, Math.max(0.5, m.h * 0.22));
        node('rect', { 'data-for': m.id, x: m.x0, y: m.y + m.h - sh, width: (m.x1 - m.x0) * m.done, height: sh, fill: '#000000', 'fill-opacity': 0.4 }, pg);
      }
      if (m.base) {
        const by = m.y + m.h + 0.45;
        node('path', { 'data-for': m.id, d: `M${r(m.base.x0)} ${r(by - 0.35)} L${r(m.base.x0)} ${r(by)} L${r(m.base.x1)} ${r(by)} L${r(m.base.x1)} ${r(by - 0.35)}`, fill: 'none', stroke: '#404040', 'stroke-width': 0.25 }, pg);
      }
    }
  }

  // Ramme rundt det som er nytt eller har nye datoer
  if (L.changes.length) {
    const cg = node('g', { class: 'change-marks', 'pointer-events': 'none' }, svg);
    const pad = 0.5;
    for (const c of L.changes)
      node('rect', { 'data-for': c.id, x: c.x0 - pad, y: c.y - pad, width: c.x1 - c.x0 + pad * 2, height: c.h + pad * 2, rx: 0.6, fill: 'none', stroke: CHANGE_COLOR, 'stroke-width': c.kind === 'new' ? 0.6 : 0.4, ...(c.kind === 'moved' ? { 'stroke-dasharray': '1.6 0.8' } : {}) }, cg);
  }

  // Linje 1 tegnes sist, så den ligger øverst der linjene møtes
  for (const c of [...L.criticals].reverse()) {
    if (c.points.length < 4) continue;
    const d = c.points.reduce((acc, v, k) => acc + (k % 2 === 0 ? `${k === 0 ? 'M' : ' L'}${r(v)}` : ` ${r(v)}`), '');
    const dash = dashArray(c.dash, c.width);
    node('path', { class: 'critical-line', 'data-line': c.n, d, fill: 'none', stroke: c.color, 'stroke-width': c.width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...(dash ? { 'stroke-dasharray': dash.map(r).join(' ') } : {}), 'pointer-events': 'none' }, svg);
  }

  // Linjen for i dag: tynn og stiplet, så den ikke forveksles med statuslinjen
  if (L.todayX !== null) {
    const g = node('g', { class: 'today-line', 'pointer-events': 'none' }, area ? node('g', clipAttrs, svg) : svg);
    node('line', { x1: L.todayX, x2: L.todayX, y1: y0, y2: y1, stroke: '#1F6FB2', 'stroke-width': 0.35, 'stroke-dasharray': '2 1' }, g);
  }

  // Statuslinjen oppå boksene, med datoen i en lapp øverst
  if (L.status) {
    const st = L.status;
    const g = node('g', { class: 'status-line', 'pointer-events': 'none' }, svg);
    if (st.front && st.front.points.length > 4) {
      // Fronten erstatter den rette streken, men i samme farge og tykkelse
      const p = st.front.points;
      const d = p.reduce((acc, v, k) => acc + (k % 2 === 0 ? `${k === 0 ? 'M' : ' L'}${r(v)}` : ` ${r(v)}`), '');
      node('path', { d, fill: 'none', stroke: st.color, 'stroke-width': st.width, 'stroke-linejoin': 'round' }, g);
      st.front.labels.forEach((l) => {
        node('rect', { x: l.x, y: l.y, width: l.w, height: l.h, fill: st.color }, g);
        text(l.text, g);
      });
    } else node('line', { x1: st.x, x2: st.x, y1: st.y0, y2: st.y1, stroke: st.color, 'stroke-width': st.width }, g);
    if (st.tag) {
      node('rect', { x: st.tag.x, y: st.tag.y, width: st.tag.w, height: st.tag.h, fill: st.color }, g);
      text(st.tag.text, g);
    }
  }

  // Ramme rundt planen og lane-kolonnen
  const yTop = L.calendarTop.length ? L.calendarTop[0].y : y0;
  node('rect', { x: left, y: yTop, width: x1 - left, height: y1 - yTop, fill: 'none', stroke: '#000000', 'stroke-width': 0.35 }, svg);
  node('line', { x1: x0, x2: x0, y1: yTop, y2: y1, stroke: '#000000', 'stroke-width': 0.35 }, svg);

  // Utkikk: hele planen i miniatyr, med perioden som vises markert
  if (L.overview) {
    const o = L.overview;
    const ov = node('g', { class: 'overview' }, svg);
    if (o.upcoming) text(o.upcoming, ov);
    node('rect', { x: left, y: o.y0, width: o.x1 - left, height: o.y1 - o.y0, fill: '#FFFFFF', stroke: '#000000', 'stroke-width': 0.3 }, ov);
    node('line', { x1: o.x0, x2: o.x0, y1: o.y0, y2: o.y1, stroke: '#000000', 'stroke-width': 0.3 }, ov);
    text(o.label, ov);
    o.months.forEach((x) => node('line', { x1: x, x2: x, y1: o.y0, y2: o.y1, stroke: '#E3E3E3', 'stroke-width': 0.12 }, ov));
    o.years.forEach((y) => {
      if (y.x > o.x0) node('line', { x1: y.x, x2: y.x, y1: o.y0, y2: o.y1 + 1.2, stroke: '#7F7F7F', 'stroke-width': 0.25 }, ov);
      text(y.label, ov);
    });
    o.bars.forEach((b) => node('rect', { x: b.x0, y: b.y, width: b.x1 - b.x0, height: b.h, fill: b.fill }, ov));
    // Utenfor perioden tones ned, perioden får ramme
    const w = o.window;
    if (w.x0 > o.x0) node('rect', { x: o.x0, y: o.y0, width: w.x0 - o.x0, height: o.y1 - o.y0, fill: '#FFFFFF', 'fill-opacity': 0.6 }, ov);
    if (w.x1 < o.x1) node('rect', { x: w.x1, y: o.y0, width: o.x1 - w.x1, height: o.y1 - o.y0, fill: '#FFFFFF', 'fill-opacity': 0.6 }, ov);
    node('rect', { x: w.x0, y: o.y0 - 0.4, width: w.x1 - w.x0, height: o.y1 - o.y0 + 0.8, fill: 'none', stroke: '#C00000', 'stroke-width': 0.45 }, ov);
  }

  if (L.upcoming) text(L.upcoming, node('g', { class: 'overview' }, svg));

  // Legend
  const legG = node('g', { class: 'legend' }, svg);
  L.legend.forEach((e) => {
    // Hvert fag i sin egen gruppe, så det kan velges ved redigering
    const mark: Attrs = e.symbol === 'loud' || e.symbol === 'night' || e.symbol === 'custom' ? { 'data-mark': e.symbol } : {};
    const leg = e.trade ? node('g', { 'data-trade': e.trade }, legG) : node('g', { 'data-legend': e.key, ...mark }, legG);
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const s = e.h / 2;
    if (e.symbol === 'diamond') {
      node('path', { d: `M${r(cx)} ${r(cy - s)} L${r(cx + s)} ${r(cy)} L${r(cx)} ${r(cy + s)} L${r(cx - s)} ${r(cy)} Z`, fill: '#FF0000', stroke: '#000000', 'stroke-width': 0.3 }, leg);
    } else if (e.symbol === 'flag') {
      node('line', { x1: cx + s * 0.6, x2: cx + s * 0.6, y1: cy - s, y2: cy + s, stroke: '#404040', 'stroke-width': 0.3 }, leg);
      node('path', { d: `M${r(cx + s * 0.6)} ${r(cy - s)} L${r(cx - s * 1.2)} ${r(cy - s * 0.45)} L${r(cx + s * 0.6)} ${r(cy + s * 0.1)} Z`, fill: '#008000' }, leg);
    } else if (e.symbol === 'new' || e.symbol === 'moved') {
      node('rect', { x: e.x, y: e.y, width: e.w, height: e.h, rx: 0.4, fill: '#FFFFFF', stroke: CHANGE_COLOR, 'stroke-width': e.symbol === 'new' ? 0.6 : 0.4, ...(e.symbol === 'moved' ? { 'stroke-dasharray': '1.6 0.8' } : {}) }, leg);
    } else if (e.symbol === 'loud' || e.symbol === 'night' || e.symbol === 'custom') {
      drawMark(e.symbol, cx - e.h / 2, e.y, e.h, leg, L.customMark);
    } else if (e.symbol === 'holiday') {
      node('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: 'url(#ferie)', stroke: '#C8C8C8', 'stroke-width': 0.12 }, leg);
    } else {
      node('rect', { x: e.x, y: e.y, width: e.w, height: e.h, fill: e.fill, stroke: e.border ?? '#7F7F7F', 'stroke-width': ny ? 0.25 : 0.2 }, leg);
      if (!ny) text({ x: cx, y: e.label.y, lines: ['X'], size: e.label.size, color: e.textColor, anchor: 'middle' }, leg);
    }
    text(e.label, leg);
  });

  // Piler fra fritekst ligger under teksten de kommer fra. Gruppen tegnes alltid, så en ny pil kan vises mens den dras.
  const ag = node('g', { class: 'note-arrows' }, svg);
  L.arrows.forEach((a) => drawArrow(a, ag));

  // Bilder satt inn i appen ligger oppå planen
  if (L.images.length) {
    const ig = node('g', { class: 'images' }, svg);
    L.images.forEach((im) => drawImage(im, ig));
  }

  if (L.logo) node('image', { x: L.logo.x, y: L.logo.y, width: L.logo.w, height: L.logo.h, href: L.logo.href, preserveAspectRatio: 'xMinYMid meet' }, svg);
  text(L.title, svg);
  if (L.headerRight) text(L.headerRight, svg);
  text(L.subtitle, svg);
  return svg;
}
