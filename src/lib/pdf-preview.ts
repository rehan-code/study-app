import PdfPreviewModule from '../../modules/pdf-preview';

const UNAVAILABLE = 'Page previews are only available in the iOS build.';

/** False wherever the native renderer is not linked, which is everywhere but iOS. */
export function isPdfPreviewAvailable(): boolean {
  return PdfPreviewModule !== null;
}

export async function getPdfPageCount(localUri: string): Promise<number> {
  if (PdfPreviewModule === null) {
    throw new Error(UNAVAILABLE);
  }
  try {
    return await PdfPreviewModule.getPageCount(localUri);
  } catch (error) {
    console.warn('[pdf-preview] page count failed:', error);
    throw new Error("Couldn't open that PDF. Try picking the file again.");
  }
}

/** Draws one 1-based page and returns a local URI for the image. */
export async function renderPdfPage(
  localUri: string,
  page: number,
  width: number,
): Promise<string> {
  if (PdfPreviewModule === null) {
    throw new Error(UNAVAILABLE);
  }
  try {
    return await PdfPreviewModule.renderPage(localUri, page, width);
  } catch (error) {
    console.warn('[pdf-preview] render failed:', error);
    throw new Error(`Couldn't show page ${page}.`);
  }
}

/**
 * Writes a PDF holding only the chosen pages and returns its local URI. Only
 * this slice is uploaded: a whole curriculum runs past what Supabase storage
 * accepts, and the importer never reads the pages outside the selection.
 */
export async function extractPdfPages(
  localUri: string,
  fromPage: number,
  toPage: number,
): Promise<string> {
  if (PdfPreviewModule === null) {
    throw new Error(UNAVAILABLE);
  }
  try {
    return await PdfPreviewModule.extractPages(localUri, fromPage, toPage);
  } catch (error) {
    console.warn('[pdf-preview] page extraction failed:', error);
    throw new Error("Couldn't pull those pages out of the book. Try a smaller range.");
  }
}
