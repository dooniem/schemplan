// Korte oppsummeringer for delene av boks-panelet som er foldet sammen.
import type { Box } from './format/types';
import { linesOf } from './criticallines';
import { pinned } from './editmodel';
import { joinSummary, type Fold } from './panelfold';

const fmtCm = (v: number) => `${v.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} cm`;
/** Verdien når alle boksene har den samme, ellers null. */
const same = <T>(boxes: readonly Box[], get: (b: Box) => T): T | null =>
  boxes.length && boxes.every((b) => get(b) === get(boxes[0])) ? get(boxes[0]) : null;

/** Callout: Auto, På eller Av, med side og bredde når de er valgt. */
export function calloutFold(boxes: readonly Box[]): Fold {
  const changed = boxes.some((b) => b.callout !== undefined || b.calloutSide !== undefined || b.calloutWidthCm !== undefined);
  if (boxes.length === 1 && boxes[0].rotation !== 0) return { summary: 'Ingen, teksten er rotert', changed };
  const vis = same(boxes, (b) => b.callout ?? 'auto');
  const side = same(boxes, (b) => b.calloutSide ?? 'auto');
  const width = same(boxes, (b) => b.calloutWidthCm);
  if (vis === null || side === null || (width === null && boxes.some((b) => b.calloutWidthCm !== undefined))) return { summary: 'Ulike', changed };
  return {
    summary: joinSummary([
      { auto: 'Auto', on: 'På', off: 'Av' }[vis],
      side !== 'auto' && (side === 'left' ? 'venstre' : 'høyre'),
      width !== undefined && width !== null && fmtCm(width),
    ]),
    changed,
  };
}

/** Form: vanlig, overskrift eller Multi Lane, og rotasjonen når teksten er rotert. */
export function formFold(b: Box): Fold {
  const type = b.spanTo !== undefined ? 'Multi Lane' : b.header ? 'Overskrift' : 'Vanlig';
  const rot = b.rotation === 90 ? '90°' : b.rotation === -90 ? '−90°' : '';
  return { summary: joinSummary([type, rot && `rotert ${rot}`]), changed: type !== 'Vanlig' || !!rot };
}

/** Plassering: kritisk linje, fast høyde, egen tekststørrelse og fast plass, ellers automatisk. */
export function placeFold(boxes: readonly Box[], withTextSize = false): Fold {
  const lines = [...new Set(boxes.flatMap((b) => linesOf(b)))].sort();
  const parts = [
    lines.length > 0 && (lines.length === 1 && lines[0] === 1 ? 'Kritisk linje' : `Kritisk linje ${lines.join(', ')}`),
    withTextSize && boxes.some((b) => b.textScale) && 'Egen tekststørrelse',
    boxes.some((b) => !b.resolved?.isMilestone && b.height) && 'Fast høyde',
    boxes.some(pinned) && 'Fast plass',
  ];
  const s = joinSummary(parts);
  return { summary: s || 'Automatisk', changed: !!s };
}
