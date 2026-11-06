// Tegner SVG-en fra renderPlan inn på en PDF-side som ren vektor.
// Bare det renderPlan bruker er støttet: rect, line, path (M L C Z), text/tspan, g,
// fill-opacity, rotate() på tekst og skravurmønsteret for ferier.
import {
  LineCapStyle,
  LineJoinStyle,
  setLineCap,
  setDashPattern,
  setLineJoin,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFPage,
  appendBezierCurve,
  beginText,
  clip,
  closePath,
  concatTransformationMatrix,
  endPath,
  endText,
  fill,
  fillAndStroke,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  showText,
  stroke,
  type PDFOperator,
} from 'pdf-lib';
import { LINE_HEIGHT } from '../layout/text';

export const MM_TO_PT = 72 / 25.4;

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  ops: PDFOperator[];
  fonts: Fonts;
  fontNames: Map<PDFFont, PDFName>;
  alpha: Map<number, PDFName>;
}

const num = (el: Element, a: string, d = 0) => {
  const v = el.getAttribute(a);
  return v === null || v === '' ? d : Number(v);
};

function rgb(hex: string): [number, number, number] | null {
  if (!hex || hex === 'none') return null;
  const s = hex.replace('#', '');
  const f = s.length === 3 ? s.replace(/./g, (c) => c + c) : s;
  if (!/^[0-9a-fA-F]{6}$/.test(f)) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** Arver presentasjonsattributter fra foreldre, som SVG gjør. */
function attr(el: Element, name: string): string | null {
  for (let e: Element | null = el; e && e.tagName !== 'svg'; e = e.parentElement) {
    const v = e.getAttribute(name);
    if (v !== null) return v;
  }
  return null;
}

function alphaState(c: Ctx, a: number): PDFName {
  const key = Math.round(a * 100);
  let n = c.alpha.get(key);
  if (!n) {
    const gs = c.doc.context.obj({ Type: 'ExtGState', ca: key / 100, CA: key / 100 });
    n = c.page.node.newExtGState('GS', c.doc.context.register(gs));
    c.alpha.set(key, n);
  }
  return n;
}

function fontName(c: Ctx, f: PDFFont): PDFName {
  let n = c.fontNames.get(f);
  if (!n) {
    n = c.page.node.newFontDictionary(f.name, f.ref);
    c.fontNames.set(f, n);
  }
  return n;
}

/** Fyll og strek for et element. Returnerer false når det ikke er noe å tegne. */
function paint(c: Ctx, el: Element): 'f' | 's' | 'b' | null {
  const fillC = rgb(attr(el, 'fill') ?? '#000000');
  const strokeC = rgb(attr(el, 'stroke') ?? 'none');
  const sw = Number(attr(el, 'stroke-width') ?? '1');
  const fo = Number(attr(el, 'fill-opacity') ?? '1');
  if (fillC) c.ops.push(setFillingRgbColor(...fillC));
  if (strokeC && sw > 0) c.ops.push(setStrokingRgbColor(...strokeC), setLineWidth(sw));
  if (strokeC && attr(el, 'stroke-linejoin') === 'round') c.ops.push(setLineJoin(LineJoinStyle.Round));
  if (strokeC && attr(el, 'stroke-linecap') === 'round') c.ops.push(setLineCap(LineCapStyle.Round));
  const dash = attr(el, 'stroke-dasharray');
  if (strokeC && dash && dash !== 'none') c.ops.push(setDashPattern(dash.split(/[\s,]+/).map(Number).filter((v) => v >= 0), 0));
  if (fo < 1) c.ops.push(setGraphicsState(alphaState(c, fo)));
  const s = !!strokeC && sw > 0;
  return fillC && s ? 'b' : fillC ? 'f' : s ? 's' : null;
}

const finish = (mode: 'f' | 's' | 'b') => (mode === 'b' ? fillAndStroke() : mode === 'f' ? fill() : stroke());

/** Skravur som i mønsteret #ferie: grå striper på 45°, 0,55 bred hver 1,4 mm. */
function hatch(c: Ctx, x: number, y: number, w: number, h: number) {
  c.ops.push(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath());
  c.ops.push(setFillingRgbColor(1, 1, 1), rectangle(x, y, w, h), fill());
  // Mønsteret er rotert 45° om origo; stripene er linjer x' = k * 1,4 i rotert rom
  c.ops.push(setStrokingRgbColor(0xd9 / 255, 0xd9 / 255, 0xd9 / 255), setLineWidth(0.55));
  // I mønsterrommet er stripen px ∈ [k·1,4, k·1,4 + 0,55], og px = (x + y)/√2. Linjen x + y = D, klippet til rektangelet.
  const P = 1.4;
  const k0 = Math.floor((x + y) / Math.SQRT2 / P) - 1;
  const k1 = Math.ceil((x + w + y + h) / Math.SQRT2 / P) + 1;
  const ya = y - w - h;
  const yb = y + h + w + h;
  for (let k = k0; k <= k1; k++) {
    const D = (k * P + 0.275) * Math.SQRT2;
    c.ops.push(moveTo(D - ya, ya), lineTo(D - yb, yb), stroke());
  }
  c.ops.push(popGraphicsState());
}

function drawPath(c: Ctx, d: string) {
  const tok = d.match(/[MLCZmlcz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  const n = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[MLCZ]/i.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') {
      c.ops.push(moveTo(n(), n()));
      cmd = 'L';
    } else if (cmd === 'L') c.ops.push(lineTo(n(), n()));
    else if (cmd === 'C') c.ops.push(appendBezierCurve(n(), n(), n(), n(), n(), n()));
    else if (cmd === 'Z' || cmd === 'z') c.ops.push(closePath());
    else i++;
  }
}

function drawText(c: Ctx, el: SVGTextElement) {
  const size = num(el, 'font-size', 3);
  const anchor = attr(el, 'text-anchor') ?? 'start';
  const color = rgb(attr(el, 'fill') ?? '#000000') ?? [0, 0, 0];
  let rot = 0;
  let cx = 0;
  let cy = 0;
  const tr = el.getAttribute('transform');
  const m = tr?.match(/rotate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/);
  if (m) [rot, cx, cy] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const lh = size * LINE_HEIGHT;
  let y = num(el, 'y');
  const spans = Array.from(el.children).filter((s) => s.tagName === 'tspan');
  const lines = spans.length ? spans : [el];
  lines.forEach((s, k) => {
    const dy = s.getAttribute('dy');
    if (dy !== null) y += Number(dy);
    else if (k > 0) y += lh;
    const txt = s.textContent ?? '';
    if (!txt) return;
    const bold = (attr(s, 'font-weight') ?? 'normal') === 'bold';
    const f = bold ? c.fonts.bold : c.fonts.regular;
    const safe = Array.from(txt).map((ch) => (f.getCharacterSet().includes(ch.codePointAt(0)!) ? ch : '?')).join('');
    const w = f.widthOfTextAtSize(safe, size);
    let x = num(s, 'x', num(el, 'x'));
    if (anchor === 'middle') x -= w / 2;
    else if (anchor === 'end') x -= w;
    // Glyfene speilvendes tilbake fordi siden tegnes med y nedover
    let a = 1, b = 0, cc = 0, d = -1, e = x, ff = y;
    if (rot) {
      const t = (rot * Math.PI) / 180;
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      // Punktet (x, y) rotert om (cx, cy)
      e = cx + (x - cx) * cos - (y - cy) * sin;
      ff = cy + (x - cx) * sin + (y - cy) * cos;
      [a, b, cc, d] = [cos, sin, sin, -cos];
    }
    c.ops.push(
      setFillingRgbColor(...color),
      beginText(),
      setFontAndSize(fontName(c, f), size),
      setTextMatrix(a, b, cc, d, e, ff),
      showText(f.encodeText(safe)),
      endText(),
    );
  });
}

function walk(c: Ctx, el: Element) {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName;
    // Markeringer fra redigeringen hører ikke til planen
    if (tag === 'defs' || child.classList.contains('edit-overlay')) continue;
    if (tag === 'g') {
      walk(c, child);
      continue;
    }
    if (tag === 'text') {
      drawText(c, child as SVGTextElement);
      continue;
    }
    c.ops.push(pushGraphicsState());
    if (tag === 'rect') {
      const x = num(child, 'x');
      const y = num(child, 'y');
      const w = num(child, 'width');
      const h = num(child, 'height');
      if ((child.getAttribute('fill') ?? '').startsWith('url(')) {
        hatch(c, x, y, w, h);
        const st = rgb(child.getAttribute('stroke') ?? 'none');
        if (st) c.ops.push(setStrokingRgbColor(...st), setLineWidth(num(child, 'stroke-width', 1)), rectangle(x, y, w, h), stroke());
      } else {
        const mode = paint(c, child);
        if (mode) c.ops.push(rectangle(x, y, w, h), finish(mode));
      }
    } else if (tag === 'line') {
      c.ops.push(setFillingRgbColor(0, 0, 0));
      const st = rgb(attr(child, 'stroke') ?? 'none');
      if (st) c.ops.push(setStrokingRgbColor(...st), setLineWidth(num(child, 'stroke-width', 1)), moveTo(num(child, 'x1'), num(child, 'y1')), lineTo(num(child, 'x2'), num(child, 'y2')), stroke());
    } else if (tag === 'path') {
      const mode = paint(c, child);
      if (mode) {
        drawPath(c, child.getAttribute('d') ?? '');
        c.ops.push(finish(mode));
      }
    }
    c.ops.push(popGraphicsState());
  }
}

/** Tegner hele SVG-en på siden. Siden må ha samme mål som SVG-ens viewBox (i mm). */
export function drawSvg(doc: PDFDocument, page: PDFPage, svg: SVGSVGElement, fonts: Fonts, heightMm: number) {
  const c: Ctx = { doc, page, ops: [], fonts, fontNames: new Map(), alpha: new Map() };
  // Fra mm med y nedover (SVG) til punkter med y oppover (PDF)
  c.ops.push(pushGraphicsState(), concatTransformationMatrix(MM_TO_PT, 0, 0, -MM_TO_PT, 0, heightMm * MM_TO_PT));
  walk(c, svg);
  c.ops.push(popGraphicsState());
  page.pushOperators(...c.ops);
}
