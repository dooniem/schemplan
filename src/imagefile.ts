// Leser en bildefil (fra fildialogen, utklippstavlen eller dra og slipp) og gjør den klar for planen:
// PNG eller JPEG som PDF-en kan bygge inn, aldri større enn MAX_PX, og riktig vei opp.
import { MAX_PX } from './layout/image';

export interface ReadImage {
  data: string;
  /** Opprinnelig størrelse i piksler, før eventuell krymping. */
  px: [number, number];
}

/** Største PNG før et bilde uten gjennomsiktighet lagres som JPEG i stedet (bytes). */
const PNG_LIMIT = 1_500_000;

const isImage = (f: File | Blob) => f.type.startsWith('image/');

/** Bildefilene blant filene, i rekkefølge. */
export const imageFiles = (list: FileList | File[] | null | undefined): File[] => [...(list ?? [])].filter(isImage);

export async function readImage(file: Blob): Promise<ReadImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    // decode() snur bildet etter EXIF, så bilder fra mobilen står riktig vei
    await img.decode();
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error('Bildet har ingen størrelse');
    const k = Math.min(1, MAX_PX / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * k));
    canvas.height = Math.max(1, Math.round(h0 * k));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Foto blir JPEG. Skjermbilder, tegninger og bilder med gjennomsiktighet blir PNG, så de holder seg skarpe.
    const jpegIn = file.type === 'image/jpeg';
    let data = '';
    if (!jpegIn || hasAlpha(ctx, canvas.width, canvas.height)) data = canvas.toDataURL('image/png');
    if (!data || (data.length * 0.75 > PNG_LIMIT && !hasAlpha(ctx, canvas.width, canvas.height))) data = canvas.toDataURL('image/jpeg', 0.9);
    return { data, px: [w0, h0] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const d = ctx.getImageData(0, 0, w, h).data;
  // Hver fjerde piksel er nok til å se om bildet er gjennomsiktig noe sted
  for (let i = 3; i < d.length; i += 16) if (d[i] < 255) return true;
  return false;
}
