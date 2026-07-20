import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { Card, VerbFields } from '@/domain/cards';
import {
  describeCardDraftProblem,
  draftFromCard,
  draftToCardFields,
  headlineFieldKey,
  isDraftDirty,
  validateCardDraft,
  type CardDraft,
} from '@/features/library/card-draft';

const CREATED = new Date('2026-01-01T00:00:00Z');

function makeVerbCard(fields?: Partial<VerbFields>): Card {
  return {
    id: 'card-verb',
    lessonId: null,
    scanId: null,
    type: 'verb',
    fields: {
      past: 'اتَّصَلَ',
      preposition: 'بـ',
      present: 'يَتَّصِلُ',
      imperative: null,
      masdar: 'اتِّصال',
      activeParticiple: null,
      passiveParticiple: null,
      note: null,
      ...fields,
    },
    meaning: 'To call',
    aiImagePath: null,
    imageEnabled: true,
    srs: { box: 0, dueAt: CREATED, correctCount: 0, incorrectCount: 0, lastReviewedAt: null },
    createdAt: CREATED,
  };
}

describe('headlineFieldKey', () => {
  it('is past for verbs and arabic otherwise', () => {
    expect(headlineFieldKey('verb')).toBe('past');
    expect(headlineFieldKey('vocab')).toBe('arabic');
    expect(headlineFieldKey('phrase')).toBe('arabic');
  });
});

describe('draftFromCard', () => {
  it('maps every labeled field, turning nulls into empty strings', () => {
    const draft = draftFromCard(makeVerbCard());
    expect(draft.fields).toEqual({
      past: 'اتَّصَلَ',
      preposition: 'بـ',
      present: 'يَتَّصِلُ',
      imperative: '',
      masdar: 'اتِّصال',
      activeParticiple: '',
      passiveParticiple: '',
      note: '',
    });
    expect(draft.meaning).toBe('To call');
  });
});

describe('isDraftDirty', () => {
  it('is clean for an untouched draft', () => {
    const card = makeVerbCard();
    expect(isDraftDirty(card, draftFromCard(card))).toBe(false);
  });

  it('detects a changed field', () => {
    const card = makeVerbCard();
    const draft = draftFromCard(card);
    draft.fields.imperative = 'اتَّصِلْ';
    expect(isDraftDirty(card, draft)).toBe(true);
  });

  it('detects a changed meaning', () => {
    const card = makeVerbCard();
    const draft = draftFromCard(card);
    draft.meaning = 'To contact';
    expect(isDraftDirty(card, draft)).toBe(true);
  });

  it('is clean again after reverting an edit', () => {
    const card = makeVerbCard();
    const draft = draftFromCard(card);
    draft.fields.masdar = 'x';
    draft.fields.masdar = 'اتِّصال';
    expect(isDraftDirty(card, draft)).toBe(false);
  });
});

describe('validateCardDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateCardDraft('verb', draftFromCard(makeVerbCard()))).toBeNull();
  });

  it('flags a whitespace-only headline first', () => {
    const draft: CardDraft = { fields: { past: '   ' }, meaning: '' };
    expect(validateCardDraft('verb', draft)).toBe('missing_headline');
  });

  it('flags a missing meaning', () => {
    const draft: CardDraft = { fields: { arabic: 'كتاب' }, meaning: '  ' };
    expect(validateCardDraft('vocab', draft)).toBe('missing_meaning');
  });

  it('checks the headline key that matches the card type', () => {
    const draft: CardDraft = { fields: { past: 'اتصل', arabic: '' }, meaning: 'To call' };
    expect(validateCardDraft('verb', draft)).toBeNull();
  });
});

describe('describeCardDraftProblem', () => {
  it('has a friendly message per problem', () => {
    expect(describeCardDraftProblem('missing_headline')).toBe('Fill in the Arabic to save.');
    expect(describeCardDraftProblem('missing_meaning')).toBe('Fill in the meaning to save.');
  });
});

describe('draftToCardFields', () => {
  it('normalizes blanks and dashes to null and trims values', () => {
    const draft: CardDraft = {
      fields: {
        past: '  اتَّصَلَ ',
        preposition: 'بـ',
        present: '',
        imperative: '-',
        masdar: 'اتِّصال',
        activeParticiple: '',
        passiveParticiple: '',
        note: '',
      },
      meaning: 'To call',
    };
    expect(draftToCardFields('verb', draft)).toEqual({
      past: 'اتَّصَلَ',
      preposition: 'بـ',
      present: null,
      imperative: null,
      masdar: 'اتِّصال',
      activeParticiple: null,
      passiveParticiple: null,
      note: null,
    });
  });

  it('throws when the headline is empty (callers validate first)', () => {
    const draft: CardDraft = { fields: { arabic: '', note: '' }, meaning: 'Book' };
    expect(() => draftToCardFields('phrase', draft)).toThrow(ZodError);
  });
});
