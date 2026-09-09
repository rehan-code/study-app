import { describe, expect, it } from 'vitest';

import type { Card } from '@/domain/cards';
import { MAX_BOX, type SrsState } from '@/domain/srs';
import { startingSrs, studiedProgressByWord, wordKey, type WordSeed } from '@/domain/word-key';

const NOW = new Date('2026-07-06T10:00:00.000Z');

function studiedSrs(box: number, lastReviewedAt = NOW): SrsState {
  return {
    box,
    dueAt: lastReviewedAt,
    correctCount: box,
    incorrectCount: 0,
    lastReviewedAt,
  };
}

const NEW_SRS: SrsState = {
  box: 0,
  dueAt: NOW,
  correctCount: 0,
  incorrectCount: 0,
  lastReviewedAt: null,
};

function vocabSeed(arabic: string, meaning: string): WordSeed {
  return {
    type: 'vocab',
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
    meaning,
  };
}

function verbSeed(past: string, meaning: string, preposition: string | null = null): WordSeed {
  return {
    type: 'verb',
    fields: {
      past,
      preposition,
      present: null,
      imperative: null,
      masdar: null,
      activeParticiple: null,
      passiveParticiple: null,
      note: null,
    },
    meaning,
  };
}

function studiedCard(seed: WordSeed, srs: SrsState): WordSeed & { srs: SrsState } {
  return { ...seed, srs };
}

describe('wordKey', () => {
  it('matches the same word however it is vowelled or spaced', () => {
    const printed = vocabSeed('بَيْتٌ', 'House');
    const reprinted = vocabSeed('بـيت', 'house');
    expect(wordKey(printed)).toBe(wordKey(reprinted));
  });

  it('matches meanings that differ only by case or spacing', () => {
    expect(wordKey(vocabSeed('كِتَاب', '  A  Book '))).toBe(wordKey(vocabSeed('كِتَاب', 'a book')));
  });

  it('separates words that share only their Arabic letters', () => {
    expect(wordKey(vocabSeed('بَرْد', 'Cold'))).not.toBe(wordKey(vocabSeed('بَرَد', 'Hail')));
  });

  it('separates words that share only their meaning', () => {
    expect(wordKey(verbSeed('ذَهَبَ', 'To go'))).not.toBe(wordKey(verbSeed('رَاحَ', 'To go')));
  });

  it('keys verbs on the past tense alone, so a preposition never splits a word', () => {
    expect(wordKey(verbSeed('نَظَرَ', 'To look at', 'إِلَى'))).toBe(
      wordKey(verbSeed('نَظَرَ', 'To look at')),
    );
  });

  it('has no key for a row missing its Arabic or its meaning', () => {
    expect(wordKey(vocabSeed('   ', 'House'))).toBeNull();
    expect(wordKey(vocabSeed('بَيْت', '   '))).toBeNull();
  });
});

describe('studiedProgressByWord', () => {
  it('leaves out words that have never been answered', () => {
    const byWord = studiedProgressByWord([studiedCard(vocabSeed('بَيْت', 'House'), NEW_SRS)]);
    expect(byWord.size).toBe(0);
  });

  it('keeps the copy that is furthest along', () => {
    const seed = vocabSeed('بَيْت', 'House');
    const byWord = studiedProgressByWord([
      studiedCard(seed, studiedSrs(1)),
      studiedCard(vocabSeed('بَيْتٌ', 'house'), studiedSrs(MAX_BOX)),
      studiedCard(seed, studiedSrs(2)),
    ]);
    expect(byWord.get(wordKey(seed) ?? '')?.box).toBe(MAX_BOX);
  });

  it('breaks a tie on box with the most recent answer', () => {
    const seed = vocabSeed('بَيْت', 'House');
    const later = new Date('2026-08-01T10:00:00.000Z');
    const byWord = studiedProgressByWord([
      studiedCard(seed, studiedSrs(3, later)),
      studiedCard(seed, studiedSrs(3)),
    ]);
    expect(byWord.get(wordKey(seed) ?? '')?.lastReviewedAt).toEqual(later);
  });
});

describe('startingSrs', () => {
  it('carries the progress of a word the collection already knows', () => {
    const known = studiedSrs(4);
    const studied = studiedProgressByWord([studiedCard(vocabSeed('بَيْتٌ', 'House'), known)]);
    expect(startingSrs(studied, vocabSeed('بيت', 'house'), NOW)).toEqual(known);
  });

  it('starts a genuinely new word from scratch', () => {
    const studied = studiedProgressByWord([
      studiedCard(vocabSeed('بَيْت', 'House'), studiedSrs(4)),
    ]);
    const fresh = startingSrs(studied, vocabSeed('مَدْرَسَة', 'School'), NOW);
    expect(fresh).toEqual(NEW_SRS);
  });

  it('starts a row with no key from scratch', () => {
    const studied = studiedProgressByWord([
      studiedCard(vocabSeed('بَيْت', 'House'), studiedSrs(4)),
    ]);
    expect(startingSrs(studied, vocabSeed('بَيْت', ''), NOW)).toEqual(NEW_SRS);
  });

  it('accepts cards straight from the collection', () => {
    const card: Card = {
      id: 'c-1',
      type: 'vocab',
      lessonId: null,
      scanId: null,
      meaning: 'House',
      aiImagePath: null,
      imageEnabled: true,
      srs: studiedSrs(5),
      createdAt: NOW,
      fields: {
        arabic: 'بَيْتٌ',
        plural1: 'بُيُوت',
        plural2: null,
        synonym: null,
        synonymPlural: null,
        antonym: null,
        antonymPlural: null,
        note: null,
      },
    };
    const studied = studiedProgressByWord([card]);
    expect(startingSrs(studied, vocabSeed('بَيْت', 'House'), NOW).box).toBe(5);
  });
});
