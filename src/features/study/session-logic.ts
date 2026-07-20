import type { Card } from '@/domain/cards';
import { mulberry32 } from '@/domain/quiz';
import { createSession, type StudySessionState } from '@/domain/session';
import { isDue } from '@/domain/srs';

/** 'due' studies what the SRS says is ready; 'all' ignores schedules ("Study anyway"). */
export type StudyMode = 'due' | 'all';

/** Route params arrive untyped (string or string[]); anything except an explicit 'all' means 'due'. */
export function parseStudyMode(raw: unknown): StudyMode {
  if (raw === 'all') {
    return 'all';
  }
  if (Array.isArray(raw) && raw.length > 0 && raw[raw.length - 1] === 'all') {
    return 'all';
  }
  return 'due';
}

/** Fisher-Yates with an injected rng so sessions are reproducible in tests. */
export function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = result[i];
    result[i] = result[j];
    result[j] = swap;
  }
  return result;
}

export interface BuildStudySessionOptions {
  mode: StudyMode;
  newLimit: number;
  seed: number;
}

export function buildStudySession(
  cards: readonly Card[],
  now: Date,
  options: BuildStudySessionOptions,
): StudySessionState {
  const eligible =
    options.mode === 'all' ? [...cards] : cards.filter((card) => isDue(card.srs, now));
  const rng = mulberry32(options.seed);
  const shuffle = <T>(items: T[]): T[] => shuffleWithRng(items, rng);
  return createSession(eligible, now, { newLimit: options.newLimit, shuffle });
}
