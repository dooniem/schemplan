// Bilde av arket (PNG) til utklippstavlen, for å lime rett inn i e-post, Teams eller PowerPoint.
// SVG-en tegnes på et lerret i nettleseren. Skriften legges inn i SVG-en, siden et SVG-bilde
// ikke ser skriftene siden har lastet.
import regularUrl from './assets/fonts/carlito-regular.ttf?inline';
import boldUrl from './assets/fonts/carlito-bold.ttf?inline';
import { FONT_FAMILY } from './render/svg';

const NS = 'http://www.w3.org/2000/svg';

/** Tegner SVG-en som PNG med gitt bredde i piksler, på hvit bakgrunn. */
export async function svgToPng(svg: SVGSVGElement, widthPx: number): Promise<Blob> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const vb = copy.viewBox.baseVal;
  const heightPx = Math.round((widthPx * vb.height) / vb.width);
  copy.setAttribute('width', String(widthPx));
  copy.setAttribute('height', String(heightPx));
  const family = FONT_FAMILY.split(',')[0].trim();
  const style = document.createElementNS(NS, 'style');
  style.textContent =
    `@font-face{font-family:${family};font-weight:400;src:url(${regularUrl}) format('truetype');}` +
    `@font-face{font-family:${family};font-weight:700;src:url(${boldUrl}) format('truetype');}`;
  copy.prepend(style);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = widthPx;
    c.height = heightPx;
    const g = c.getContext('2d')!;
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, widthPx, heightPx);
    g.drawImage(img, 0, 0, widthPx, heightPx);
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Kunne ikke lage bildet'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
