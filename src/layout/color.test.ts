import { describe, expect, it } from 'vitest';
import { autoTextColor, contrast, derivedBorder } from './color';

describe('tekstfarge etter kontrast', () => {
  it('gir hvit tekst på rød, petrol og oliven, slik Magnus ønsker', () => {
    expect(autoTextColor('#E6194B')).toBe('#FFFFFF');
    expect(autoTextColor('#469990')).toBe('#FFFFFF');
    expect(autoTextColor('#808000')).toBe('#FFFFFF');
  });
  it('gir svart tekst på grå, oransje og grønn, der hvit var for svak', () => {
    expect(autoTextColor('#A9A9A9')).toBe('#000000');
    expect(autoTextColor('#F58231')).toBe('#000000');
    expect(autoTextColor('#3CB44B')).toBe('#000000');
  });
  it('lyse og mørke ytterpunkter', () => {
    expect(autoTextColor('#FFFAC8')).toBe('#000000');
    expect(autoTextColor('#000075')).toBe('#FFFFFF');
  });
  it('kantfargen er samme tone, mørkere', () => {
    expect(derivedBorder('#FFFFFF')).toBe('#8C8C8C');
    expect(contrast(derivedBorder('#FFFAC8'), '#FFFAC8')).toBeGreaterThan(3);
  });
});
