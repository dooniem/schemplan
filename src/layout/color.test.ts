import { describe, expect, it } from 'vitest';
import { autoTextColor, contrast, derivedBorder, luminance as luminanceOf } from './color';

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
  it('mørke fyll får lysere kant, så like bokser inntil hverandre kan skilles', () => {
    for (const f of ['#000080', '#000000', '#800000', '#1E3A8A', '#8B4513', '#4169E1', '#008000', '#FF0000', '#FFFF00', '#FFFFFF']) {
      expect(contrast(derivedBorder(f), f)).toBeGreaterThanOrEqual(2);
    }
    expect(luminanceOf(derivedBorder('#000080'))).toBeGreaterThan(luminanceOf('#000080'));
  });
});
