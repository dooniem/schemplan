// Lager PDF-en: arbeidsfil (planen innebygd, kan redigeres videre i appen) eller vanlig PDF til deling.
// Lastes først når brukeren lagrer, så pdf-lib og skriftene ikke gjør appen tregere å åpne.
import fontkit from '@pdf-lib/fontkit';
import { clip, closePath, concatTransformationMatrix, drawObject, endPath, lineTo, moveTo, PDFDocument, PDFPage, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFImage } from 'pdf-lib';
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
  if (L.logo) {
    const bytes = Uint8Array.from(atob(L.logo.href.split(',')[1]), (ch) => ch.charCodeAt(0));
    const img = L.logo.href.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const { x, y, w, h } = L.logo;
    page.drawImage(img, { x: x * MM_TO_PT, y: (L.height - y - h) * MM_TO_PT, width: w * MM_TO_PT, height: h * MM_TO_PT });
  }

  await drawImages(doc, page, L);

  // Samme tittel som overskriften på arket: egen overskrift fra appen går foran navnet fra Project
  doc.setTitle((plan.plan.layout.title ?? plan.plan.title).replace(/\s*\|\s*/g, ' ').trim() || plan.plan.title, { showInWindowTitleBar: true });
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

/** Bildene satt inn i appen, oppå planen, med rotasjon og beskjæring som på skjermen. Like bilder bygges inn én gang. */
async function drawImages(doc: PDFDocument, page: PDFPage, L: Layout) {
  const embedded = new Map<string, PDFImage>();
  for (const im of L.images) {
    let img = embedded.get(im.href);
    if (!img) {
      const bytes = bytesOf(im.href);
      img = im.href.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      embedded.set(im.href, img);
    }
    const name = page.node.newXObject('Im', img.ref);
    const t = (im.rotation * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const x = -im.w / 2;
    const y = -im.h / 2;
    const [u0, v0, u1, v1] = im.crop;
    const ops = [
      pushGraphicsState(),
      // Fra mm med y nedover til punkter, så til bildets midte og rotasjon, som i SVG-en
      concatTransformationMatrix(MM_TO_PT, 0, 0, -MM_TO_PT, 0, L.height * MM_TO_PT),
      concatTransformationMatrix(cos, sin, -sin, cos, im.cx, im.cy),
      rectangle(x + u0 * im.w, y + v0 * im.h, (u1 - u0) * im.w, (v1 - v0) * im.h),
      clip(),
      endPath(),
    ];
    if (im.points) {
      im.points.forEach(([u, v], i) => ops.push(i === 0 ? moveTo(x + u * im.w, y + v * im.h) : lineTo(x + u * im.w, y + v * im.h)));
      ops.push(closePath(), clip(), endPath());
    }
    // Bildet fyller enhetskvadratet med første rad øverst; y snus fordi siden tegnes med y nedover
    ops.push(concatTransformationMatrix(im.w, 0, 0, -im.h, x, y + im.h), drawObject(name), popGraphicsState());
    page.pushOperators(...ops);
  }
}
