import { describe, expect, it } from 'vitest';

import { phraseFieldsSchema, verbFieldsSchema, vocabFieldsSchema } from '@/domain/cards';
import {
  lessonMarkerSchema,
  PARSED_FIELD_KEYS,
  parsedRowSchema,
  parsedScanSchema,
  rowCorrectionSchema,
} from '@/domain/parsed-scan';

const validParsed = {
  kind: 'verbs',
  rows: [
    {
      fields: {
        past: 'اِتَّصَلَ',
        preposition: 'بـ',
        present: 'يَتَّصِلُ',
        imperative: 'اِتَّصِلْ',
        masdar: 'اِتِّصَال',
        activeParticiple: null,
        passiveParticiple: null,
      },
      meaning: 'To call',
      note: null,
    },
    {
      fields: {
        past: 'اِحْتَاجَ',
        preposition: 'إِلَى',
        present: 'يَحْتَاجُ',
        imperative: null,
        masdar: 'اِحْتِيَاج/حَاجَة',
        activeParticiple: null,
        passiveParticiple: null,
      },
      meaning: 'To need',
      note: 'No imperative in the book',
    },
  ],
  lessonMarkers: [{ beforeRow: 1, name: 'LESSON 10' }],
  warnings: ['Row 2 handwriting unclear'],
};

describe('parsedScanSchema', () => {
  it('accepts a realistic parsed verbs payload and preserves harakat exactly', () => {
    const parsed = parsedScanSchema.parse(validParsed);
    expect(parsed.rows[0].fields.past).toBe('اِتَّصَلَ');
    expect(parsed.rows[1].fields.masdar).toBe('اِحْتِيَاج/حَاجَة');
    expect(parsed.lessonMarkers[0]).toEqual({ beforeRow: 1, name: 'LESSON 10' });
    expect(parsed.warnings).toEqual(['Row 2 handwriting unclear']);
  });

  it('accepts empty rows, markers, and warnings arrays', () => {
    const parsed = parsedScanSchema.parse({
      kind: 'phrases',
      rows: [],
      lessonMarkers: [],
      warnings: [],
    });
    expect(parsed.rows).toEqual([]);
  });

  it('rejects an unknown scan kind', () => {
    expect(parsedScanSchema.safeParse({ ...validParsed, kind: 'grammar' }).success).toBe(false);
  });

  it('rejects a payload missing warnings', () => {
    const { warnings: _warnings, ...withoutWarnings } = validParsed;
    expect(parsedScanSchema.safeParse(withoutWarnings).success).toBe(false);
  });
});

describe('parsedRowSchema', () => {
  it('accepts null cells and null meaning', () => {
    const row = parsedRowSchema.parse({
      fields: { past: 'تُوُفِّيَ', imperative: null, masdar: null },
      meaning: null,
      note: null,
    });
    expect(row.fields.imperative).toBeNull();
    expect(row.meaning).toBeNull();
  });

  it('rejects non-string field values', () => {
    const result = parsedRowSchema.safeParse({
      fields: { past: 7 },
      meaning: 'To call',
      note: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects rows missing the note property', () => {
    expect(parsedRowSchema.safeParse({ fields: {}, meaning: null }).success).toBe(false);
  });

  it('defaults corrections to an empty array for rows parsed before checking existed', () => {
    const row = parsedRowSchema.parse({
      fields: { past: 'اِتَّصَلَ' },
      meaning: 'To call',
      note: null,
    });
    expect(row.corrections).toEqual([]);
  });

  it('accepts a row with a correction', () => {
    const row = parsedRowSchema.parse({
      fields: { present: 'يَتَّصَلُ' },
      meaning: 'To call',
      note: null,
      corrections: [
        {
          field: 'present',
          suggested: 'يَتَّصِلُ',
          reason: 'The middle radical takes kasra in the present tense.',
        },
      ],
    });
    expect(row.corrections[0].suggested).toBe('يَتَّصِلُ');
  });
});

describe('rowCorrectionSchema', () => {
  it('requires a field, a suggested form, and a reason', () => {
    expect(
      rowCorrectionSchema.safeParse({ field: 'present', suggested: 'يَتَّصِلُ', reason: 'Kasra.' })
        .success,
    ).toBe(true);
    expect(
      rowCorrectionSchema.safeParse({ field: '', suggested: 'يَتَّصِلُ', reason: 'Kasra.' })
        .success,
    ).toBe(false);
    expect(
      rowCorrectionSchema.safeParse({ field: 'present', suggested: '', reason: 'Kasra.' }).success,
    ).toBe(false);
    expect(
      rowCorrectionSchema.safeParse({ field: 'present', suggested: 'يَتَّصِلُ', reason: '' })
        .success,
    ).toBe(false);
  });
});

describe('lessonMarkerSchema', () => {
  it('accepts a marker at row 0', () => {
    expect(lessonMarkerSchema.parse({ beforeRow: 0, name: 'LESSON 9' }).beforeRow).toBe(0);
  });

  it('rejects negative, fractional, and unnamed markers', () => {
    expect(lessonMarkerSchema.safeParse({ beforeRow: -1, name: 'LESSON 9' }).success).toBe(false);
    expect(lessonMarkerSchema.safeParse({ beforeRow: 1.5, name: 'LESSON 9' }).success).toBe(false);
    expect(lessonMarkerSchema.safeParse({ beforeRow: 0, name: '' }).success).toBe(false);
  });
});

describe('PARSED_FIELD_KEYS', () => {
  it('matches the card field schemas exactly, with note travelling separately', () => {
    const shapes = {
      nouns: vocabFieldsSchema,
      verbs: verbFieldsSchema,
      phrases: phraseFieldsSchema,
    } as const;
    for (const kind of ['nouns', 'verbs', 'phrases'] as const) {
      expect([...PARSED_FIELD_KEYS[kind], 'note'].sort()).toEqual(
        Object.keys(shapes[kind].shape).sort(),
      );
    }
  });
});
