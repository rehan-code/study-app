import type { Card } from '@/domain/cards';
import { isNew, reviewCard, type ReviewResult, type SrsState } from '@/domain/srs';

export interface SessionEntry {
  cardId: string;
  result: ReviewResult;
  previous: SrsState;
  next: SrsState;
  /** Snapshot taken before answering so undo can restore a card that got_it removed from the queue. */
  card: Card;
}

export interface StudySessionState {
  queue: Card[];
  history: SessionEntry[];
  totalPlanned: number;
}

export interface CreateSessionOptions {
  newLimit: number;
  shuffle: <T>(items: T[]) => T[];
}

/** A missed card comes back after a few other cards, not immediately. */
const NOT_YET_REINSERT_OFFSET = 3;

export function createSession(
  cards: Card[],
  now: Date,
  options: CreateSessionOptions,
): StudySessionState {
  const newCards: Card[] = [];
  const reviewCards: Card[] = [];
  for (const card of cards) {
    if (isNew(card.srs)) {
      newCards.push(card);
    } else {
      reviewCards.push(card);
    }
  }
  const newLimit = Math.max(0, options.newLimit);
  const pickedNew = options.shuffle(newCards).slice(0, newLimit);
  const queue = [...pickedNew, ...options.shuffle(reviewCards)];
  return { queue, history: [], totalPlanned: queue.length };
}

export function currentCard(state: StudySessionState): Card | null {
  return state.queue.length > 0 ? state.queue[0] : null;
}

function withSrs(card: Card, srs: SrsState): Card {
  switch (card.type) {
    case 'vocab':
      return { ...card, srs };
    case 'verb':
      return { ...card, srs };
    case 'phrase':
      return { ...card, srs };
  }
}

export function answerCurrent(
  state: StudySessionState,
  result: ReviewResult,
  now: Date,
): StudySessionState {
  const card = currentCard(state);
  if (card === null) {
    return state;
  }
  const next = reviewCard(card.srs, result, now);
  const entry: SessionEntry = { cardId: card.id, result, previous: card.srs, next, card };
  const rest = state.queue.slice(1);
  let queue: Card[];
  if (result === 'got_it') {
    queue = rest;
  } else {
    const insertAt = Math.min(NOT_YET_REINSERT_OFFSET, rest.length);
    queue = [...rest.slice(0, insertAt), withSrs(card, next), ...rest.slice(insertAt)];
  }
  return { queue, history: [...state.history, entry], totalPlanned: state.totalPlanned };
}

export function undoLast(state: StudySessionState): StudySessionState {
  const entry = state.history[state.history.length - 1];
  if (entry === undefined) {
    return state;
  }
  const withoutAnswered = state.queue.filter((card) => card.id !== entry.cardId);
  return {
    queue: [entry.card, ...withoutAnswered],
    history: state.history.slice(0, -1),
    totalPlanned: state.totalPlanned,
  };
}

export function isComplete(state: StudySessionState): boolean {
  return state.queue.length === 0;
}

export function sessionProgress(state: StudySessionState): { done: number; total: number } {
  return { done: state.totalPlanned - state.queue.length, total: state.totalPlanned };
}

export function sessionSummary(state: StudySessionState): { gotIt: number; notYet: number } {
  const answered = new Set<string>();
  const missed = new Set<string>();
  for (const entry of state.history) {
    answered.add(entry.cardId);
    if (entry.result === 'not_yet') {
      missed.add(entry.cardId);
    }
  }
  return { gotIt: answered.size - missed.size, notYet: missed.size };
}
