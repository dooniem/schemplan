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
  // Et menyvalg lukker menyen
  root.querySelectorAll<HTMLElement>('.pop-menu').forEach((menu) =>
    menu.addEventListener('click', (e) => {
      if ((e.target as Element).closest('button')) menu.hidePopover();
    }),
  );
}
