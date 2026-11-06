// Visning av arket på skjermen: tilpasset vinduet, med zoom og panorering.
// Arket er vektor (SVG), så det blir like skarpt uansett zoom.

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const STEP = 1.25;

export interface Viewer {
  /** Viser et nytt ark og beholder zoom og posisjon så langt det går. */
  show(svg: SVGSVGElement, widthMm: number, heightMm: number): void;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  /** Arket fyller bredden av vinduet; rull opp og ned for resten. */
  fitWidth(): void;
  onChange(cb: (zoom: number) => void): void;
}

export function createViewer(host: HTMLElement): Viewer {
  let svg: SVGSVGElement | null = null;
  let wMm = 1;
  let hMm = 1;
  let zoom = 1;
  let listener: (zoom: number) => void = () => {};

  // Piksler per mm når hele arket får plass i vinduet
  const fitScale = () => {
    const pad = 16;
    const w = Math.max(host.clientWidth - pad * 2, 50);
    const h = Math.max(host.clientHeight - pad * 2, 50);
    return Math.min(w / wMm, h / hMm);
  };

  const apply = () => {
    if (!svg) return;
    const s = fitScale() * zoom;
    // CSSOM-stil er tillatt av sikkerhetssperren, i motsetning til style-attributter i HTML
    svg.style.width = `${wMm * s}px`;
    svg.style.height = `${hMm * s}px`;
    host.classList.toggle('zoomed', zoom > 1);
    listener(zoom);
  };

  /** Zoomer rundt et punkt i vinduet (cx, cy relativt til host), så det som er under musa blir stående. */
  const setZoom = (z: number, cx = host.clientWidth / 2, cy = host.clientHeight / 2) => {
    if (!svg) return;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    if (next === zoom) return;
    const r = svg.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    // Punktet under musa, som andel av arket
    const fx = (hr.left + cx - r.left) / r.width;
    const fy = (hr.top + cy - r.top) / r.height;
    zoom = next;
    apply();
    const r2 = svg.getBoundingClientRect();
    host.scrollLeft += r2.left + fx * r2.width - (hr.left + cx);
    host.scrollTop += r2.top + fy * r2.height - (hr.top + cy);
  };

  // Ctrl/⌘ + hjul zoomer (som i PDF-lesere). Vanlig hjul ruller.
  host.addEventListener(
    'wheel',
    (e) => {
      if (!svg || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const hr = host.getBoundingClientRect();
      setZoom(zoom * Math.pow(STEP, -e.deltaY / 100), e.clientX - hr.left, e.clientY - hr.top);
    },
    { passive: false },
  );

  // Dra for å flytte når det er zoomet inn
  let drag: { x: number; y: number; sl: number; st: number } | null = null;
  host.addEventListener('pointerdown', (e) => {
    if (!svg || zoom <= 1 || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, sl: host.scrollLeft, st: host.scrollTop };
    host.setPointerCapture(e.pointerId);
    host.classList.add('dragging');
  });
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    host.scrollLeft = drag.sl - (e.clientX - drag.x);
    host.scrollTop = drag.st - (e.clientY - drag.y);
  });
  const end = () => {
    drag = null;
    host.classList.remove('dragging');
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
  // Dobbeltklikk zoomer inn der du klikker; med Shift tilbake til hele arket
  host.addEventListener('dblclick', (e) => {
    if (!svg) return;
    const hr = host.getBoundingClientRect();
    if (e.shiftKey) setZoom(1);
    else setZoom(zoom * 2, e.clientX - hr.left, e.clientY - hr.top);
  });

  new ResizeObserver(() => apply()).observe(host);

  return {
    show(next, width, height) {
      const sl = host.scrollLeft;
      const st = host.scrollTop;
      svg = next;
      wMm = width;
      hMm = height;
      host.replaceChildren(next);
      apply();
      host.scrollLeft = sl;
      host.scrollTop = st;
    },
    zoomIn: () => setZoom(zoom * STEP),
    zoomOut: () => setZoom(zoom / STEP),
    fit: () => setZoom(1),
    fitWidth: () => {
      const w = Math.max(host.clientWidth - 32, 50) / wMm;
      setZoom(w / fitScale(), host.clientWidth / 2, 0);
    },
    onChange(cb) {
      listener = cb;
    },
  };
}
