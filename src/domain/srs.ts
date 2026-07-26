export interface SrsState {
  box: number;
  dueAt: Date;
  correctCount: number;
  incorrectCount: number;
  lastReviewedAt: Date | null;
}

export type ReviewResult = 'got_it' | 'not_yet';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Leitner intervals: the gap before a card in box N is due again.
 * Box 0 is due immediately, so new and missed words surface most often.
 */
export const LEITNER_INTERVALS_MS: readonly number[] = [
  0,
  10 * MINUTE_MS,
  DAY_MS,
  3 * DAY_MS,
  7 * DAY_MS,
  14 * DAY_MS,
  30 * DAY_MS,
];

export const MAX_BOX = LEITNER_INTERVALS_MS.length - 1;

export function newSrsState(now: Date): SrsState {
  return {
    box: 0,
    dueAt: now,
    correctCount: 0,
    incorrectCount: 0,
    lastReviewedAt: null,
  };
}

/** A card that has never been answered. */
export function isNew(state: SrsState): boolean {
  return state.lastReviewedAt === null;
}

export function isDue(state: SrsState, now: Date): boolean {
  return state.dueAt.getTime() <= now.getTime();
}

/**
 * How much the level owes to the Leitner box; the rest comes from the answer
 * record, so two words in the same box separate by how cleanly they got there.
 */
const BOX_SHARE = 0.75;

/**
 * How well a word is known, 0 (never answered, or just missed) to 1 (top box
 * with a clean record). Quiz selection reads this so the shakiest words come
 * up most, and every answer moves it because answers move the box.
 */
export function learnedness(state: SrsState): number {
  if (isNew(state)) {
    return 0;
  }
  const attempts = state.correctCount + state.incorrectCount;
  const accuracy = attempts === 0 ? 0 : state.correctCount / attempts;
  return BOX_SHARE * (state.box / MAX_BOX) + (1 - BOX_SHARE) * accuracy;
}

export function reviewCard(state: SrsState, result: ReviewResult, now: Date): SrsState {
  if (result === 'got_it') {
    const box = Math.min(state.box + 1, MAX_BOX);
    const interval = LEITNER_INTERVALS_MS[box] ?? 0;
    return {
      box,
      dueAt: new Date(now.getTime() + interval),
      correctCount: state.correctCount + 1,
      incorrectCount: state.incorrectCount,
      lastReviewedAt: now,
    };
  }
  return {
    box: 0,
    dueAt: new Date(now.getTime()),
    correctCount: state.correctCount,
    incorrectCount: state.incorrectCount + 1,
    lastReviewedAt: now,
  };
}
