// Høyreklikkmenyer: korte valg med ikon og hurtigtast, gruppert med skillelinjer.
// Forklaringen til valget du peker på vises nederst i menyen i stedet for under hvert valg,
// så menyen er lett å skumme.

const NS = 'http://www.w3.org/2000/svg';

/** Ikoner tegnet på et 24×24-rutenett med samme strek. */
const ICONS = {
  header: 'M4 5h16v14H4z M4 9.5h16',
  copy: 'M9 9h10v10H9z M5 15V5h10',
  hide: 'M3 3l18 18 M10.6 6.1Q11.3 6 12 6c5 0 9 6 9 6a16 16 0 0 1-2.6 3.2 M6.5 6.6C4.3 8.1 3 12 3 12s4 6 9 6a8.7 8.7 0 0 0 4.4-1.2',
  show: 'M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  height: 'M12 4v16 M8.5 7.5L12 4l3.5 3.5 M8.5 16.5L12 20l3.5-3.5',
  pin: 'M12 16v5 M8 3h8 M9 3v5l-3 5h12l-3-5V3',
  plus: 'M12 5v14 M5 12h14',
  laneAdd: 'M4 5h16 M4 10h16 M12 14v7 M8.5 17.5h7',
  pencil: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  fixed: 'M5 4h14 M5 20h14 M12 7.5v9',
  auto: 'M5 4h14 M12 8v12 M8.5 16.5L12 20l3.5-3.5',
  target: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12 M18 6L6 18',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  diamond: 'M12 4l8 8-8 8-8-8z',
  flag: 'M6 21V4 M6 4h11l-2.5 4 2.5 4H6',
  undo: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-4',
  unpin: 'M12 16v5 M8 3h8 M9 3v5l-3 5h12l-3-5V3 M3 3l18 18',
} as const;
export type IconName = keyof typeof ICONS;

export interface CtxItem {
  label: string;
  icon?: IconName;
  /** Forklaring som vises nederst i menyen når valget er markert. */
  hint?: string;
  /** Hurtigtast som vises til høyre, f.eks. «Ctrl+D». */
  kbd?: string;
  /** Avkrysning for av/på-valg. Utelates for vanlige handlinger. */
  checked?: boolean;
  /** Ett av flere gjensidig utelukkende valg (radio). */
  radio?: boolean;
  disabled?: boolean;
  /** Fjerner noe for godt. */
  danger?: boolean;
  onSelect: () => void;
}
export interface CtxGroup {
  heading?: string;
  items: CtxItem[];
}

export function icon(name: IconName, cls = 'ctx-ico'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls);
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}

const span = (cls: string, text = '') => {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
};

/** Lager en tom meny i body. Den lukkes av koden, ikke av nettleseren: på Mac og Linux
 *  kommer høyreklikket før museknappen slippes, og nettleserens lukking ville lukket den med en gang. */
export function createCtxMenu(): {
  el: HTMLElement;
  open: (x: number, y: number, title: string, groups: CtxGroup[], subtitle?: string) => void;
  close: () => void;
} {
  const el = document.createElement('div');
  el.className = 'pop ctx-menu no-print';
  el.setAttribute('popover', 'manual');
  el.setAttribute('role', 'menu');
  document.body.append(el);
  const close = () => el.matches(':popover-open') && el.hidePopover();
  document.addEventListener('pointerdown', (e) => !el.contains(e.target as Node) && close(), true);
  window.addEventListener('blur', close);
  let hintEl: HTMLElement | null = null;
  let defaultHint = '';
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('button:not([aria-disabled="true"])')];
  const showHint = (b: Element | null) => {
    if (hintEl) hintEl.textContent = (b as HTMLElement | null)?.dataset.hint || defaultHint;
  };
  el.addEventListener('pointerover', (e) => showHint((e.target as Element).closest('button')));
  el.addEventListener('pointerleave', () => showHint(el.querySelector('button:focus')));
  el.addEventListener('focusin', (e) => showHint((e.target as Element).closest('button')));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    const list = buttons();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % list.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    if (next < 0) return;
    e.preventDefault();
    list[next].focus();
  });

  const open = (x: number, y: number, title: string, groups: CtxGroup[], subtitle = '') => {
    el.replaceChildren();
    const head = document.createElement('div');
    head.className = 'ctx-head';
    head.append(span('ctx-title', title));
    if (subtitle) head.append(span('ctx-sub', subtitle));
    el.append(head);
    for (const g of groups.filter((g) => g.items.length)) {
      const sec = document.createElement('div');
      sec.className = 'ctx-group';
      sec.setAttribute('role', 'group');
      if (g.heading) {
        const h = span('ctx-heading', g.heading);
        h.id = `ctx-h-${Math.random().toString(36).slice(2, 8)}`;
        sec.setAttribute('aria-labelledby', h.id);
        sec.append(h);
      }
      for (const it of g.items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = it.danger ? 'ctx-item danger' : 'ctx-item';
        const toggle = it.checked !== undefined;
        b.setAttribute('role', toggle ? (it.radio ? 'menuitemradio' : 'menuitemcheckbox') : 'menuitem');
        if (toggle) b.setAttribute('aria-checked', String(it.checked));
        // aria-disabled i stedet for disabled, så forklaringen også vises for valg som er utilgjengelige
        if (it.disabled) b.setAttribute('aria-disabled', 'true');
        if (it.hint) b.dataset.hint = it.hint;
        const mark = span('ctx-mark');
        if (it.checked) mark.append(icon('check'));
        else if (it.icon) mark.append(icon(it.icon));
        b.append(mark, span('ctx-label', it.label));
        if (it.kbd) b.append(span('ctx-kbd', it.kbd));
        b.addEventListener('click', () => {
          if (it.disabled) return;
          close();
          it.onSelect();
        });
        sec.append(b);
      }
      el.append(sec);
    }
    defaultHint = 'Pek på et valg for å se hva det gjør.';
    hintEl = span('ctx-hint', defaultHint);
    hintEl.setAttribute('aria-live', 'polite');
    el.append(hintEl);
    if (!el.matches(':popover-open')) el.showPopover();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    el.style.left = `${Math.max(8, Math.min(x, vw - el.offsetWidth - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, vh - el.offsetHeight - 8))}px`;
    // Tastaturet kan brukes med en gang, uten at det første valget ser markert ut for musen
    el.tabIndex = -1;
    el.focus({ preventScroll: true });
  };
  return { el, open, close };
}
