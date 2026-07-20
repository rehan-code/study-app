import { describe, expect, it } from 'vitest';

import {
  describeImportProgress,
  describeImportResult,
  importBatchResultSchema,
  importProgressFraction,
  pdfImportFromRow,
} from '@/domain/pdf-import';

const row = {
  id: 'imp-1',
  storage_path: 'user/imports/book.pdf',
  status: 'processing',
  total_pages: 856,
  next_page: 121,
  lessons_created: 12,
  cards_created: 340,
  last_error: null,
  created_at: '2026-07-19T10:00:00.000Z',
};

describe('pdfImportFromRow', () => {
  it('maps a database row to the domain shape', () => {
    const parsed = pdfImportFromRow(row);
    expect(parsed).toEqual({
      id: 'imp-1',
      storagePath: 'user/imports/book.pdf',
      status: 'processing',
      totalPages: 856,
      nextPage: 121,
      lessonsCreated: 12,
      cardsCreated: 340,
      lastError: null,
      createdAt: new Date('2026-07-19T10:00:00.000Z'),
    });
  });

  it('accepts a fresh import with no page count yet', () => {
    const fresh = pdfImportFromRow({ ...row, status: 'created', total_pages: null, next_page: 1 });
    expect(fresh.totalPages).toBeNull();
    expect(fresh.nextPage).toBe(1);
  });

  it('rejects unknown statuses', () => {
    expect(() => pdfImportFromRow({ ...row, status: 'paused' })).toThrow();
  });
});

describe('importBatchResultSchema', () => {
  it('accepts a processing batch response', () => {
    const result = importBatchResultSchema.parse({
      status: 'processing',
      totalPages: 856,
      nextPage: 7,
      lessonsCreated: 1,
      cardsCreated: 22,
      batch: { fromPage: 1, toPage: 6, cardsAdded: 22, warnings: [] },
    });
    expect(result.batch?.toPage).toBe(6);
  });

  it('accepts a done response without batch details', () => {
    const result = importBatchResultSchema.parse({
      status: 'done',
      totalPages: 856,
      nextPage: 857,
      lessonsCreated: 140,
      cardsCreated: 9000,
    });
    expect(result.status).toBe('done');
  });

  it('rejects unexpected statuses', () => {
    expect(() =>
      importBatchResultSchema.parse({
        status: 'failed',
        totalPages: 856,
        nextPage: 7,
        lessonsCreated: 0,
        cardsCreated: 0,
      }),
    ).toThrow();
  });
});

describe('importProgressFraction', () => {
  it('is null before the page count is known', () => {
    expect(importProgressFraction(null, 5)).toBeNull();
  });

  it('reports completed pages over the total', () => {
    expect(importProgressFraction(100, 1)).toBe(0);
    expect(importProgressFraction(100, 51)).toBe(0.5);
    expect(importProgressFraction(100, 101)).toBe(1);
  });

  it('clamps a cursor past the end to 1', () => {
    expect(importProgressFraction(100, 500)).toBe(1);
  });
});

describe('describeImportProgress', () => {
  it('describes an unknown total as preparing', () => {
    expect(describeImportProgress(null, 1)).toBe('Preparing the book');
  });

  it('describes completed pages', () => {
    expect(describeImportProgress(856, 121)).toBe('Page 120 of 856');
    expect(describeImportProgress(856, 857)).toBe('Page 856 of 856');
  });
});

describe('describeImportResult', () => {
  it('pluralizes counts', () => {
    expect(describeImportResult(1, 1)).toBe('1 lesson, 1 card');
    expect(describeImportResult(140, 9000)).toBe('140 lessons, 9000 cards');
  });
});
