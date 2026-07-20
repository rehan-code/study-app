import { z } from 'zod';

import { SCAN_KINDS } from '@/domain/cards';
import { parsedScanSchema, type ParsedScan } from '@/domain/parsed-scan';

export const SCAN_STATUSES = ['uploaded', 'parsing', 'parsed', 'reviewed', 'failed'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export interface Scan {
  id: string;
  kind: (typeof SCAN_KINDS)[number];
  pagePaths: string[];
  status: ScanStatus;
  parsed: ParsedScan | null;
  parseError: string | null;
  createdAt: Date;
}

export const scanRowSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(SCAN_KINDS),
  page_paths: z.array(z.string()),
  status: z.enum(SCAN_STATUSES),
  parsed_rows: z.unknown(),
  parse_error: z.string().nullable(),
  created_at: z.coerce.date(),
});

export function scanFromRow(raw: unknown): Scan {
  const row = scanRowSchema.parse(raw);
  return {
    id: row.id,
    kind: row.kind,
    pagePaths: row.page_paths,
    status: row.status,
    parsed:
      row.parsed_rows === null || row.parsed_rows === undefined
        ? null
        : parsedScanSchema.parse(row.parsed_rows),
    parseError: row.parse_error,
    createdAt: row.created_at,
  };
}
