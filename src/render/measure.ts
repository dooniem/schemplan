import type { Measure } from '../layout/text';
import { FONT_FAMILY } from './svg';

/** Måler tekst med nettleserens egen skrift, slik den tegnes i SVG-en. */
export function canvasMeasure(): Measure {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return (t, s) => t.length * s * 0.52;
  const cache = new Map<string, number>();
  return (text, size, bold) => {
    const key = `${bold ? 1 : 0}|${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = `${bold ? 'bold ' : ''}100px ${FONT_FAMILY}`;
      w = ctx.measureText(text).width / 100;
      cache.set(key, w);
    }
    return w * size;
  };
}
