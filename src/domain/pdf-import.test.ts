import { describe, expect, it } from 'vitest';

import {
  bookPageRange,
  clampPage,
  describeImportProgress,
  describeImportRange,
  describeImportResult,
  describePageSelection,
  describeReadingNow,
  importBatchResultSchema,
  importLastPage,
  importProgressFraction,
  inFlightBatch,
  inFlightBatchFraction,
  parsePageRange,
  pdfImportFromRow,
} from '@/domain/pdf-import';

const row = {
  id: 'imp-1',
  storage_path: 'user/imports/book.pdf',
  status: 'processing',
  total_pages: 856,
  next_page: 121,
  from_page: 1,
  to_page: null,
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
      fromPage: 1,
      toPage: null,
      pageOffset: 0,
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

  it('maps a page-range import', () => {
    const ranged = pdfImportFromRow({ ...row, from_page: 120, to_page: 140, next_page: 126 });
    expect(ranged.fromPage).toBe(120);
    expect(ranged.toPage).toBe(140);
  });

  it('rejects unknown statuses', () => {
    expect(() => pdfImportFromRow({ ...row, status: 'paused' })).toThrow();
  });

  it('rejects a page range below page one', () => {
    expect(() => pdfImportFromRow({ ...row, from_page: 0 })).toThrow();
  });

  it('defaults the page offset for rows written before slicing existed', () => {
    expect(pdfImportFromRow(row).pageOffset).toBe(0);
  });

  it('reads the offset of a slice cut out of a book', () => {
    const slice = pdfImportFromRow({
      ...row,
      from_page: 1,
      to_page: 20,
      next_page: 7,
      page_offset: 120,
    });
    expect(slice.pageOffset).toBe(120);
  });
});

describe('bookPageRange', () => {
  it('leaves a whole-book upload alone', () => {
    expect(bookPageRange({ fromPage: 1, toPage: 20, pageOffset: 0 })).toEqual({
      fromPage: 1,
      toPage: 20,
    });
  });

  it('shifts a slice back to the book its pages came from', () => {
    expect(bookPageRange({ fromPage: 1, toPage: 20, pageOffset: 120 })).toEqual({
      fromPage: 121,
      toPage: 140,
    });
  });

  it('keeps an open-ended range open', () => {
    expect(bookPageRange({ fromPage: 1, toPage: null, pageOffset: 120 })).toEqual({
      fromPage: 121,
      toPage: null,
    });
  });

  it('reads back as the pages the browser selected', () => {
    const selected = { fromPage: 121, toPage: 140 };
    const pageCount = selected.toPage - selected.fromPage + 1;
    const stored = { fromPage: 1, toPage: pageCount, pageOffset: selected.fromPage - 1 };
    expect(describeImportRange(bookPageRange(stored))).toBe('Pages 121 to 140');
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

describe('importLastPage', () => {
  it('is the book length for an open-ended import', () => {
    expect(importLastPage(856, null)).toBe(856);
  });

  it('is the selection end once inside the book', () => {
    expect(importLastPage(856, 140)).toBe(140);
  });

  it('clamps a selection that runs past the book', () => {
    expect(importLastPage(100, 140)).toBe(100);
  });

  it('trusts the selection end before the book length is known', () => {
    expect(importLastPage(null, 140)).toBe(140);
    expect(importLastPage(null, null)).toBeNull();
  });
});

describe('importProgressFraction', () => {
  it('is null before the page count is known', () => {
    expect(
      importProgressFraction({ totalPages: null, nextPage: 5, fromPage: 1, toPage: null }),
    ).toBeNull();
  });

  it('reports completed pages over the total', () => {
    const whole = { totalPages: 100, fromPage: 1, toPage: null };
    expect(importProgressFraction({ ...whole, nextPage: 1 })).toBe(0);
    expect(importProgressFraction({ ...whole, nextPage: 51 })).toBe(0.5);
    expect(importProgressFraction({ ...whole, nextPage: 101 })).toBe(1);
  });

  it('measures a page range against the selected pages only', () => {
    const range = { totalPages: 856, fromPage: 121, toPage: 140 };
    expect(importProgressFraction({ ...range, nextPage: 121 })).toBe(0);
    expect(importProgressFraction({ ...range, nextPage: 131 })).toBe(0.5);
    expect(importProgressFraction({ ...range, nextPage: 141 })).toBe(1);
  });

  it('measures a selection before the book length arrives', () => {
    expect(importProgressFraction({ totalPages: null, nextPage: 5, fromPage: 1, toPage: 10 })).toBe(
      0.4,
    );
  });

  it('clamps a cursor past the end to 1', () => {
    expect(
      importProgressFraction({ totalPages: 100, nextPage: 500, fromPage: 1, toPage: null }),
    ).toBe(1);
  });
});

describe('describeImportProgress', () => {
  it('describes an unknown total as preparing', () => {
    expect(
      describeImportProgress({ totalPages: null, nextPage: 1, fromPage: 1, toPage: null }),
    ).toBe('Preparing the book');
  });

  it('describes completed pages', () => {
    const whole = { totalPages: 856, fromPage: 1, toPage: null };
    expect(describeImportProgress({ ...whole, nextPage: 121 })).toBe('Page 120 of 856');
    expect(describeImportProgress({ ...whole, nextPage: 857 })).toBe('Page 856 of 856');
  });

  it('counts within the selected range', () => {
    const range = { totalPages: 856, fromPage: 121, toPage: 140 };
    expect(describeImportProgress({ ...range, nextPage: 121 })).toBe('Page 0 of 20');
    expect(describeImportProgress({ ...range, nextPage: 127 })).toBe('Page 6 of 20');
    expect(describeImportProgress({ ...range, nextPage: 141 })).toBe('Page 20 of 20');
  });

  it('prepares when the selection starts past the end of the book', () => {
    expect(
      describeImportProgress({ totalPages: 100, nextPage: 200, fromPage: 200, toPage: null }),
    ).toBe('Preparing the book');
  });
});

describe('inFlightBatch', () => {
  it('covers a whole batch when the selection is long enough', () => {
    expect(inFlightBatch({ totalPages: 856, fromPage: 1, toPage: null, nextPage: 1 })).toEqual({
      fromPage: 1,
      toPage: 6,
    });
  });

  it('stops at the end of a short selection', () => {
    expect(inFlightBatch({ totalPages: 7, fromPage: 1, toPage: 7, nextPage: 1 })).toEqual({
      fromPage: 1,
      toPage: 6,
    });
    expect(inFlightBatch({ totalPages: 7, fromPage: 1, toPage: 7, nextPage: 7 })).toEqual({
      fromPage: 7,
      toPage: 7,
    });
  });

  it('is null once the cursor is past the selection', () => {
    expect(inFlightBatch({ totalPages: 7, fromPage: 1, toPage: 7, nextPage: 8 })).toBeNull();
  });

  it('is null before the selection end is known', () => {
    expect(inFlightBatch({ totalPages: null, fromPage: 1, toPage: null, nextPage: 1 })).toBeNull();
  });
});

describe('inFlightBatchFraction', () => {
  it('is where the bar lands when the running batch reports', () => {
    // The 0/7 stall the user sees is this whole span in one Claude call.
    expect(inFlightBatchFraction({ totalPages: 7, fromPage: 1, toPage: 7, nextPage: 1 })).toBe(
      6 / 7,
    );
    expect(inFlightBatchFraction({ totalPages: 7, fromPage: 1, toPage: 7, nextPage: 7 })).toBe(1);
  });

  it('is null when nothing is in flight', () => {
    expect(
      inFlightBatchFraction({ totalPages: 7, fromPage: 1, toPage: 7, nextPage: 8 }),
    ).toBeNull();
  });
});

describe('describeReadingNow', () => {
  it('names the pages of a slice in the book they came from', () => {
    expect(
      describeReadingNow({ totalPages: 7, fromPage: 1, toPage: 7, nextPage: 1, pageOffset: 139 }),
    ).toBe('Reading pages 140 to 145');
  });

  it('drops to a single page at the tail of a selection', () => {
    expect(
      describeReadingNow({ totalPages: 7, fromPage: 1, toPage: 7, nextPage: 7, pageOffset: 139 }),
    ).toBe('Reading page 146');
  });

  it('is null once every page is read', () => {
    expect(
      describeReadingNow({ totalPages: 7, fromPage: 1, toPage: 7, nextPage: 8, pageOffset: 139 }),
    ).toBeNull();
  });
});

describe('describeImportRange', () => {
  it('names the whole book', () => {
    expect(describeImportRange({ fromPage: 1, toPage: null })).toBe('Whole book');
  });

  it('names an open-ended range', () => {
    expect(describeImportRange({ fromPage: 121, toPage: null })).toBe('Page 121 to the end');
  });

  it('names a closed range', () => {
    expect(describeImportRange({ fromPage: 121, toPage: 140 })).toBe('Pages 121 to 140');
    expect(describeImportRange({ fromPage: 121, toPage: 121 })).toBe('Page 121 only');
  });
});

describe('parsePageRange', () => {
  it('treats an empty form as the whole book', () => {
    expect(parsePageRange('', '')).toEqual({ ok: true, range: { fromPage: 1, toPage: null } });
  });

  it('reads a closed range, ignoring surrounding spaces', () => {
    expect(parsePageRange(' 121 ', ' 140 ')).toEqual({
      ok: true,
      range: { fromPage: 121, toPage: 140 },
    });
  });

  it('reads an open-ended range', () => {
    expect(parsePageRange('121', '')).toEqual({ ok: true, range: { fromPage: 121, toPage: null } });
  });

  it('rejects non-numeric and zero pages', () => {
    expect(parsePageRange('twelve', '')).toEqual({
      ok: false,
      error: 'The first page must be a page number, 1 or higher.',
    });
    expect(parsePageRange('0', '')).toEqual({
      ok: false,
      error: 'The first page must be a page number, 1 or higher.',
    });
    expect(parsePageRange('1', '2.5')).toEqual({
      ok: false,
      error: 'The last page must be a page number, 1 or higher.',
    });
  });

  it('rejects a backwards range', () => {
    expect(parsePageRange('140', '121')).toEqual({
      ok: false,
      error: 'The last page must come on or after the first page.',
    });
  });

  it('accepts a range that fits the known book', () => {
    expect(parsePageRange('121', '140', 856)).toEqual({
      ok: true,
      range: { fromPage: 121, toPage: 140 },
    });
    expect(parsePageRange('', '', 856)).toEqual({ ok: true, range: { fromPage: 1, toPage: null } });
    expect(parsePageRange('856', '856', 856)).toEqual({
      ok: true,
      range: { fromPage: 856, toPage: 856 },
    });
  });

  it('rejects pages past the end of a known book', () => {
    expect(parsePageRange('900', '', 856)).toEqual({
      ok: false,
      error: 'This book has 856 pages, so page 900 is past it.',
    });
    expect(parsePageRange('121', '900', 856)).toEqual({
      ok: false,
      error: 'This book has 856 pages, so page 900 is past it.',
    });
  });
});

describe('clampPage', () => {
  it('keeps a page inside the book', () => {
    expect(clampPage(0, 856)).toBe(1);
    expect(clampPage(900, 856)).toBe(856);
    expect(clampPage(121, 856)).toBe(121);
  });

  it('rounds and survives junk input', () => {
    expect(clampPage(12.6, 856)).toBe(13);
    expect(clampPage(Number.NaN, 856)).toBe(1);
  });

  it('never returns page zero for an empty book', () => {
    expect(clampPage(1, 0)).toBe(1);
  });
});

describe('describePageSelection', () => {
  it('counts the selected pages', () => {
    expect(describePageSelection(121, 140)).toBe('Pages 121 to 140 · 20 pages');
    expect(describePageSelection(121, 121)).toBe('Page 121 only · 1 page');
  });
});

describe('describeImportResult', () => {
  it('pluralizes counts', () => {
    expect(describeImportResult(1, 1)).toBe('1 lesson, 1 card');
    expect(describeImportResult(140, 9000)).toBe('140 lessons, 9000 cards');
  });
});
