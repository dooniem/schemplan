import { describe, expect, it } from 'vitest';
import { isEdited, resetBox } from './editor';
import { testplan } from './test/testplaner';

describe('tilbakestill boks', () => {
  it('fjerner overstyringer og setter tekst og rotasjon tilbake', () => {
    const b = testplan().lanes[0].boxes[0];
    const text = b.text;
    expect(isEdited(b)).toBe(false);
    Object.assign(b, { original: { text, rotation: b.rotation }, text: 'Ny tekst', rotation: 90, fill: '#FF0000', textColor: '#FFFFFF', callout: 'on', calloutSide: 'left' });
    expect(isEdited(b)).toBe(true);
    resetBox(b);
    expect(b.text).toBe(text);
    expect(b.rotation).toBe(0);
    expect(isEdited(b)).toBe(false);
    expect('fill' in b || 'callout' in b || 'original' in b).toBe(false);
  });
});
