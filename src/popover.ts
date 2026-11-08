// Menyene i topplinjen bruker popover-attributtet. Plasseringen regnes ut her fra knappen,
// siden ankerplassering i CSS ennå ikke virker i alle nettlesere.
const GAP = 4;
const EDGE = 8;

export function placePopovers(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[popover]').forEach((pop) => {
    pop.addEventListener('toggle', (e) => {
      if ((e as ToggleEvent).newState !== 'open') return;
      const trigger = document.querySelector<HTMLElement>(`[popovertarget="${pop.id}"]`);
      if (!trigger) return;
      const t = trigger.getBoundingClientRect();
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      // Under knappen, venstrejustert, men flyttes inn så den ikke går utenfor vinduet
      let left = Math.min(t.left, vw - w - EDGE);
      left = Math.max(EDGE, left);
      let top = t.bottom + GAP;
      if (top + h > vh - EDGE && t.top - GAP - h >= EDGE) top = t.top - GAP - h;
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(top)}px`;
      pop.style.maxHeight = `${Math.max(120, vh - top - EDGE)}px`;
    });
  });
  root.querySelectorAll<HTMLElement>('.pop-menu').forEach((menu) => {
    // Et menyvalg lukker menyen. Knapper som bare stiller inn noe (som i Utkikk), gjør det ikke.
    menu.addEventListener('click', (e) => {
      if ((e.target as Element).closest('button.pm-item')) menu.hidePopover();
    });
    // Piltastene flytter mellom valgene, som i høyreklikkmenyene. Menyen selv får fokus når
    // den åpnes, så tastaturet virker med en gang uten at første valg ser markert ut.
    menu.tabIndex = -1;
    menu.addEventListener('toggle', (e) => {
      if ((e as ToggleEvent).newState === 'open') menu.focus({ preventScroll: true });
    });
    menu.addEventListener('keydown', (e) => {
      const list = [...menu.querySelectorAll<HTMLButtonElement>('.pm-item:not(:disabled):not([hidden])')];
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      let next = -1;
      if (e.key === 'ArrowDown') next = (i + 1) % list.length;
      else if (e.key === 'ArrowUp') next = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = list.length - 1;
      if (next < 0) return;
      e.preventDefault();
      list[next].focus();
    });
  });
}
