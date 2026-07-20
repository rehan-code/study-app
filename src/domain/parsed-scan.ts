import { z } from 'zod';

import { SCAN_KINDS, type ScanKind } from '@/domain/cards';

// Contract between the parse-scan edge function and the app. A mirror copy
// lives at supabase/functions/_shared/parsed-scan-contract.ts (Deno cannot
// import from src/); keep both files in sync.

/**
 * Field keys the parser must emit per scan kind. They match the card field
 * schemas in cards.ts exactly; "note" and "meaning" travel separately.
 */
export const PARSED_FIELD_KEYS: Record<ScanKind, readonly string[]> = {
  nouns: ['arabic', 'plural1', 'plural2', 'synonym', 'synonymPlural', 'antonym', 'antonymPlural'],
  verbs: [
    'past',
    'preposition',
    'present',
    'imperative',
    'masdar',
    'activeParticiple',
    'passiveParticiple',
  ],
  phrases: ['arabic'],
};

export const parsedRowSchema = z.object({
  fields: z.record(z.string(), z.string().nullable()),
  meaning: z.string().nullable(),
  note: z.string().nullable(),
});

/** A handwritten "LESSON N" marker; rows from beforeRow onward belong to that lesson. */
export const lessonMarkerSchema = z.object({
  beforeRow: z.number().int().nonnegative(),
  name: z.string().min(1),
});

export const parsedScanSchema = z.object({
  kind: z.enum(SCAN_KINDS),
  rows: z.array(parsedRowSchema),
  lessonMarkers: z.array(lessonMarkerSchema),
  warnings: z.array(z.string()),
});

export type ParsedRow = z.infer<typeof parsedRowSchema>;
export type LessonMarker = z.infer<typeof lessonMarkerSchema>;
export type ParsedScan = z.infer<typeof parsedScanSchema>;
