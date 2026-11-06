// Henter planen ut av en arbeidsfil (PDF med vedlegget schemplan.json).
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib';

export const ATTACHMENT_NAME = 'schemplan.json';

export type ReadResult = { json: string } | { error: string };

export async function readPlanFromPdf(bytes: Uint8Array): Promise<ReadResult> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  } catch {
    return { error: 'Filen kunne ikke leses som PDF.' };
  }
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const ef = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  const files: { name: string; spec: PDFDict }[] = [];
  // Navnetreet kan ha barn (Kids) eller ligge direkte i Names
  const visit = (node: PDFDict | undefined) => {
    if (!node) return;
    const arr = node.lookupMaybe(PDFName.of('Names'), PDFArray);
    if (arr)
      for (let i = 0; i + 1 < arr.size(); i += 2) {
        const n = arr.lookup(i);
        const spec = arr.lookup(i + 1);
        const name = n instanceof PDFString || n instanceof PDFHexString ? n.decodeText() : '';
        if (spec instanceof PDFDict) files.push({ name, spec });
      }
    const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
    if (kids) for (let i = 0; i < kids.size(); i++) visit(kids.lookupMaybe(i, PDFDict));
  };
  visit(ef);
  const hit = files.find((f) => f.name === ATTACHMENT_NAME);
  if (!hit)
    return {
      error: 'Denne PDF-en har ingen innebygd plan. Det er trolig en ekstern eller kompakt versjon. Åpne arbeidsfilen (filnavnet slutter som regel på _arbeidsfil.pdf).',
    };
  const stream = hit.spec.lookupMaybe(PDFName.of('EF'), PDFDict)?.lookup(PDFName.of('F'));
  if (!(stream instanceof PDFRawStream)) return { error: 'Den innebygde planen i PDF-en er skadet.' };
  const data = decodePDFRawStream(stream).decode();
  return { json: new TextDecoder().decode(data) };
}
