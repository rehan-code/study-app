import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  cardDetailRows,
  cardFromRow,
  cardHeadline,
  FIELD_LABELS,
  parseCardFields,
  phraseFieldsSchema,
  SCAN_KIND_TO_CARD_TYPE,
  verbFieldsSchema,
  vocabFieldsSchema,
  type Card,
  type VerbFields,
  type VocabFields,
} from '@/domain/cards';
import { newSrsState } from '@/domain/srs';

const NOW = new Date('2026-07-06T10:00:00.000Z');

const EMPTY_VERB_RAW = {
  past: null,
  preposition: null,
  present: null,
  imperative: null,
  masdar: null,
  activeParticiple: null,
  passiveParticiple: null,
  note: null,
};

const EMPTY_VOCAB_RAW = {
  arabic: null,
  plural1: null,
  plural2: null,
  synonym: null,
  synonymPlural: null,
  antonym: null,
  antonymPlural: null,
  note: null,
};

function verbFields(raw: unknown): VerbFields {
  const typed = parseCardFields('verb', raw);
  if (typed.type !== 'verb') {
    throw new Error('expected verb fields');
  }
  return typed.fields;
}

function vocabFields(raw: unknown): VocabFields {
  const typed = parseCardFields('vocab', raw);
  if (typed.type !== 'vocab') {
    throw new Error('expected vocab fields');
  }
  return typed.fields;
}

function verbCard(fields: VerbFields, meaning: string): Card {
  return {
    id: 'card-verb',
    type: 'verb',
    lessonId: null,
    scanId: null,
    meaning,
    aiImagePath: null,
    imageEnabled: true,
    srs: newSrsState(NOW),
    createdAt: NOW,
    fields,
  };
}

function vocabCard(fields: VocabFields, meaning: string): Card {
  return {
    id: 'card-vocab',
    type: 'vocab',
    lessonId: null,
    scanId: null,
    meaning,
    aiImagePath: null,
    imageEnabled: true,
    srs: newSrsState(NOW),
    createdAt: NOW,
    fields,
  };
}

describe('parseCardFields', () => {
  it('parses verb fields and preserves harakat exactly', () => {
    const fields = verbFields({
      past: 'اِتَّصَلَ',
      preposition: 'بـ',
      present: 'يَتَّصِلُ',
      imperative: 'اِتَّصِلْ',
      masdar: 'اِتِّصَال',
      activeParticiple: null,
      passiveParticiple: null,
      note: null,
    });
    expect(fields.past).toBe('اِتَّصَلَ');
    expect(fields.present).toBe('يَتَّصِلُ');
    expect(fields.imperative).toBe('اِتَّصِلْ');
    expect(fields.masdar).toBe('اِتِّصَال');
  });

  it('turns dash, empty, and whitespace-only cells into null', () => {
    const fields = verbFields({
      past: 'تُوُفِّيَ',
      preposition: null,
      present: 'يُتَوَفَّى',
      imperative: '-',
      masdar: '',
      activeParticiple: '   ',
      passiveParticiple: undefined,
      note: null,
    });
    expect(fields.imperative).toBeNull();
    expect(fields.masdar).toBeNull();
    expect(fields.activeParticiple).toBeNull();
    expect(fields.passiveParticiple).toBeNull();
  });

  it('trims surrounding whitespace without touching harakat', () => {
    const fields = vocabFields({
      ...EMPTY_VOCAB_RAW,
      arabic: ' أُسْبُوعٌ ',
      plural1: ' أَسَابِيعُ ',
    });
    expect(fields.arabic).toBe('أُسْبُوعٌ');
    expect(fields.plural1).toBe('أَسَابِيعُ');
  });

  it('keeps a shared masdar cell as one string', () => {
    const fields = verbFields({
      ...EMPTY_VERB_RAW,
      past: 'اِحْتَاجَ',
      masdar: 'اِحْتِيَاج/حَاجَة',
    });
    expect(fields.masdar).toBe('اِحْتِيَاج/حَاجَة');
  });

  it('rejects an empty required headline field', () => {
    expect(() => parseCardFields('vocab', { arabic: '' })).toThrow(ZodError);
    expect(() => parseCardFields('vocab', { arabic: '   ' })).toThrow(ZodError);
    expect(() => parseCardFields('verb', { present: 'يَتَّصِلُ' })).toThrow(ZodError);
    expect(() => parseCardFields('phrase', {})).toThrow(ZodError);
  });

  it('requires every field key to be present', () => {
    expect(() => parseCardFields('vocab', { arabic: 'أُسْبُوعٌ' })).toThrow(ZodError);
    expect(() =>
      parseCardFields('verb', { ...EMPTY_VERB_RAW, past: 'اِتَّصَلَ', masdar: undefined }),
    ).not.toThrow();
  });

  it('rejects non-string field values', () => {
    expect(() => parseCardFields('vocab', { arabic: 42 })).toThrow(ZodError);
    expect(() => parseCardFields('verb', { past: ['اِتَّصَلَ'] })).toThrow(ZodError);
  });
});

describe('cardFromRow', () => {
  const validRow = {
    id: 'card-1',
    lesson_id: 'lesson-1',
    scan_id: 'scan-1',
    type: 'verb',
    fields: {
      ...EMPTY_VERB_RAW,
      past: 'نَظَرَ',
      preposition: 'إِلَى',
      present: 'يَنْظُرُ',
      imperative: 'اُنْظُرْ',
      masdar: 'نَظَر',
    },
    meaning: 'To look at',
    ai_image_path: null,
    image_enabled: true,
    box: 2,
    due_at: '2026-07-08T10:00:00.000Z',
    correct_count: 3,
    incorrect_count: 1,
    last_reviewed_at: '2026-07-05T10:00:00.000Z',
    created_at: '2026-07-01T10:00:00.000Z',
  };

  it('maps a database row into a typed card', () => {
    const card = cardFromRow(validRow);
    expect(card.id).toBe('card-1');
    expect(card.type).toBe('verb');
    expect(card.lessonId).toBe('lesson-1');
    expect(card.scanId).toBe('scan-1');
    expect(card.meaning).toBe('To look at');
    expect(card.srs).toEqual({
      box: 2,
      dueAt: new Date('2026-07-08T10:00:00.000Z'),
      correctCount: 3,
      incorrectCount: 1,
      lastReviewedAt: new Date('2026-07-05T10:00:00.000Z'),
    });
    expect(card.createdAt).toEqual(new Date('2026-07-01T10:00:00.000Z'));
    if (card.type !== 'verb') {
      throw new Error('expected verb card');
    }
    expect(card.fields.past).toBe('نَظَرَ');
    expect(card.fields.preposition).toBe('إِلَى');
  });

  it('rejects rows with an unknown type', () => {
    expect(() => cardFromRow({ ...validRow, type: 'grammar' })).toThrow(ZodError);
  });

  it('rejects rows with a negative box', () => {
    expect(() => cardFromRow({ ...validRow, box: -1 })).toThrow(ZodError);
  });

  it('rejects rows with an invalid date', () => {
    expect(() => cardFromRow({ ...validRow, due_at: 'not-a-date' })).toThrow(ZodError);
  });

  it('rejects rows missing the id', () => {
    const { id: _id, ...withoutId } = validRow;
    expect(() => cardFromRow(withoutId)).toThrow(ZodError);
  });

  it('rejects rows whose fields do not match the card type', () => {
    expect(() => cardFromRow({ ...validRow, type: 'vocab' })).toThrow(ZodError);
  });
});

describe('cardHeadline', () => {
  it('attaches the preposition to a verb', () => {
    const card = verbCard(
      verbFields({ ...EMPTY_VERB_RAW, past: 'اِتَّصَلَ', preposition: 'بـ' }),
      'To call',
    );
    expect(cardHeadline(card)).toBe('اِتَّصَلَ بـ');
  });

  it('uses the bare past tense when there is no preposition', () => {
    const card = verbCard(verbFields({ ...EMPTY_VERB_RAW, past: 'تُوُفِّيَ' }), 'To pass away');
    expect(cardHeadline(card)).toBe('تُوُفِّيَ');
  });

  it('uses the singular for vocab cards', () => {
    const card = vocabCard(vocabFields({ ...EMPTY_VOCAB_RAW, arabic: 'أُسْبُوعٌ' }), 'Week');
    expect(cardHeadline(card)).toBe('أُسْبُوعٌ');
  });
});

describe('cardDetailRows', () => {
  it('lists non-empty fields in label order, excluding headline and preposition', () => {
    const card = verbCard(
      verbFields({
        ...EMPTY_VERB_RAW,
        past: 'اِتَّصَلَ',
        preposition: 'بـ',
        present: 'يَتَّصِلُ',
        imperative: 'اِتَّصِلْ',
        masdar: 'اِتِّصَال',
        note: 'From lesson 9',
      }),
      'To call',
    );
    const rows = cardDetailRows(card);
    expect(rows.map((row) => row.key)).toEqual(['present', 'imperative', 'masdar', 'note']);
    expect(rows[0].value).toBe('يَتَّصِلُ');
    expect(rows[0].labelArabic).toBe('المضارع');
  });

  it('omits empty optional fields on sparse vocab cards', () => {
    const card = vocabCard(
      vocabFields({ ...EMPTY_VOCAB_RAW, arabic: 'يَمِين', antonym: 'يَسَار' }),
      'Right side',
    );
    const rows = cardDetailRows(card);
    expect(rows.map((row) => row.key)).toEqual(['antonym']);
    expect(rows[0].value).toBe('يَسَار');
  });
});

describe('FIELD_LABELS', () => {
  it('covers exactly the schema keys for every card type', () => {
    const shapes = {
      vocab: vocabFieldsSchema,
      verb: verbFieldsSchema,
      phrase: phraseFieldsSchema,
    } as const;
    for (const type of ['vocab', 'verb', 'phrase'] as const) {
      const labelKeys = FIELD_LABELS[type].map((label) => label.key).sort();
      expect(labelKeys).toEqual(Object.keys(shapes[type].shape).sort());
    }
  });
});

describe('SCAN_KIND_TO_CARD_TYPE', () => {
  it('maps every scan kind to a card type', () => {
    expect(SCAN_KIND_TO_CARD_TYPE).toEqual({ nouns: 'vocab', verbs: 'verb', phrases: 'phrase' });
  });
});
