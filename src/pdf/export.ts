// Lager PDF-en: arbeidsfil (planen innebygd, kan redigeres videre i appen) eller vanlig PDF til deling.
// Lastes først når brukeren lagrer, så pdf-lib og skriftene ikke gjør appen tregere å åpne.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import type { PlanFile } from '../format/types';
import type { Layout } from '../layout/layout';
import regularUrl from '../assets/fonts/carlito-regular.ttf?inline';
import boldUrl from '../assets/fonts/carlito-bold.ttf?inline';
import { drawSvg, MM_TO_PT } from './svg2pdf';
import { ATTACHMENT_NAME } from './read';

export type PdfVariant = 'arbeidsfil' | 'deling';

const bytesOf = (dataUrl: string) => Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));

export async function exportPdf(L: Layout, svg: SVGSVGElement, plan: PlanFile, variant: PdfVariant, appVersion: string): Promise<Uint8Array> {
  // Uten updateMetadata skriver pdf-lib ikke inn programnavn og tidspunkt av seg selv
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  // Delingsfilen tar bare med tegnene som brukes, så den blir liten. Arbeidsfilen har hele skriften.
  const subset = variant === 'deling';
  // Uten ligaturer: "fi" og "fl" blir vanlige tegn, så teksten kan søkes i og har samme bredde som på skjermen
  const features = { liga: false, clig: false, dlig: false };
  const fonts = {
    regular: await doc.embedFont(bytesOf(regularUrl), { subset, features }),
    bold: await doc.embedFont(bytesOf(boldUrl), { subset, features }),
  };
  const page = doc.addPage([L.width * MM_TO_PT, L.height * MM_TO_PT]);
  drawSvg(doc, page, svg, fonts, L.height);

  doc.setTitle(plan.plan.title, { showInWindowTitleBar: true });
  if (variant === 'arbeidsfil') {
    doc.setCreator(`Skjematisk plan v${appVersion}`);
    doc.setSubject('Arbeidsfil med innebygd plan. Internt dokument.');
    const json = new TextEncoder().encode(JSON.stringify(plan));
    await doc.attach(json, ATTACHMENT_NAME, {
      mimeType: 'application/json',
      description: 'Planen til Skjematisk plan. Åpne PDF-en i appen for å fortsette arbeidet.',
      modificationDate: new Date(),
    });
    // Liten markering nederst, så arbeidsfilen ikke forveksles med den som sendes ut
    const size = 2.2;
    const label = 'Arbeidsfil, internt dokument';
    page.drawText(label, { x: 8 * MM_TO_PT, y: 3 * MM_TO_PT, size: size * MM_TO_PT, font: fonts.regular, color: rgb(0.45, 0.45, 0.45) });
  }
  return doc.save({ useObjectStreams: true });
}
