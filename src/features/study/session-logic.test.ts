import { describe, expect, it } from 'vitest';

import type { Card } from '@/domain/cards';
import { mulberry32 } from '@/domain/quiz';
import { newSrsState, type SrsState } from '@/domain/srs';
import { buildStudySession, parseStudyMode, shuffleWithRng } from '@/features/study/session-logic';

const NOW = new Date('2026-07-06T10:00:00.000Z');
const EARLIER = new Date('2026-07-01T10:00:00.000Z');
const LATER = new Date('2026-07-20T10:00:00.000Z');

function vocabCard(id: string, arabic: string, srs: SrsState): Card {
  return {
    id,
    type: 'vocab',
    lessonId: null,
    scanId: null,
    meaning: `meaning of ${arabic}`,
    aiImagePath: null,
    imageEnabled: true,
    srs,
    createdAt: EARLIER,
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

function newCard(id: string, arabic: string): Card {
  return vocabCard(id, arabic, newSrsState(EARLIER));
}

function dueReviewCard(id: string, arabic: string): Card {
  return vocabCard(id, arabic, {
    box: 2,
    dueAt: EARLIER,
    correctCount: 3,
    incorrectCount: 1,
    lastReviewedAt: EARLIER,
  });
}

function futureReviewCard(id: string, arabic: string): Card {
  return vocabCard(id, arabic, {
    box: 4,
    dueAt: LATER,
    correctCount: 5,
    incorrectCount: 0,
    lastReviewedAt: EARLIER,
  });
}

describe('parseStudyMode', () => {
  it("returns 'all' for the literal string", () => {
    expect(parseStudyMode('all')).toBe('all');
  });

  it("returns 'due' for 'due', undefined, and garbage", () => {
    expect(parseStudyMode('due')).toBe('due');
    expect(parseStudyMode(undefined)).toBe('due');
    expect(parseStudyMode(42)).toBe('due');
    expect(parseStudyMode('ALL')).toBe('due');
  });

  it('uses the last value when params repeat', () => {
    expect(parseStudyMode(['due', 'all'])).toBe('all');
    expect(parseStudyMode(['all', 'due'])).toBe('due');
    expect(parseStudyMode([])).toBe('due');
  });
});

describe('shuffleWithRng', () => {
  it('is deterministic for a given seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const first = shuffleWithRng(items, mulberry32(7));
    const second = shuffleWithRng(items, mulberry32(7));
    expect(first).toEqual(second);
  });

  it('returns a permutation without mutating the input', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const shuffled = shuffleWithRng(items, mulberry32(3));
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  it('handles empty and single-item inputs', () => {
    expect(shuffleWithRng([], mulberry32(1))).toEqual([]);
    expect(shuffleWithRng(['x'], mulberry32(1))).toEqual(['x']);
  });
});

describe('buildStudySession', () => {
  it('keeps only due cards in due mode', () => {
    const cards = [
      dueReviewCard('r1', 'كتاب'),
      futureReviewCard('r2', 'قلم'),
      newCard('n1', 'باب'),
    ];
    const session = buildStudySession(cards, NOW, { mode: 'due', newLimit: 20, seed: 1 });
    const ids = session.queue.map((card) => card.id).sort();
    expect(ids).toEqual(['n1', 'r1']);
    expect(session.totalPlanned).toBe(2);
  });

  it('includes not-yet-due cards in all mode', () => {
    const cards = [
      dueReviewCard('r1', 'كتاب'),
      futureReviewCard('r2', 'قلم'),
      newCard('n1', 'باب'),
    ];
    const session = buildStudySession(cards, NOW, { mode: 'all', newLimit: 20, seed: 1 });
    expect(session.totalPlanned).toBe(3);
  });

  it('caps new cards at newLimit but never caps reviews', () => {
    const cards = [
      newCard('n1', 'باب'),
      newCard('n2', 'بيت'),
      newCard('n3', 'مسجد'),
      dueReviewCard('r1', 'كتاب'),
      dueReviewCard('r2', 'قلم'),
    ];
    const session = buildStudySession(cards, NOW, { mode: 'due', newLimit: 1, seed: 5 });
    const ids = session.queue.map((card) => card.id);
    expect(ids.filter((id) => id.startsWith('n'))).toHaveLength(1);
    expect(ids.filter((id) => id.startsWith('r'))).toHaveLength(2);
  });

  it('puts new cards before reviews', () => {
    const cards = [dueReviewCard('r1', 'كتاب'), newCard('n1', 'باب'), dueReviewCard('r2', 'قلم')];
    const session = buildStudySession(cards, NOW, { mode: 'due', newLimit: 20, seed: 9 });
    expect(session.queue[0].id).toBe('n1');
  });

  it('is deterministic for the same seed and differs across seeds', () => {
    const cards = [
      dueReviewCard('r1', 'كتاب'),
      dueReviewCard('r2', 'قلم'),
      dueReviewCard('r3', 'باب'),
      dueReviewCard('r4', 'بيت'),
      dueReviewCard('r5', 'مسجد'),
      dueReviewCard('r6', 'مدرسة'),
    ];
    const build = (seed: number) =>
      buildStudySession(cards, NOW, { mode: 'due', newLimit: 20, seed }).queue.map(
        (card) => card.id,
      );
    expect(build(11)).toEqual(build(11));
    expect(build(11)).not.toEqual(build(12));
  });

  it('returns an empty session when nothing is eligible', () => {
    const session = buildStudySession([futureReviewCard('r1', 'كتاب')], NOW, {
      mode: 'due',
      newLimit: 20,
      seed: 2,
    });
    expect(session.queue).toEqual([]);
    expect(session.totalPlanned).toBe(0);
  });
});
