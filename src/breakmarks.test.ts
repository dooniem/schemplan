import { describe, expect, it } from 'vitest';
import { breakParts } from './breakmarks';
import { parseBoxText, splitLines } from './format/text';
import { computeLayout, type BoxItem, type LayoutOptions } from './layout/layout';
import { fitTextToBoxes } from './layout/fittext';
import { approxMeasure } from './layout/text';
import { testplan } from './test/testplaner';

describe('tvungne linjeskift', () => {
  it('Enter og | gir begge linjeskift i bokstekst, /| er en strek', () => {
    expect(parseBoxText('Montasje\nav rør|del 2').lines).toEqual(['Montasje', 'av rør', 'del 2']);
    expect(parseBoxText('A /| B\r\nC').lines).toEqual(['A | B', 'C']);
    expect(parseBoxText('*Callout\nlinje 2')).toEqual({ lines: ['Callout', 'linje 2'], forcedCallout: true });
  });
  it('lane-navn deles også på Enter', () => {
    expect(splitLines('Bygg A\n Etasje 2 |Tak')).toEqual(['Bygg A', 'Etasje 2', 'Tak']);
  });
  it('merker Enter og |, men ikke /|', () => {
    expect(breakParts('A\nB|C /| D')).toEqual([
      { kind: 'text', text: 'A' },
      { kind: 'enter', text: '\n' },
      { kind: 'text', text: 'B' },
      { kind: 'pipe', text: '|' },
      { kind: 'text', text: 'C /| D' },
    ]);
    expect(breakParts('')).toEqual([]);
  });
});

describe('Enter og | gir samme plan', () => {
  const opts: LayoutOptions = { orientation: 'landscape', heightMode: 'compact', textSizePt: 9, fitToSheet: true };
  const withText = (t: string) => {
    const p = testplan();
    const b = p.lanes[1].boxes[0];
    b.text = t;
    b.height = 6;
    return { p, id: b.id };
  };
  it('i tegningen og i «Størst mulig tekst»', () => {
    const a = withText('Rørlegger|montasje del 2');
    const b = withText('Rørlegger\nmontasje del 2');
    const la = computeLayout(a.p, opts, approxMeasure).items.find((i) => i.id === a.id) as BoxItem;
    const lb = computeLayout(b.p, opts, approxMeasure).items.find((i) => i.id === b.id) as BoxItem;
    expect(lb.text?.lines).toEqual(la.text?.lines);
    expect(lb.text?.lines[0]).toBe('Rørlegger');
    const fa = fitTextToBoxes(a.p, opts, approxMeasure, { laneTitles: false }).plan.lanes[1].boxes[0];
    const fb = fitTextToBoxes(b.p, opts, approxMeasure, { laneTitles: false }).plan.lanes[1].boxes[0];
    expect(fb.textScale).toBe(fa.textScale);
  });
});
