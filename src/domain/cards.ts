import { z } from 'zod';

import type { SrsState } from '@/domain/srs';

export const CARD_TYPES = ['vocab', 'verb', 'phrase'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const SCAN_KINDS = ['nouns', 'verbs', 'phrases'] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];

export const SCAN_KIND_TO_CARD_TYPE: Record<ScanKind, CardType> = {
  nouns: 'vocab',
  verbs: 'verb',
  phrases: 'phrase',
};

/** Empty strings and lone dashes mean "not filled in" on the workbook pages. */
const optionalText = z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '-') {
    return null;
  }
  return trimmed;
});

const requiredText = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, { message: 'Required' });

export const vocabFieldsSchema = z.object({
  arabic: requiredText,
  plural1: optionalText,
  plural2: optionalText,
  synonym: optionalText,
  synonymPlural: optionalText,
  antonym: optionalText,
  antonymPlural: optionalText,
  note: optionalText,
});

export const verbFieldsSchema = z.object({
  past: requiredText,
  preposition: optionalText,
  present: optionalText,
  imperative: optionalText,
  masdar: optionalText,
  activeParticiple: optionalText,
  passiveParticiple: optionalText,
  note: optionalText,
});

export const phraseFieldsSchema = z.object({
  arabic: requiredText,
  note: optionalText,
});

export type VocabFields = z.infer<typeof vocabFieldsSchema>;
export type VerbFields = z.infer<typeof verbFieldsSchema>;
export type PhraseFields = z.infer<typeof phraseFieldsSchema>;
export type CardFields = VocabFields | VerbFields | PhraseFields;

export type TypedCardFields =
  | { type: 'vocab'; fields: VocabFields }
  | { type: 'verb'; fields: VerbFields }
  | { type: 'phrase'; fields: PhraseFields };

export function parseCardFields(type: CardType, raw: unknown): TypedCardFields {
  switch (type) {
    case 'vocab':
      return { type, fields: vocabFieldsSchema.parse(raw) };
    case 'verb':
      return { type, fields: verbFieldsSchema.parse(raw) };
    case 'phrase':
      return { type, fields: phraseFieldsSchema.parse(raw) };
  }
}

interface CardBase {
  id: string;
  lessonId: string | null;
  scanId: string | null;
  meaning: string;
  aiImagePath: string | null;
  imageEnabled: boolean;
  srs: SrsState;
  createdAt: Date;
}

export type Card =
  | (CardBase & { type: 'vocab'; fields: VocabFields })
  | (CardBase & { type: 'verb'; fields: VerbFields })
  | (CardBase & { type: 'phrase'; fields: PhraseFields });

export const cardRowSchema = z.object({
  id: z.string().min(1),
  lesson_id: z.string().nullable(),
  scan_id: z.string().nullable(),
  type: z.enum(CARD_TYPES),
  fields: z.unknown(),
  meaning: z.string(),
  ai_image_path: z.string().nullable(),
  image_enabled: z.boolean(),
  box: z.number().int().nonnegative(),
  due_at: z.coerce.date(),
  correct_count: z.number().int().nonnegative(),
  incorrect_count: z.number().int().nonnegative(),
  last_reviewed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
});

export function cardFromRow(raw: unknown): Card {
  const row = cardRowSchema.parse(raw);
  const typed = parseCardFields(row.type, row.fields);
  const base: CardBase = {
    id: row.id,
    lessonId: row.lesson_id,
    scanId: row.scan_id,
    meaning: row.meaning,
    aiImagePath: row.ai_image_path,
    imageEnabled: row.image_enabled,
    srs: {
      box: row.box,
      dueAt: row.due_at,
      correctCount: row.correct_count,
      incorrectCount: row.incorrect_count,
      lastReviewedAt: row.last_reviewed_at,
    },
    createdAt: row.created_at,
  };
  switch (typed.type) {
    case 'vocab':
      return { ...base, type: 'vocab', fields: typed.fields };
    case 'verb':
      return { ...base, type: 'verb', fields: typed.fields };
    case 'phrase':
      return { ...base, type: 'phrase', fields: typed.fields };
  }
}

export interface FieldLabel {
  key: string;
  label: string;
  labelArabic: string;
}

/** Single source of truth for field ordering and naming across review, detail, and flashcards. */
export const FIELD_LABELS: Record<CardType, readonly FieldLabel[]> = {
  vocab: [
    { key: 'arabic', label: 'Singular', labelArabic: 'المفرد' },
    { key: 'plural1', label: 'First plural', labelArabic: 'الجمع الأول' },
    { key: 'plural2', label: 'Second plural', labelArabic: 'الجمع الثاني' },
    { key: 'synonym', label: 'Synonym', labelArabic: 'المرادف' },
    { key: 'synonymPlural', label: 'Synonym plural', labelArabic: 'جمع المرادف' },
    { key: 'antonym', label: 'Opposite', labelArabic: 'المضاد' },
    { key: 'antonymPlural', label: 'Opposite plural', labelArabic: 'جمع المضاد' },
    { key: 'note', label: 'Note', labelArabic: 'ملاحظة' },
  ],
  verb: [
    { key: 'past', label: 'Past', labelArabic: 'الماضي' },
    { key: 'preposition', label: 'Preposition', labelArabic: 'الحرف' },
    { key: 'present', label: 'Present', labelArabic: 'المضارع' },
    { key: 'imperative', label: 'Command', labelArabic: 'الأمر' },
    { key: 'masdar', label: 'Verbal noun', labelArabic: 'المصدر' },
    { key: 'activeParticiple', label: 'Doer', labelArabic: 'اسم الفاعل' },
    { key: 'passiveParticiple', label: 'Done to', labelArabic: 'اسم المفعول' },
    { key: 'note', label: 'Note', labelArabic: 'ملاحظة' },
  ],
  phrase: [
    { key: 'arabic', label: 'Phrase', labelArabic: 'العبارة' },
    { key: 'note', label: 'Note', labelArabic: 'ملاحظة' },
  ],
};

/** The Arabic shown on the front of a flashcard. Verbs show their preposition, e.g. "اتصل بـ". */
export function cardHeadline(card: Card): string {
  switch (card.type) {
    case 'vocab':
      return card.fields.arabic;
    case 'verb':
      return card.fields.preposition
        ? `${card.fields.past} ${card.fields.preposition}`
        : card.fields.past;
    case 'phrase':
      return card.fields.arabic;
  }
}

export interface CardDetailRow {
  key: string;
  label: string;
  labelArabic: string;
  value: string;
}

/** Non-empty fields for the back of a flashcard and the card detail screen, headline excluded. */
export function cardDetailRows(card: Card): CardDetailRow[] {
  const headlineKey = card.type === 'verb' ? 'past' : 'arabic';
  const fields = card.fields as Record<string, string | null>;
  const rows: CardDetailRow[] = [];
  for (const labelDef of FIELD_LABELS[card.type]) {
    if (labelDef.key === headlineKey || labelDef.key === 'preposition') {
      continue;
    }
    const value = fields[labelDef.key];
    if (typeof value === 'string' && value.length > 0) {
      rows.push({ ...labelDef, value });
    }
  }
  return rows;
}
