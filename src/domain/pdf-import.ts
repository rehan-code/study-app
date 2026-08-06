import { z } from 'zod';

export const PDF_IMPORT_STATUSES = ['created', 'processing', 'done', 'failed'] as const;
export type PdfImportStatus = (typeof PDF_IMPORT_STATUSES)[number];

/** The slice of the book an import reads; toPage null runs to the last page. */
export interface ImportPageRange {
  fromPage: number;
  toPage: number | null;
}

export interface PdfImport {
  id: string;
  storagePath: string;
  status: PdfImportStatus;
  totalPages: number | null;
  nextPage: number;
  fromPage: number;
  toPage: number | null;
  /** Book page of the upload's page 1, minus 1. Zero for a whole-book upload. */
  pageOffset: number;
  lessonsCreated: number;
  cardsCreated: number;
  lastError: string | null;
  createdAt: Date;
}

export const pdfImportRowSchema = z.object({
  id: z.string().min(1),
  storage_path: z.string().min(1),
  status: z.enum(PDF_IMPORT_STATUSES),
  total_pages: z.number().int().positive().nullable(),
  next_page: z.number().int().positive(),
  from_page: z.number().int().positive(),
  to_page: z.number().int().positive().nullable(),
  page_offset: z.number().int().nonnegative().default(0),
  lessons_created: z.number().int().nonnegative(),
  cards_created: z.number().int().nonnegative(),
  last_error: z.string().nullable(),
  created_at: z.coerce.date(),
});

export function pdfImportFromRow(raw: unknown): PdfImport {
  const row = pdfImportRowSchema.parse(raw);
  return {
    id: row.id,
    storagePath: row.storage_path,
    status: row.status,
    totalPages: row.total_pages,
    nextPage: row.next_page,
    fromPage: row.from_page,
    toPage: row.to_page,
    pageOffset: row.page_offset,
    lessonsCreated: row.lessons_created,
    cardsCreated: row.cards_created,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

/** The edge function's per-batch response; also the resume snapshot. */
export const importBatchResultSchema = z.object({
  status: z.enum(['processing', 'done']),
  totalPages: z.number().int().positive().nullable(),
  nextPage: z.number().int().positive(),
  lessonsCreated: z.number().int().nonnegative(),
  cardsCreated: z.number().int().nonnegative(),
  batch: z
    .object({
      fromPage: z.number().int().positive(),
      toPage: z.number().int().positive(),
      cardsAdded: z.number().int().nonnegative(),
      warnings: z.array(z.string()),
    })
    .optional(),
});

export type ImportBatchResult = z.infer<typeof importBatchResultSchema>;

/**
 * Pages the edge function reads per Claude call. Keep in sync with BATCH_PAGES
 * in supabase/functions/import-pdf-batch/index.ts; the app only uses it to say
 * which pages are being read while a batch is in flight.
 */
export const IMPORT_BATCH_PAGES = 6;

/** Progress is measured over the selected pages, not the whole book. */
export interface ImportProgress extends ImportPageRange {
  totalPages: number | null;
  nextPage: number;
}

/**
 * Last page the import will read: the end of the selection, clamped to the book
 * once its length is known. Null while neither bound is known yet.
 */
export function importLastPage(totalPages: number | null, toPage: number | null): number | null {
  if (totalPages === null) {
    return toPage;
  }
  if (toPage === null) {
    return totalPages;
  }
  return Math.min(toPage, totalPages);
}

/** Pages in the selection, or null while its end is still unknown. */
function selectedPageCount(progress: ImportProgress): number | null {
  const lastPage = importLastPage(progress.totalPages, progress.toPage);
  if (lastPage === null || lastPage < progress.fromPage) {
    return null;
  }
  return lastPage - progress.fromPage + 1;
}

/**
 * Completed fraction in [0, 1], or null before the selection's length is known.
 * nextPage is the 1-based cursor, so nextPage - fromPage pages are finished.
 */
export function importProgressFraction(progress: ImportProgress): number | null {
  const total = selectedPageCount(progress);
  if (total === null) {
    return null;
  }
  const completed = Math.max(0, progress.nextPage - progress.fromPage);
  return Math.min(1, completed / total);
}

/**
 * Pages a running batch is reading, or null once the selection is finished.
 * Progress only moves when a whole batch lands, so this is what fills the long
 * quiet stretch while Claude works through six pages at once.
 */
export function inFlightBatch(progress: ImportProgress): ImportPageRange | null {
  const lastPage = importLastPage(progress.totalPages, progress.toPage);
  if (lastPage === null || progress.nextPage > lastPage) {
    return null;
  }
  return {
    fromPage: progress.nextPage,
    toPage: Math.min(progress.nextPage + IMPORT_BATCH_PAGES - 1, lastPage),
  };
}

/** Completed fraction once the running batch lands, for a creeping bar. */
export function inFlightBatchFraction(progress: ImportProgress): number | null {
  const batch = inFlightBatch(progress);
  if (batch === null || batch.toPage === null) {
    return null;
  }
  return importProgressFraction({ ...progress, nextPage: batch.toPage + 1 });
}

/** What the import is reading right now, in the book's own page numbers. */
export function describeReadingNow(
  progress: ImportProgress & { pageOffset: number },
): string | null {
  const batch = inFlightBatch(progress);
  if (batch === null || batch.toPage === null) {
    return null;
  }
  const inBook = bookPageRange({ ...batch, pageOffset: progress.pageOffset });
  if (inBook.toPage === null || inBook.toPage === inBook.fromPage) {
    return `Reading page ${inBook.fromPage}`;
  }
  return `Reading pages ${inBook.fromPage} to ${inBook.toPage}`;
}

export function describeImportProgress(progress: ImportProgress): string {
  const total = selectedPageCount(progress);
  if (total === null) {
    return 'Preparing the book';
  }
  const completed = Math.min(total, Math.max(0, progress.nextPage - progress.fromPage));
  return `Page ${completed} of ${total}`;
}

/**
 * The selection in the book's own page numbers. The upload is normally a slice
 * cut from the book, so its page 1 sits at `pageOffset + 1` in the printed PDF
 * and the range must be shifted back before anyone reads it.
 */
export function bookPageRange(range: ImportPageRange & { pageOffset: number }): ImportPageRange {
  return {
    fromPage: range.fromPage + range.pageOffset,
    toPage: range.toPage === null ? null : range.toPage + range.pageOffset,
  };
}

export function describeImportRange({ fromPage, toPage }: ImportPageRange): string {
  if (toPage === null) {
    return fromPage === 1 ? 'Whole book' : `Page ${fromPage} to the end`;
  }
  if (toPage === fromPage) {
    return `Page ${fromPage} only`;
  }
  return `Pages ${fromPage} to ${toPage}`;
}

export type PageRangeResult = { ok: true; range: ImportPageRange } | { ok: false; error: string };

const WHOLE_NUMBER = /^\d+$/;

/**
 * Reads the two page fields. A blank first page means the start of the book and
 * a blank last page means read to the end, so the empty form is the whole book.
 * `totalPages` is known whenever the preview could open the book, and rejects a
 * range that runs off the end before an import is created for it.
 */
export function parsePageRange(
  firstText: string,
  lastText: string,
  totalPages: number | null = null,
): PageRangeResult {
  const first = firstText.trim();
  const last = lastText.trim();
  if (first.length > 0 && (!WHOLE_NUMBER.test(first) || Number(first) < 1)) {
    return { ok: false, error: 'The first page must be a page number, 1 or higher.' };
  }
  const fromPage = first.length === 0 ? 1 : Number(first);
  if (totalPages !== null && fromPage > totalPages) {
    return {
      ok: false,
      error: `This book has ${totalPages} pages, so page ${fromPage} is past it.`,
    };
  }
  if (last.length === 0) {
    return { ok: true, range: { fromPage, toPage: null } };
  }
  if (!WHOLE_NUMBER.test(last) || Number(last) < 1) {
    return { ok: false, error: 'The last page must be a page number, 1 or higher.' };
  }
  const toPage = Number(last);
  if (toPage < fromPage) {
    return { ok: false, error: 'The last page must come on or after the first page.' };
  }
  if (totalPages !== null && toPage > totalPages) {
    return { ok: false, error: `This book has ${totalPages} pages, so page ${toPage} is past it.` };
  }
  return { ok: true, range: { fromPage, toPage } };
}

/** Keeps a page the preview is asked for inside the book. */
export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.min(Math.max(Math.round(page), 1), Math.max(1, totalPages));
}

/** Names a selection being built in the preview, where both ends are known. */
export function describePageSelection(fromPage: number, toPage: number): string {
  const count = toPage - fromPage + 1;
  const pages = count === 1 ? '1 page' : `${count} pages`;
  return `${describeImportRange({ fromPage, toPage })} · ${pages}`;
}

export function describeImportResult(lessonsCreated: number, cardsCreated: number): string {
  const lessons = lessonsCreated === 1 ? '1 lesson' : `${lessonsCreated} lessons`;
  const cards = cardsCreated === 1 ? '1 card' : `${cardsCreated} cards`;
  return `${lessons}, ${cards}`;
}
