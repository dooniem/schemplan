import type { Item } from "./layout";

/**
 * Rekkefølgen elementene tegnes i, bakerst først. Klikk og PDF følger den samme rekkefølgen.
 *
 * - Bakgrunnsbokser (Multi Lane og overskrift) ligger under vanlige bokser og milepæler,
 *   så det som står inni dem, alltid synes.
 * - Mellom bakgrunnsboksene tegnes den største først, så en mindre boks aldri gjemmes bak en større.
 *   Ved lik størrelse ligger Multi Lane under overskrift, ellers gjelder lane- og datorekkefølgen.
 * - Bokser merket «Tegn fremst» legges over alt annet, med de samme reglene seg imellom.
 */
export function drawOrder(items: readonly Item[]): Item[] {
  const background = (i: Item) => i.kind === "box" && (!!i.span || !!i.header);
  const area = (i: Item) => (i.kind === "box" ? (i.x1 - i.x0) * i.h : 0);
  const typeRank = (i: Item) => (i.kind === "box" && i.span ? 0 : 1);
  return items
    .map((it, k) => ({
      it,
      k,
      front: it.kind === "box" && !!it.front,
      bg: background(it),
      area: area(it),
    }))
    .sort(
      (a, b) =>
        Number(a.front) - Number(b.front) ||
        Number(b.bg) - Number(a.bg) ||
        (a.bg && b.bg
          ? b.area - a.area || typeRank(a.it) - typeRank(b.it)
          : 0) ||
        a.k - b.k,
    )
    .map((x) => x.it);
}
