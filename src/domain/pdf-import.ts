import { z } from 'zod';

export const PDF_IMPORT_STATUSES = ['created', 'processing', 'done', 'failed'] as const;
export type PdfImportStatus = (typeof PDF_IMPORT_STATUSES)[number];

export interface PdfImport {
  id: string;
  storagePath: string;
  status: PdfImportStatus;
  totalPages: number | null;
  nextPage: number;
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
 * Completed fraction in [0, 1], or null before the first batch reports the
 * page count. nextPage is 1-based, so nextPage - 1 pages are finished.
 */
export function importProgressFraction(totalPages: number | null, nextPage: number): number | null {
  if (totalPages === null || totalPages <= 0) {
    return null;
  }
  const completed = Math.max(0, nextPage - 1);
  return Math.min(1, completed / totalPages);
}

export function describeImportProgress(totalPages: number | null, nextPage: number): string {
  if (totalPages === null) {
    return 'Preparing the book';
  }
  const completed = Math.min(totalPages, Math.max(0, nextPage - 1));
  return `Page ${completed} of ${totalPages}`;
}

export function describeImportResult(lessonsCreated: number, cardsCreated: number): string {
  const lessons = lessonsCreated === 1 ? '1 lesson' : `${lessonsCreated} lessons`;
  const cards = cardsCreated === 1 ? '1 card' : `${cardsCreated} cards`;
  return `${lessons}, ${cards}`;
}
