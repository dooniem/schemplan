import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { ATTACHMENT_NAME, readPlanFromPdf } from './read';

describe('arbeidsfil', () => {
  it('henter planen ut av vedlegget, tegn for tegn', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const json = JSON.stringify({ format: 'schemplan', tekst: 'Æøå – «sitat» L2|ny linje' });
    await doc.attach(new TextEncoder().encode(json), ATTACHMENT_NAME, { mimeType: 'application/json' });
    const r = await readPlanFromPdf(await doc.save());
    expect(r).toEqual({ json });
  });

  it('PDF uten plan gir en forklaring', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const r = await readPlanFromPdf(await doc.save());
    expect('error' in r && r.error).toMatch(/ingen innebygd plan/);
  });

  it('noe annet enn PDF gir en forklaring', async () => {
    const r = await readPlanFromPdf(new TextEncoder().encode('{"ikke": "pdf"}'));
    expect('error' in r && r.error).toMatch(/PDF/);
  });
});
