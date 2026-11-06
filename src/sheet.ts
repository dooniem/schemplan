// A3-ark i millimeter. Hele planen skal tegnes i dette koordinatsystemet,
// slik at skjerm og PDF bruker de samme målene.
export type Orientation = 'landscape' | 'portrait';

export interface SheetSize {
  width: number; // mm
  height: number; // mm
}

const A3_LONG = 420;
const A3_SHORT = 297;

export function a3Size(orientation: Orientation): SheetSize {
  return orientation === 'landscape'
    ? { width: A3_LONG, height: A3_SHORT }
    : { width: A3_SHORT, height: A3_LONG };
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGINS: Margins = { top: 8, right: 8, bottom: 8, left: 8 };

/** Området planen kan tegnes i, innenfor margene. */
export function printableArea(size: SheetSize, m: Margins = DEFAULT_MARGINS): SheetSize {
  return {
    width: Math.max(0, size.width - m.left - m.right),
    height: Math.max(0, size.height - m.top - m.bottom),
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Tegner et tomt ark med margin som SVG. 1 enhet = 1 mm. */
export function renderSheet(orientation: Orientation, m: Margins = DEFAULT_MARGINS): SVGSVGElement {
  const size = a3Size(orientation);
  const area = printableArea(size, m);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Tomt A3-ark, ${orientation === 'landscape' ? 'liggende' : 'stående'}`);
  svg.classList.add('sheet');

  const paper = document.createElementNS(SVG_NS, 'rect');
  paper.setAttribute('width', String(size.width));
  paper.setAttribute('height', String(size.height));
  paper.setAttribute('class', 'paper');
  svg.append(paper);

  const margin = document.createElementNS(SVG_NS, 'rect');
  margin.setAttribute('x', String(m.left));
  margin.setAttribute('y', String(m.top));
  margin.setAttribute('width', String(area.width));
  margin.setAttribute('height', String(area.height));
  margin.setAttribute('class', 'margin');
  svg.append(margin);

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', String(size.width / 2));
  label.setAttribute('y', String(size.height / 2));
  label.setAttribute('class', 'sheet-label');
  label.textContent = `A3 ${size.width} × ${size.height} mm`;
  svg.append(label);

  return svg;
}
