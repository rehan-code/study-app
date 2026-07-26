import { describe, expect, it } from 'vitest';

import {
  isDue,
  isNew,
  learnedness,
  LEITNER_INTERVALS_MS,
  MAX_BOX,
  newSrsState,
  reviewCard,
  type SrsState,
} from '@/domain/srs';

const NOW = new Date('2026-07-06T10:00:00.000Z');

function reviewedState(box: number): SrsState {
  return {
    box,
    dueAt: new Date('2026-07-01T10:00:00.000Z'),
    correctCount: 4,
    incorrectCount: 2,
    lastReviewedAt: new Date('2026-07-01T10:00:00.000Z'),
  };
}

describe('newSrsState', () => {
  it('starts in box 0, due immediately, with no review history', () => {
    const state = newSrsState(NOW);
    expect(state).toEqual({
      box: 0,
      dueAt: NOW,
      correctCount: 0,
      incorrectCount: 0,
      lastReviewedAt: null,
    });
  });
});

describe('isNew', () => {
  it('is true for a card that has never been answered', () => {
    expect(isNew(newSrsState(NOW))).toBe(true);
  });

  it('is false once the card has been reviewed', () => {
    expect(isNew(reviewCard(newSrsState(NOW), 'got_it', NOW))).toBe(false);
    expect(isNew(reviewCard(newSrsState(NOW), 'not_yet', NOW))).toBe(false);
  });
});

describe('isDue', () => {
  it('is due exactly at the due time', () => {
    expect(isDue(newSrsState(NOW), NOW)).toBe(true);
  });

  it('is due when the due time has passed', () => {
    const state = { ...newSrsState(NOW), dueAt: new Date(NOW.getTime() - 1) };
    expect(isDue(state, NOW)).toBe(true);
  });

  it('is not due one millisecond before the due time', () => {
    const state = { ...newSrsState(NOW), dueAt: new Date(NOW.getTime() + 1) };
    expect(isDue(state, NOW)).toBe(false);
  });
});

describe('reviewCard got_it', () => {
  it('moves up one box and schedules the next interval', () => {
    const next = reviewCard(newSrsState(NOW), 'got_it', NOW);
    expect(next.box).toBe(1);
    expect(next.dueAt).toEqual(new Date(NOW.getTime() + LEITNER_INTERVALS_MS[1]));
    expect(next.correctCount).toBe(1);
    expect(next.incorrectCount).toBe(0);
    expect(next.lastReviewedAt).toEqual(NOW);
  });

  it('walks the whole Leitner ladder with the published intervals', () => {
    let state = newSrsState(NOW);
    for (let box = 1; box <= MAX_BOX; box += 1) {
      state = reviewCard(state, 'got_it', NOW);
      expect(state.box).toBe(box);
      expect(state.dueAt).toEqual(new Date(NOW.getTime() + LEITNER_INTERVALS_MS[box]));
    }
  });

  it('caps at the top box', () => {
    const next = reviewCard(reviewedState(MAX_BOX), 'got_it', NOW);
    expect(next.box).toBe(MAX_BOX);
    expect(next.dueAt).toEqual(new Date(NOW.getTime() + LEITNER_INTERVALS_MS[MAX_BOX]));
  });

  it('preserves the incorrect count', () => {
    const next = reviewCard(reviewedState(3), 'got_it', NOW);
    expect(next.correctCount).toBe(5);
    expect(next.incorrectCount).toBe(2);
  });
});

describe('reviewCard not_yet', () => {
  it('drops back to box 0 and is due again immediately', () => {
    const next = reviewCard(reviewedState(4), 'not_yet', NOW);
    expect(next.box).toBe(0);
    expect(next.dueAt).toEqual(NOW);
    expect(isDue(next, NOW)).toBe(true);
  });

  it('increments only the incorrect count and stamps the review time', () => {
    const next = reviewCard(reviewedState(4), 'not_yet', NOW);
    expect(next.correctCount).toBe(4);
    expect(next.incorrectCount).toBe(3);
    expect(next.lastReviewedAt).toEqual(NOW);
  });
});

describe('learnedness', () => {
  function state(box: number, correctCount: number, incorrectCount: number): SrsState {
    return { box, dueAt: NOW, correctCount, incorrectCount, lastReviewedAt: NOW };
  }

  it('is 0 for a word that has never been answered', () => {
    expect(learnedness(newSrsState(NOW))).toBe(0);
  });

  it('is 0 for a word knocked back to box 0 by a miss', () => {
    expect(learnedness(state(0, 0, 3))).toBe(0);
  });

  it('is 1 for a word at the top box with a clean record', () => {
    expect(learnedness(state(MAX_BOX, MAX_BOX, 0))).toBe(1);
  });

  it('rises with the box', () => {
    const low = learnedness(state(1, 1, 0));
    const middle = learnedness(state(3, 3, 0));
    const high = learnedness(state(5, 5, 0));
    expect(low).toBeLessThan(middle);
    expect(middle).toBeLessThan(high);
  });

  it('separates same-box words by how often they were missed', () => {
    expect(learnedness(state(3, 3, 0))).toBeGreaterThan(learnedness(state(3, 3, 5)));
  });

  it('stays within 0 and 1 across the whole box range', () => {
    for (let box = 0; box <= MAX_BOX; box += 1) {
      const value = learnedness(state(box, box, 2));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('drops after a miss and climbs after a correct answer', () => {
    const before = reviewedState(3);
    expect(learnedness(reviewCard(before, 'not_yet', NOW))).toBeLessThan(learnedness(before));
    expect(learnedness(reviewCard(before, 'got_it', NOW))).toBeGreaterThan(learnedness(before));
  });
});

describe('purity', () => {
  it('never mutates the input state', () => {
    const state = reviewedState(2);
    const copy = { ...state };
    reviewCard(state, 'got_it', NOW);
    reviewCard(state, 'not_yet', NOW);
    expect(state).toEqual(copy);
  });
});
