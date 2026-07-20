import { describe, expect, it } from 'vitest';

import type { Card } from '@/domain/cards';
import { newSrsState, type SrsState } from '@/domain/srs';
import {
  computeStudyStats,
  greetingForHour,
  hasLessonlessCards,
} from '@/features/study/home-logic';

const NOW = new Date('2026-07-06T10:00:00.000Z');
const EARLIER = new Date('2026-07-01T10:00:00.000Z');
const LATER = new Date('2026-07-20T10:00:00.000Z');

function phraseCard(id: string, lessonId: string | null, srs: SrsState): Card {
  return {
    id,
    type: 'phrase',
    lessonId,
    scanId: null,
    meaning: 'How are you?',
    aiImagePath: null,
    imageEnabled: true,
    srs,
    createdAt: EARLIER,
    fields: { arabic: 'كيف حالك؟', note: null },
  };
}

function dueReviewSrs(): SrsState {
  return { box: 1, dueAt: EARLIER, correctCount: 1, incorrectCount: 0, lastReviewedAt: EARLIER };
}

function futureReviewSrs(): SrsState {
  return { box: 3, dueAt: LATER, correctCount: 4, incorrectCount: 0, lastReviewedAt: EARLIER };
}

describe('greetingForHour', () => {
  it('covers the whole day', () => {
    expect(greetingForHour(0)).toBe('Good evening');
    expect(greetingForHour(4)).toBe('Good evening');
    expect(greetingForHour(5)).toBe('Good morning');
    expect(greetingForHour(11)).toBe('Good morning');
    expect(greetingForHour(12)).toBe('Good afternoon');
    expect(greetingForHour(17)).toBe('Good afternoon');
    expect(greetingForHour(18)).toBe('Good evening');
    expect(greetingForHour(23)).toBe('Good evening');
  });
});

describe('computeStudyStats', () => {
  it('splits due reviews, new cards, and totals', () => {
    const cards = [
      phraseCard('a', null, dueReviewSrs()),
      phraseCard('b', null, futureReviewSrs()),
      phraseCard('c', null, newSrsState(EARLIER)),
      phraseCard('d', null, newSrsState(EARLIER)),
    ];
    const stats = computeStudyStats(cards, NOW);
    expect(stats.dueReviews).toBe(1);
    expect(stats.newCards).toBe(2);
    expect(stats.total).toBe(4);
    expect(stats.readyNow).toBe(3);
  });

  it('does not count a new card scheduled in the future as ready', () => {
    const notYetDueNew = phraseCard('a', null, newSrsState(LATER));
    const stats = computeStudyStats([notYetDueNew], NOW);
    expect(stats.newCards).toBe(1);
    expect(stats.readyNow).toBe(0);
    expect(stats.dueReviews).toBe(0);
  });

  it('handles an empty collection', () => {
    expect(computeStudyStats([], NOW)).toEqual({
      dueReviews: 0,
      newCards: 0,
      total: 0,
      readyNow: 0,
    });
  });
});

describe('hasLessonlessCards', () => {
  it('detects cards without a lesson', () => {
    expect(hasLessonlessCards([phraseCard('a', 'lesson-1', dueReviewSrs())])).toBe(false);
    expect(
      hasLessonlessCards([
        phraseCard('a', 'lesson-1', dueReviewSrs()),
        phraseCard('b', null, dueReviewSrs()),
      ]),
    ).toBe(true);
    expect(hasLessonlessCards([])).toBe(false);
  });
});
