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
