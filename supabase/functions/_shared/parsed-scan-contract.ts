import { z } from 'npm:zod@4';

// Mirror of src/domain/parsed-scan.ts (Deno functions cannot import from src/).
// Keep both files in sync: identical field keys, identical schema shapes.

export const SCAN_KINDS = ['nouns', 'verbs', 'phrases'] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];

/**
 * Field keys the parser must emit per scan kind. They match the card field
 * schemas in src/domain/cards.ts exactly; "note" and "meaning" travel
 * separately on each row.
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

/**
 * A suspected mistake in a handwritten answer. "fields" always keeps the exact
 * transcription; the checked, corrected form lives only here so review can
 * offer both and default to the correction.
 */
export const rowCorrectionSchema = z.object({
  field: z.string().min(1),
  suggested: z.string().min(1),
  reason: z.string().min(1),
});

export const parsedRowSchema = z.object({
  fields: z.record(z.string(), z.string().nullable()),
  meaning: z.string().nullable(),
  note: z.string().nullable(),
  // Scans parsed before answer checking existed have no corrections key.
  corrections: z.array(rowCorrectionSchema).default([]),
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

export type RowCorrection = z.infer<typeof rowCorrectionSchema>;
export type ParsedRow = z.infer<typeof parsedRowSchema>;
export type LessonMarker = z.infer<typeof lessonMarkerSchema>;
export type ParsedScan = z.infer<typeof parsedScanSchema>;
