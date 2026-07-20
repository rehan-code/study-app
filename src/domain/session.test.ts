import { describe, expect, it } from 'vitest';

import type { Card } from '@/domain/cards';
import {
  answerCurrent,
  createSession,
  currentCard,
  isComplete,
  sessionProgress,
  sessionSummary,
  undoLast,
  type CreateSessionOptions,
} from '@/domain/session';
import { newSrsState, type SrsState } from '@/domain/srs';

const NOW = new Date('2026-07-06T10:00:00.000Z');
const EARLIER = new Date('2026-07-01T10:00:00.000Z');

function reviewedSrs(): SrsState {
  return { box: 2, dueAt: EARLIER, correctCount: 3, incorrectCount: 1, lastReviewedAt: EARLIER };
}

function vocabCard(id: string, arabic: string, meaning: string, srs: SrsState): Card {
  return {
    id,
    type: 'vocab',
    lessonId: null,
    scanId: null,
    meaning,
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

function newCard(id: string, arabic: string, meaning: string): Card {
  return vocabCard(id, arabic, meaning, newSrsState(EARLIER));
}

function reviewCardFixture(id: string, arabic: string, meaning: string): Card {
  return vocabCard(id, arabic, meaning, reviewedSrs());
}

const identity = <T>(items: T[]): T[] => [...items];
const reversed = <T>(items: T[]): T[] => [...items].reverse();

function options(overrides: Partial<CreateSessionOptions> = {}): CreateSessionOptions {
  return { newLimit: 100, shuffle: identity, ...overrides };
}

function fiveCardSession() {
  const cards = [
    newCard('new-a', 'أُسْبُوعٌ', 'Week'),
    newCard('new-b', 'يَمِينٌ', 'Right side'),
    newCard('new-c', 'يَسَارٌ', 'Left side'),
    reviewCardFixture('rev-a', 'أَمَامَ', 'In front of'),
    reviewCardFixture('rev-b', 'خَلْفَ', 'Behind'),
  ];
  return createSession(cards, NOW, options());
}

function queueIds(state: { queue: Card[] }): string[] {
  return state.queue.map((card) => card.id);
}

describe('createSession', () => {
  it('puts new cards before review cards regardless of input order', () => {
    const cards = [
      reviewCardFixture('rev-a', 'أَمَامَ', 'In front of'),
      newCard('new-a', 'أُسْبُوعٌ', 'Week'),
      reviewCardFixture('rev-b', 'خَلْفَ', 'Behind'),
      newCard('new-b', 'يَمِينٌ', 'Right side'),
    ];
    const state = createSession(cards, NOW, options());
    expect(queueIds(state)).toEqual(['new-a', 'new-b', 'rev-a', 'rev-b']);
    expect(state.totalPlanned).toBe(4);
    expect(state.history).toEqual([]);
  });

  it('shuffles within each group with the injected shuffle', () => {
    const cards = [
      newCard('new-a', 'أُسْبُوعٌ', 'Week'),
      newCard('new-b', 'يَمِينٌ', 'Right side'),
      reviewCardFixture('rev-a', 'أَمَامَ', 'In front of'),
      reviewCardFixture('rev-b', 'خَلْفَ', 'Behind'),
    ];
    const state = createSession(cards, NOW, options({ shuffle: reversed }));
    expect(queueIds(state)).toEqual(['new-b', 'new-a', 'rev-b', 'rev-a']);
  });

  it('caps new cards at newLimit after shuffling, never reviews', () => {
    const cards = [
      newCard('new-a', 'أُسْبُوعٌ', 'Week'),
      newCard('new-b', 'يَمِينٌ', 'Right side'),
      newCard('new-c', 'يَسَارٌ', 'Left side'),
      reviewCardFixture('rev-a', 'أَمَامَ', 'In front of'),
      reviewCardFixture('rev-b', 'خَلْفَ', 'Behind'),
    ];
    const state = createSession(cards, NOW, options({ newLimit: 2, shuffle: reversed }));
    expect(queueIds(state)).toEqual(['new-c', 'new-b', 'rev-b', 'rev-a']);
    expect(state.totalPlanned).toBe(4);
  });

  it('includes only reviews when newLimit is 0', () => {
    const cards = [
      newCard('new-a', 'أُسْبُوعٌ', 'Week'),
      reviewCardFixture('rev-a', 'أَمَامَ', 'In front of'),
    ];
    const state = createSession(cards, NOW, options({ newLimit: 0 }));
    expect(queueIds(state)).toEqual(['rev-a']);
    expect(state.totalPlanned).toBe(1);
  });

  it('creates an already-complete session from no cards', () => {
    const state = createSession([], NOW, options());
    expect(state.queue).toEqual([]);
    expect(state.totalPlanned).toBe(0);
    expect(isComplete(state)).toBe(true);
    expect(currentCard(state)).toBeNull();
    expect(sessionProgress(state)).toEqual({ done: 0, total: 0 });
    expect(sessionSummary(state)).toEqual({ gotIt: 0, notYet: 0 });
  });
});

describe('currentCard', () => {
  it('returns the head of the queue', () => {
    const state = fiveCardSession();
    expect(currentCard(state)?.id).toBe('new-a');
  });
});

describe('answerCurrent with got_it', () => {
  it('removes the card and records previous and next SRS states', () => {
    const state = fiveCardSession();
    const answered = answerCurrent(state, 'got_it', NOW);
    expect(queueIds(answered)).toEqual(['new-b', 'new-c', 'rev-a', 'rev-b']);
    expect(answered.history).toHaveLength(1);
    const entry = answered.history[0];
    expect(entry.cardId).toBe('new-a');
    expect(entry.result).toBe('got_it');
    expect(entry.previous).toEqual(newSrsState(EARLIER));
    expect(entry.next.box).toBe(1);
    expect(entry.next.correctCount).toBe(1);
    expect(entry.next.lastReviewedAt).toEqual(NOW);
  });

  it('advances progress toward completion', () => {
    let state = fiveCardSession();
    expect(sessionProgress(state)).toEqual({ done: 0, total: 5 });
    state = answerCurrent(state, 'got_it', NOW);
    expect(sessionProgress(state)).toEqual({ done: 1, total: 5 });
    expect(isComplete(state)).toBe(false);
  });

  it('returns the state unchanged when the queue is empty', () => {
    const state = createSession([], NOW, options());
    expect(answerCurrent(state, 'got_it', NOW)).toBe(state);
  });
});

describe('answerCurrent with not_yet', () => {
  it('reinserts the updated card three positions ahead', () => {
    const state = fiveCardSession();
    const answered = answerCurrent(state, 'not_yet', NOW);
    expect(queueIds(answered)).toEqual(['new-b', 'new-c', 'rev-a', 'new-a', 'rev-b']);
    const requeued = answered.queue[3];
    expect(requeued.srs.box).toBe(0);
    expect(requeued.srs.incorrectCount).toBe(1);
    expect(requeued.srs.lastReviewedAt).toEqual(NOW);
  });

  it('reinserts at the end when fewer than three cards remain', () => {
    const cards = [
      newCard('new-a', 'أُسْبُوعٌ', 'Week'),
      newCard('new-b', 'يَمِينٌ', 'Right side'),
    ];
    const answered = answerCurrent(createSession(cards, NOW, options()), 'not_yet', NOW);
    expect(queueIds(answered)).toEqual(['new-b', 'new-a']);
  });

  it('keeps a single-card session running until the card is answered got_it', () => {
    const cards = [newCard('new-a', 'أُسْبُوعٌ', 'Week')];
    let state = createSession(cards, NOW, options());
    state = answerCurrent(state, 'not_yet', NOW);
    expect(queueIds(state)).toEqual(['new-a']);
    expect(isComplete(state)).toBe(false);
    expect(currentCard(state)?.srs.incorrectCount).toBe(1);
    state = answerCurrent(state, 'got_it', NOW);
    expect(isComplete(state)).toBe(true);
    expect(state.history).toHaveLength(2);
    expect(sessionSummary(state)).toEqual({ gotIt: 0, notYet: 1 });
  });

  it('does not change progress until the card is eventually got', () => {
    let state = fiveCardSession();
    state = answerCurrent(state, 'not_yet', NOW);
    expect(sessionProgress(state)).toEqual({ done: 0, total: 5 });
  });
});

describe('answerCurrent purity', () => {
  it('never mutates the input state or its cards', () => {
    const state = fiveCardSession();
    const idsBefore = queueIds(state);
    const headSrsBefore = { ...state.queue[0].srs };
    answerCurrent(state, 'not_yet', NOW);
    answerCurrent(state, 'got_it', NOW);
    expect(queueIds(state)).toEqual(idsBefore);
    expect(state.history).toEqual([]);
    expect(state.queue[0].srs).toEqual(headSrsBefore);
  });
});

describe('undoLast', () => {
  it('returns the state unchanged when the history is empty', () => {
    const state = fiveCardSession();
    expect(undoLast(state)).toBe(state);
    const empty = createSession([], NOW, options());
    expect(undoLast(empty)).toBe(empty);
  });

  it('restores a got_it card to the queue head with its previous SRS state', () => {
    const state = fiveCardSession();
    const answered = answerCurrent(state, 'got_it', NOW);
    const undone = undoLast(answered);
    expect(queueIds(undone)).toEqual(queueIds(state));
    expect(undone.history).toEqual([]);
    expect(undone.queue[0].srs).toEqual(newSrsState(EARLIER));
    expect(sessionProgress(undone)).toEqual({ done: 0, total: 5 });
  });

  it('removes the requeued copy when undoing a not_yet answer', () => {
    const state = fiveCardSession();
    const answered = answerCurrent(state, 'not_yet', NOW);
    const undone = undoLast(answered);
    expect(queueIds(undone)).toEqual(['new-a', 'new-b', 'new-c', 'rev-a', 'rev-b']);
    expect(undone.queue.filter((card) => card.id === 'new-a')).toHaveLength(1);
    expect(undone.queue[0].srs.incorrectCount).toBe(0);
    expect(undone.history).toEqual([]);
  });

  it('unwinds several answers back to the starting queue', () => {
    const state = fiveCardSession();
    let current = answerCurrent(state, 'got_it', NOW);
    current = answerCurrent(current, 'not_yet', NOW);
    current = undoLast(undoLast(current));
    expect(queueIds(current)).toEqual(queueIds(state));
    expect(current.history).toEqual([]);
  });

  it('supports answering again after an undo', () => {
    const state = fiveCardSession();
    const redone = answerCurrent(undoLast(answerCurrent(state, 'not_yet', NOW)), 'got_it', NOW);
    expect(redone.history).toHaveLength(1);
    expect(redone.history[0].result).toBe('got_it');
    expect(redone.history[0].previous.incorrectCount).toBe(0);
  });
});

describe('session completion and summary', () => {
  it('completes a mixed session and counts a card as notYet if any answer missed', () => {
    const cards = [
      newCard('new-a', 'أُسْبُوعٌ', 'Week'),
      reviewCardFixture('rev-a', 'أَمَامَ', 'In front of'),
    ];
    let state = createSession(cards, NOW, options());
    state = answerCurrent(state, 'got_it', NOW);
    state = answerCurrent(state, 'not_yet', NOW);
    expect(isComplete(state)).toBe(false);
    state = answerCurrent(state, 'got_it', NOW);
    expect(isComplete(state)).toBe(true);
    expect(currentCard(state)).toBeNull();
    expect(sessionProgress(state)).toEqual({ done: 2, total: 2 });
    expect(state.history).toHaveLength(3);
    expect(sessionSummary(state)).toEqual({ gotIt: 1, notYet: 1 });
  });

  it('counts each card once no matter how many times it was missed', () => {
    const cards = [newCard('new-a', 'أُسْبُوعٌ', 'Week')];
    let state = createSession(cards, NOW, options());
    state = answerCurrent(state, 'not_yet', NOW);
    state = answerCurrent(state, 'not_yet', NOW);
    state = answerCurrent(state, 'got_it', NOW);
    expect(sessionSummary(state)).toEqual({ gotIt: 0, notYet: 1 });
  });
});
