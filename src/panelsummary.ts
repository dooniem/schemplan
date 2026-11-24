// Korte oppsummeringer for delene av boks-panelet som er foldet sammen.
import type { Box } from './format/types';
import { linesOf } from './criticallines';
import { pinned } from './editmodel';
import { joinSummary, type Fold } from './panelfold';
import { alignOf } from './layout/textalign';

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
  const align = alignOf(b) === 'left' ? 'venstrejustert' : alignOf(b) === 'right' ? 'høyrejustert' : '';
  return { summary: joinSummary([type, rot && `rotert ${rot}`, !rot && align]), changed: type !== 'Vanlig' || !!rot };
}

/** Kritisk linje: linjene boksene er med i, ellers Ingen. */
export function lineFold(boxes: readonly Box[]): Fold {
  const lines = [...new Set(boxes.flatMap((b) => linesOf(b)))].sort();
  if (!lines.length) return { summary: 'Ingen' };
  return { summary: `Linje ${lines.join(', ')}`, changed: true };
}

/** Høyde og plass: fast høyde og fast plass i lanen, ellers automatisk. */
export function placeFold(boxes: readonly Box[]): Fold {
  const s = joinSummary([boxes.some((b) => !b.resolved?.isMilestone && b.height) && 'Fast høyde', boxes.some(pinned) && 'Fast plass', boxes.some((b) => b.front) && 'Fremst']);
  return { summary: s || 'Automatisk', changed: !!s };
}
