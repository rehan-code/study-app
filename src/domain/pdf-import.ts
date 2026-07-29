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

export function describeImportProgress(progress: ImportProgress): string {
  const total = selectedPageCount(progress);
  if (total === null) {
    return 'Preparing the book';
  }
  const completed = Math.min(total, Math.max(0, progress.nextPage - progress.fromPage));
  return `Page ${completed} of ${total}`;
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
 */
export function parsePageRange(firstText: string, lastText: string): PageRangeResult {
  const first = firstText.trim();
  const last = lastText.trim();
  if (first.length > 0 && (!WHOLE_NUMBER.test(first) || Number(first) < 1)) {
    return { ok: false, error: 'The first page must be a page number, 1 or higher.' };
  }
  const fromPage = first.length === 0 ? 1 : Number(first);
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
  return { ok: true, range: { fromPage, toPage } };
}

export function describeImportResult(lessonsCreated: number, cardsCreated: number): string {
  const lessons = lessonsCreated === 1 ? '1 lesson' : `${lessonsCreated} lessons`;
  const cards = cardsCreated === 1 ? '1 card' : `${cardsCreated} cards`;
  return `${lessons}, ${cards}`;
}
