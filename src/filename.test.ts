import { describe, expect, it } from 'vitest';
import { fileTitle, lastPart } from './filename';

describe('filnavn fra planen', () => {
  it('bruker bare filnavnet fra en nettadresse', () => {
    expect(fileTitle('https://firma.sharepoint.com/sites/Prosjekt/Delte%20dokumenter/Fremdrift%20v3.mpp')).toBe('Fremdrift v3');
    expect(fileTitle('https://firma.sharepoint.com/sites/P/Plan.mpp?web=1')).toBe('Plan');
  });
  it('bruker bare filnavnet fra en sti', () => {
    expect(fileTitle('C:\\Prosjekter\\Bygg A\\Plan.mpp')).toBe('Plan');
  });
  it('vanlige filnavn er som før', () => {
    expect(fileTitle('Plan_arbeidsfil.pdf')).toBe('Plan');
    expect(fileTitle('Plan fra Project.json')).toBe('Plan fra Project');
    expect(fileTitle('')).toBe('skjematisk-plan');
  });
  it('tåler ugyldig %-koding', () => {
    expect(lastPart('a/b%zz.mpp')).toBe('b%zz.mpp');
  });
  it('fjerner appens egne endelser for utkikk og fag', () => {
    expect(fileTitle('Plan_arbeidsfil_utkikk-u45-47.pdf')).toBe('Plan');
    expect(fileTitle('Plan_arbeidsfil_Betong_fremhevet.pdf')).toBe('Plan');
    expect(fileTitle('Plan_utkikk-u45-47.pdf')).toBe('Plan');
  });
});
