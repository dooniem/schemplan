import { describe, expect, it } from "vitest";
import { testplan } from "../test/testplaner";
import { computeLayout, type BoxItem, type Item } from "./layout";
import { approxMeasure } from "./text";
import { drawOrder } from "./draworder";
import { resetBox } from "../editmodel";
import { setFront } from "../frontui";

const box = (
  id: string,
  w: number,
  h: number,
  extra: Partial<BoxItem> = {},
): BoxItem => ({
  kind: "box",
  id,
  x0: 0,
  x1: w,
  y: 0,
  h,
  fill: "#fff",
  border: null,
  text: null,
  callout: null,
  arrowLeft: false,
  arrowRight: false,
  ...extra,
});
const ids = (items: Item[]) => items.map((i) => i.id);

describe("tegnerekkefølge", () => {
  it("bakgrunnsbokser under vanlige, den største bakerst", () => {
    const items = [
      box("vanlig", 10, 5),
      box("liten-multi", 20, 10, { span: true }),
      box("stor-overskrift", 100, 40, { header: true }),
      box("mellom-multi", 50, 30, { span: true }),
    ];
    expect(ids(drawOrder(items))).toEqual([
      "stor-overskrift",
      "mellom-multi",
      "liten-multi",
      "vanlig",
    ]);
  });

  it("lik størrelse: Multi Lane under overskrift, ellers rekkefølgen den hadde", () => {
    const items = [
      box("o", 10, 10, { header: true }),
      box("m", 10, 10, { span: true }),
      box("a", 5, 5),
      box("b", 5, 5),
    ];
    expect(ids(drawOrder(items))).toEqual(["m", "o", "a", "b"]);
  });

  it("«Tegn fremst» over alt, med de samme reglene seg imellom", () => {
    const items = [
      box("fremst-vanlig", 5, 5, { front: true }),
      box("fremst-multi", 40, 40, { span: true, front: true }),
      box("vanlig", 5, 5),
      box("stor", 100, 100, { header: true }),
    ];
    expect(ids(drawOrder(items))).toEqual([
      "stor",
      "vanlig",
      "fremst-multi",
      "fremst-vanlig",
    ]);
  });

  it("i planen: merket boks tegnes sist, og plassen endres ikke", () => {
    const p = testplan();
    const o = {
      orientation: "landscape" as const,
      heightMode: "compact" as const,
      textSizePt: 9,
      fitToSheet: true,
    };
    const target = p.lanes
      .find((l) => l.shown && !l.hidden)!
      .boxes.find((b) => b.shown && !b.resolved?.isMilestone)!;
    const before = computeLayout(p, o, approxMeasure).items.find(
      (i) => i.id === target.id,
    )!;
    setFront(p, [target.id], true);
    const L = computeLayout(p, o, approxMeasure);
    expect(L.items[L.items.length - 1].id).toBe(target.id);
    expect(L.items.find((i) => i.id === target.id)).toMatchObject({
      y: before.y,
      front: true,
    });
    setFront(p, [target.id], false);
    expect(target.front).toBeUndefined();
    target.front = true;
    resetBox(target);
    expect(target.front).toBeUndefined();
  });
});
