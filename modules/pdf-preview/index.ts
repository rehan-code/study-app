import { requireOptionalNativeModule, type NativeModule } from 'expo';

declare class PdfPreviewNativeModule extends NativeModule {
  /** Pages in the PDF at `uri`. Rejects when the file cannot be opened. */
  getPageCount(uri: string): Promise<number>;
  /**
   * Draws one 1-based page at `width` points and returns a `file://` URI for
   * the cached JPEG.
   */
  renderPage(uri: string, page: number, width: number): Promise<string>;
  /**
   * Writes a new PDF holding only the inclusive 1-based page range and returns
   * its `file://` URI. `toPage` past the end is clamped to the last page.
   */
  extractPages(uri: string, fromPage: number, toPage: number): Promise<string>;
}

/** Null wherever the native module is not linked, which is everywhere but iOS. */
export default requireOptionalNativeModule<PdfPreviewNativeModule>('PdfPreview');
