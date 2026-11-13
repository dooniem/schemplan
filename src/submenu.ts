// Innstillinger er en kort meny med grupper. Hver gruppe åpner en undermeny til høyre for menyen,
// eller til venstre når det ikke er plass. Undermenyene er popovere inne i hovedmenyen, så
// nettleseren holder hovedmenyen åpen mens en undermeny er oppe, og Esc lukker én om gangen.
const GAP = 4;
const EDGE = 8;
const HOVER_MS = 140;

/** Kort oppsummering av valgene i en gruppe, vist under navnet i hovedmenyen. */
type Summary = (sub: HTMLElement) => string;

const pressed = (root: ParentNode, attr: string) =>
  root.querySelector<HTMLButtonElement>(`[${attr}][aria-pressed='true']`)?.textContent?.trim() ?? '';
const checked = (id: string) => !!document.querySelector<HTMLInputElement>(`#${id}`)?.checked;
const join = (parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ');

const SUMMARIES: Record<string, Summary> = {
  ark: (s) => join([pressed(s, 'data-paper'), pressed(s, 'data-orientation'), pressed(s, 'data-height')]),
  kal: (s) => join([pressed(s, 'data-cal'), `${pressed(s, 'data-style')} stil`, checked('show-bottom-cal') && 'Også nederst']),
  vis: (s) => {
    const on = [...s.querySelectorAll<HTMLInputElement>('.set-switch input:checked')].map(
      (i) => i.closest('.set-switch')?.querySelector('strong')?.textContent?.trim() ?? '',
    );
    return on.length ? on.join(', ') : 'Ingenting ekstra';
  },
  status: (s) =>
    checked('sl-on')
      ? join([pressed(s, 'data-sl-source'), checked('pf-on') && 'Fremdriftsfront'])
      : 'Av',
  tekst: (s) => {
    const size = document.querySelector<HTMLInputElement>('#text-size')?.value;
    return join([pressed(s, 'data-fit'), size && `${size.replace('.', ',')} pt`]);
  },
  logo: () => {
    const logo = !document.querySelector<HTMLImageElement>('#logo-preview')?.hidden;
    const rev = checked('rev-on') && document.querySelector<HTMLInputElement>('#rev-number')?.value.trim();
    return join([logo ? 'Med logo' : 'Ingen logo', checked('rev-on') && (rev ? `Rev. ${rev}` : 'Revisjon')]);
  },
};

export function setupSubmenus(menu: HTMLElement) {
  const items = [...menu.querySelectorAll<HTMLButtonElement>('.set-item')];
  const subOf = (item: HTMLButtonElement) => document.getElementById(item.dataset.sub!)!;
  const isOpen = (el: HTMLElement) => el.matches(':popover-open');
  let hoverTimer = 0;

  const refresh = () => {
    for (const item of items) {
      const sum = item.querySelector<HTMLElement>('.set-sum');
      const fn = sum && SUMMARIES[sum.dataset.sum!];
      if (sum && fn) sum.textContent = fn(subOf(item));
    }
  };

  // Til høyre for menyen med første rad på høyde med valget. Får den ikke plass, til venstre,
  // og på smale skjermer over menyen. Den holdes alltid innenfor vinduet.
  const place = (sub: HTMLElement, item: HTMLElement) => {
    const m = menu.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    sub.style.maxHeight = `${vh - 2 * EDGE}px`;
    const w = sub.offsetWidth;
    const h = sub.offsetHeight;
    let left = m.right + GAP;
    if (left + w > vw - EDGE) left = m.left - GAP - w >= EDGE ? m.left - GAP - w : vw - w - EDGE;
    left = Math.max(EDGE, left);
    let top = r.top - 1;
    top = Math.max(EDGE, Math.min(top, vh - h - EDGE));
    sub.style.left = `${Math.round(left)}px`;
    sub.style.top = `${Math.round(top)}px`;
  };

  const open = (item: HTMLButtonElement, focusInside: boolean) => {
    window.clearTimeout(hoverTimer);
    const sub = subOf(item);
    if (!isOpen(sub)) sub.showPopover();
    place(sub, item);
    if (focusInside) {
      const first = sub.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="file"])');
      (first ?? sub).focus({ preventScroll: true });
    }
  };

  const close = (sub: HTMLElement) => {
    if (isOpen(sub)) sub.hidePopover();
  };

  for (const item of items) {
    const sub = subOf(item);
    sub.tabIndex = -1;
    // Tastatur (Enter/mellomrom gir klikk uten pekerposisjon) flytter fokus inn i undermenyen
    item.addEventListener('click', (e) => open(item, e.detail === 0));
    item.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => open(item, false), HOVER_MS);
    });
    item.addEventListener('pointerleave', () => window.clearTimeout(hoverTimer));
    sub.addEventListener('toggle', (e) => {
      const opened = (e as ToggleEvent).newState === 'open';
      item.setAttribute('aria-expanded', String(opened));
      // Lukkes undermenyen med Esc mens fokus er der, går fokus tilbake til valget i hovedmenyen
      if (!opened && isOpen(menu) && (sub.contains(document.activeElement) || document.activeElement === document.body))
        item.focus({ preventScroll: true });
    });
    sub.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      const typing = t instanceof HTMLInputElement && t.type !== 'checkbox';
      if (e.key === 'ArrowLeft' && !typing) {
        e.preventDefault();
        e.stopPropagation();
        item.focus({ preventScroll: true });
        close(sub);
      }
    });
  }

  // Piltastene flytter mellom gruppene, pil høyre åpner gruppen, som i høyreklikkmenyene
  menu.tabIndex = -1;
  menu.addEventListener('keydown', (e) => {
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.target !== menu && i < 0) return;
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') next = i < 0 ? items.length - 1 : (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'ArrowRight' && i >= 0) {
      e.preventDefault();
      open(items[i], true);
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    items[next].focus();
    // Når en undermeny står åpen, følger den med valget
    if (items.some((it) => isOpen(subOf(it)))) open(items[next], false);
  });

  menu.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState === 'open') {
      refresh();
      menu.focus({ preventScroll: true });
    } else {
      window.clearTimeout(hoverTimer);
    }
  });
  // Oppsummeringen følger med når noe endres i en undermeny. Venter til knappene har oppdatert seg.
  for (const type of ['click', 'change', 'input']) menu.addEventListener(type, () => requestAnimationFrame(refresh));

  // Undermenyen flyttes med når vinduet endrer størrelse, eller når den selv blir høyere fordi
  // et valg viser flere felt, så den aldri går utenfor skjermkanten
  const replace = () => {
    for (const item of items) if (isOpen(subOf(item))) place(subOf(item), item);
  };
  window.addEventListener('resize', replace);
  const ro = new ResizeObserver(replace);
  for (const item of items) ro.observe(subOf(item));

  return { refresh };
}
