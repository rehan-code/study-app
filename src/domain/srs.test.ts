import { describe, expect, it } from 'vitest';

import {
  isDue,
  isNew,
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

describe('purity', () => {
  it('never mutates the input state', () => {
    const state = reviewedState(2);
    const copy = { ...state };
    reviewCard(state, 'got_it', NOW);
    reviewCard(state, 'not_yet', NOW);
    expect(state).toEqual(copy);
  });
});
