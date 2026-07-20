import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { scanFromRow } from '@/domain/scans';

const parsedPayload = {
  kind: 'verbs',
  rows: [
    {
      fields: { past: 'بَحَثَ', preposition: 'عَنْ', present: 'يَبْحَثُ' },
      meaning: 'To search for',
      note: null,
    },
  ],
  lessonMarkers: [{ beforeRow: 0, name: 'LESSON 9' }],
  warnings: [],
};

const validRow = {
  id: 'scan-1',
  kind: 'verbs',
  page_paths: ['user-1/right.jpg', 'user-1/left.jpg'],
  status: 'parsed',
  parsed_rows: parsedPayload,
  parse_error: null,
  created_at: '2026-07-06T10:00:00.000Z',
};

describe('scanFromRow', () => {
  it('maps a parsed scan row, validating the parsed payload', () => {
    const scan = scanFromRow(validRow);
    expect(scan.id).toBe('scan-1');
    expect(scan.kind).toBe('verbs');
    expect(scan.pagePaths).toEqual(['user-1/right.jpg', 'user-1/left.jpg']);
    expect(scan.status).toBe('parsed');
    expect(scan.parsed).toEqual(parsedPayload);
    expect(scan.parseError).toBeNull();
    expect(scan.createdAt).toEqual(new Date('2026-07-06T10:00:00.000Z'));
  });

  it('keeps parsed null before parsing has produced rows', () => {
    const scan = scanFromRow({ ...validRow, status: 'uploaded', parsed_rows: null });
    expect(scan.parsed).toBeNull();
  });

  it('rejects a row missing the parsed_rows column entirely', () => {
    const { parsed_rows: _parsedRows, ...withoutParsed } = validRow;
    expect(() => scanFromRow({ ...withoutParsed, status: 'uploaded' })).toThrow(ZodError);
  });

  it('surfaces the parse error message on failed scans', () => {
    const scan = scanFromRow({
      ...validRow,
      status: 'failed',
      parsed_rows: null,
      parse_error: "Couldn't read that page",
    });
    expect(scan.status).toBe('failed');
    expect(scan.parseError).toBe("Couldn't read that page");
  });

  it('rejects an unknown status', () => {
    expect(() => scanFromRow({ ...validRow, status: 'done' })).toThrow(ZodError);
  });

  it('rejects an unknown kind', () => {
    expect(() => scanFromRow({ ...validRow, kind: 'grammar' })).toThrow(ZodError);
  });

  it('rejects a malformed parsed payload', () => {
    expect(() =>
      scanFromRow({ ...validRow, parsed_rows: { kind: 'verbs', rows: 'nope' } }),
    ).toThrow(ZodError);
  });

  it('rejects an invalid created_at', () => {
    expect(() => scanFromRow({ ...validRow, created_at: 'yesterday-ish' })).toThrow(ZodError);
  });
});
