import { describe, expect, it, vi } from 'vitest';

import type { Card } from '@/domain/cards';
import type { Lesson } from '@/domain/lessons';
import {
  buildLessonSummaries,
  cardCountLabel,
  NO_LESSON_NAME,
} from '@/features/library/lesson-summaries';
import { NO_LESSON_ID } from '@/lib/queries';

// Hoisted above the imports by vitest; replaces the React Native only modules.
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

const NOW = new Date('2026-07-07T12:00:00Z');
const PAST = new Date('2026-07-07T11:00:00Z');
const FUTURE = new Date('2026-07-08T12:00:00Z');

function makeLesson(id: string, name: string, position: number): Lesson {
  return { id, name, position, createdAt: new Date('2026-01-01T00:00:00Z') };
}

function makeCard(id: string, lessonId: string | null, dueAt: Date): Card {
  return {
    id,
    lessonId,
    scanId: null,
    type: 'vocab',
    fields: {
      arabic: 'كِتاب',
      plural1: 'كُتُب',
      plural2: null,
      synonym: null,
      synonymPlural: null,
      antonym: null,
      antonymPlural: null,
      note: null,
    },
    meaning: 'Book',
    aiImagePath: null,
    imageEnabled: true,
    srs: { box: 0, dueAt, correctCount: 0, incorrectCount: 0, lastReviewedAt: null },
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

describe('buildLessonSummaries', () => {
  it('returns nothing for no lessons and no cards', () => {
    expect(buildLessonSummaries([], [], NOW)).toEqual([]);
  });

  it('counts totals and due cards per lesson, preserving lesson order', () => {
    const lessons = [makeLesson('l9', 'Lesson 9', 0), makeLesson('l10', 'Lesson 10', 1)];
    const cards = [
      makeCard('c1', 'l9', PAST),
      makeCard('c2', 'l9', FUTURE),
      makeCard('c3', 'l10', NOW),
    ];
    expect(buildLessonSummaries(lessons, cards, NOW)).toEqual([
      { lessonId: 'l9', name: 'Lesson 9', total: 2, due: 1 },
      { lessonId: 'l10', name: 'Lesson 10', total: 1, due: 1 },
    ]);
  });

  it('includes lessons that have no cards', () => {
    const lessons = [makeLesson('l1', 'Lesson 1', 0)];
    expect(buildLessonSummaries(lessons, [], NOW)).toEqual([
      { lessonId: 'l1', name: 'Lesson 1', total: 0, due: 0 },
    ]);
  });

  it('appends a No lesson group when lesson-less cards exist', () => {
    const lessons = [makeLesson('l1', 'Lesson 1', 0)];
    const cards = [makeCard('c1', null, PAST), makeCard('c2', null, FUTURE)];
    expect(buildLessonSummaries(lessons, cards, NOW)).toEqual([
      { lessonId: 'l1', name: 'Lesson 1', total: 0, due: 0 },
      { lessonId: NO_LESSON_ID, name: NO_LESSON_NAME, total: 2, due: 1 },
    ]);
  });

  it('omits the No lesson group when every card has a lesson', () => {
    const lessons = [makeLesson('l1', 'Lesson 1', 0)];
    const cards = [makeCard('c1', 'l1', PAST)];
    const summaries = buildLessonSummaries(lessons, cards, NOW);
    expect(summaries.some((summary) => summary.lessonId === NO_LESSON_ID)).toBe(false);
  });

  it('ignores cards pointing at unknown lessons instead of inventing rows', () => {
    const cards = [makeCard('c1', 'ghost', PAST)];
    expect(buildLessonSummaries([], cards, NOW)).toEqual([]);
  });
});

describe('cardCountLabel', () => {
  it('pluralizes correctly', () => {
    expect(cardCountLabel(0)).toBe('0 cards');
    expect(cardCountLabel(1)).toBe('1 card');
    expect(cardCountLabel(12)).toBe('12 cards');
  });
});
