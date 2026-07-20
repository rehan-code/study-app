import { describe, expect, it } from 'vitest';

import type { Card } from '@/domain/cards';
import type { QuizKind } from '@/domain/quiz';
import { newSrsState } from '@/domain/srs';

import {
  countEligibleQuestions,
  defaultQuizKinds,
  describeLessonSelection,
  parseQuizParams,
  serializeQuizParams,
  startBlockedReason,
  toggleQuizKind,
} from '@/features/quiz/quiz-config';

const NOW = new Date('2026-07-06T10:00:00.000Z');

interface VerbSpec {
  id: string;
  past: string;
  present?: string | null;
  imperative?: string | null;
  masdar?: string | null;
  meaning: string;
}

function verbCard(spec: VerbSpec): Card {
  return {
    id: spec.id,
    type: 'verb',
    lessonId: null,
    scanId: null,
    meaning: spec.meaning,
    aiImagePath: null,
    imageEnabled: true,
    srs: newSrsState(NOW),
    createdAt: NOW,
    fields: {
      past: spec.past,
      preposition: null,
      present: spec.present ?? null,
      imperative: spec.imperative ?? null,
      masdar: spec.masdar ?? null,
      activeParticiple: null,
      passiveParticiple: null,
      note: null,
    },
  };
}

function vocabCard(id: string, arabic: string, meaning: string): Card {
  return {
    id,
    type: 'vocab',
    lessonId: null,
    scanId: null,
    meaning,
    aiImagePath: null,
    imageEnabled: true,
    srs: newSrsState(NOW),
    createdAt: NOW,
    fields: {
      arabic,
      plural1: null,
      plural2: null,
      synonym: null,
      synonymPlural: null,
      antonym: null,
      antonymPlural: null,
      note: null,
    },
  };
}

const ittasala = verbCard({
  id: 'v-ittasala',
  past: 'اِتَّصَلَ',
  present: 'يَتَّصِلُ',
  imperative: 'اِتَّصِلْ',
  masdar: 'اِتِّصَال',
  meaning: 'To call',
});
const nazara = verbCard({
  id: 'v-nazara',
  past: 'نَظَرَ',
  present: 'يَنْظُرُ',
  imperative: 'اُنْظُرْ',
  masdar: 'نَظَر',
  meaning: 'To look',
});
const bahatha = verbCard({
  id: 'v-bahatha',
  past: 'بَحَثَ',
  present: 'يَبْحَثُ',
  meaning: 'To search',
});

describe('toggleQuizKind', () => {
  it('adds a kind that is off', () => {
    expect(toggleQuizKind(['present'], 'meaning')).toEqual(['present', 'meaning']);
  });

  it('removes a kind that is on', () => {
    expect(toggleQuizKind(['present', 'meaning'], 'present')).toEqual(['meaning']);
  });

  it('keeps the canonical option order regardless of toggle order', () => {
    const afterMeaning = toggleQuizKind([], 'meaning');
    const afterImperative = toggleQuizKind(afterMeaning, 'imperative');
    expect(afterImperative).toEqual(['imperative', 'meaning']);
  });
});

describe('countEligibleQuestions', () => {
  it('returns 0 with no cards', () => {
    expect(countEligibleQuestions([], ['present'])).toBe(0);
  });

  it('returns 0 with no kinds', () => {
    expect(countEligibleQuestions([ittasala, nazara], [])).toBe(0);
  });

  it('counts every verb with the target field when distractors exist', () => {
    expect(countEligibleQuestions([ittasala, nazara, bahatha], ['present'])).toBe(3);
  });

  it('skips cards without the target field', () => {
    expect(countEligibleQuestions([ittasala, nazara, bahatha], ['imperative'])).toBe(2);
  });

  it('returns 0 when a single card has no distractor pool', () => {
    expect(countEligibleQuestions([ittasala], ['present'])).toBe(0);
  });

  it('counts non-verb cards for meaning questions', () => {
    const cards = [vocabCard('n-bab', 'بَاب', 'Door'), vocabCard('n-bayt', 'بَيْت', 'House')];
    expect(countEligibleQuestions(cards, ['meaning'])).toBe(2);
  });

  it('is deterministic across calls', () => {
    const cards = [ittasala, nazara, bahatha];
    const kinds: QuizKind[] = ['present', 'meaning'];
    expect(countEligibleQuestions(cards, kinds)).toBe(countEligibleQuestions(cards, kinds));
  });
});

describe('startBlockedReason', () => {
  it('asks for a question type when none are on', () => {
    expect(startBlockedReason(0, [], 10)).toMatch(/question type/i);
  });

  it('points at scanning when there are no cards at all', () => {
    expect(startBlockedReason(0, ['present'], 0)).toMatch(/scan/i);
  });

  it('suggests any-card questions when only verb kinds are on', () => {
    expect(startBlockedReason(1, ['present'], 5)).toMatch(/meaning or plural/i);
    expect(startBlockedReason(1, ['present', 'imperative', 'masdar'], 5)).toMatch(
      /meaning or plural/i,
    );
  });

  it('asks for more cards when an any-card kind is already on', () => {
    expect(startBlockedReason(1, ['present', 'meaning'], 1)).toMatch(/more pages/i);
    expect(startBlockedReason(1, ['plural'], 1)).toMatch(/more pages/i);
  });

  it('returns null when enough questions are available', () => {
    expect(startBlockedReason(2, ['present'], 5)).toBeNull();
  });
});

describe('defaultQuizKinds', () => {
  function withPlural(card: Card, plural1: string): Card {
    if (card.type !== 'vocab') {
      throw new Error('expected a vocab card');
    }
    return { ...card, fields: { ...card.fields, plural1 } };
  }

  it('prefers verb practice when any verb card exists', () => {
    const bab = vocabCard('n-bab', 'بَاب', 'Door');
    expect(defaultQuizKinds([bab, ittasala])).toEqual(['present']);
  });

  it('starts nouns-only collections on plural and meaning questions', () => {
    const bab = withPlural(vocabCard('n-bab', 'بَاب', 'Door'), 'أَبْوَاب');
    const bayt = vocabCard('n-bayt', 'بَيْت', 'House');
    expect(defaultQuizKinds([bab, bayt])).toEqual(['plural', 'meaning']);
  });

  it('falls back to meaning when no card has a plural', () => {
    const bab = vocabCard('n-bab', 'بَاب', 'Door');
    expect(defaultQuizKinds([bab])).toEqual(['meaning']);
  });

  it('falls back to meaning for an empty collection', () => {
    expect(defaultQuizKinds([])).toEqual(['meaning']);
  });
});

describe('serializeQuizParams / parseQuizParams', () => {
  it('round-trips a config', () => {
    const params = serializeQuizParams({ count: 10, kinds: ['present', 'meaning'] });
    expect(params).toEqual({ count: '10', kinds: 'present,meaning' });
    expect(parseQuizParams(params)).toEqual({ count: 10, kinds: ['present', 'meaning'] });
  });

  it('accepts array-shaped route params by taking the first value', () => {
    expect(parseQuizParams({ count: ['5'], kinds: ['masdar'] })).toEqual({
      count: 5,
      kinds: ['masdar'],
    });
  });

  it('dedupes repeated kinds', () => {
    expect(parseQuizParams({ count: '5', kinds: 'present,present,meaning' })).toEqual({
      count: 5,
      kinds: ['present', 'meaning'],
    });
  });

  it('rejects missing params', () => {
    expect(parseQuizParams({})).toBeNull();
    expect(parseQuizParams({ count: '10' })).toBeNull();
    expect(parseQuizParams({ kinds: 'present' })).toBeNull();
  });

  it('rejects a non-integer or non-positive count', () => {
    expect(parseQuizParams({ count: 'abc', kinds: 'present' })).toBeNull();
    expect(parseQuizParams({ count: '0', kinds: 'present' })).toBeNull();
    expect(parseQuizParams({ count: '-3', kinds: 'present' })).toBeNull();
    expect(parseQuizParams({ count: '2.5', kinds: 'present' })).toBeNull();
  });

  it('rejects unknown kinds', () => {
    expect(parseQuizParams({ count: '5', kinds: 'present,past' })).toBeNull();
  });

  it('rejects an empty kinds list', () => {
    expect(parseQuizParams({ count: '5', kinds: '' })).toBeNull();
    expect(parseQuizParams({ count: '5', kinds: ',,' })).toBeNull();
  });

  it('rejects non-object input', () => {
    expect(parseQuizParams(null)).toBeNull();
    expect(parseQuizParams('count=5')).toBeNull();
  });
});

describe('describeLessonSelection', () => {
  const lessons = [
    { id: 'l1', name: 'Lesson 9' },
    { id: 'l2', name: 'Lesson 10' },
  ];

  it('describes the empty selection as all lessons', () => {
    expect(describeLessonSelection([], lessons, 'no-lesson')).toBe('All lessons');
  });

  it('joins resolved lesson names', () => {
    expect(describeLessonSelection(['l1', 'l2'], lessons, 'no-lesson')).toBe('Lesson 9, Lesson 10');
  });

  it('labels the virtual no-lesson id', () => {
    expect(describeLessonSelection(['no-lesson', 'l1'], lessons, 'no-lesson')).toBe(
      'No lesson, Lesson 9',
    );
  });

  it('falls back to a count while lessons are unknown', () => {
    expect(describeLessonSelection(['l1'], undefined, 'no-lesson')).toBe('1 lesson selected');
    expect(describeLessonSelection(['l1', 'l2'], undefined, 'no-lesson')).toBe(
      '2 lessons selected',
    );
  });

  it('falls back to a count when no ids resolve', () => {
    expect(describeLessonSelection(['gone'], lessons, 'no-lesson')).toBe('1 lesson selected');
  });
});
