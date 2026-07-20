import { z } from 'zod';

import type { Card } from '@/domain/cards';
import { buildQuiz, mulberry32, type QuizKind } from '@/domain/quiz';

export const QUIZ_COUNT_OPTIONS: readonly number[] = [5, 10, 20];
export const DEFAULT_QUIZ_COUNT = 10;
export const MIN_QUIZ_QUESTIONS = 2;

export interface QuizKindOption {
  kind: QuizKind;
  label: string;
  verbOnly: boolean;
}

export const QUIZ_KIND_OPTIONS: readonly QuizKindOption[] = [
  { kind: 'present', label: 'Present المضارع', verbOnly: true },
  { kind: 'imperative', label: 'Command الأمر', verbOnly: true },
  { kind: 'masdar', label: 'Verbal noun المصدر', verbOnly: true },
  { kind: 'meaning', label: 'Meaning', verbOnly: false },
  { kind: 'plural', label: 'Plural الجمع', verbOnly: false },
];

const KIND_ORDER: readonly QuizKind[] = QUIZ_KIND_OPTIONS.map((option) => option.kind);

const VERB_ONLY_KINDS: ReadonlySet<QuizKind> = new Set(
  QUIZ_KIND_OPTIONS.filter((option) => option.verbOnly).map((option) => option.kind),
);

/**
 * The starting question-type selection for a card mix: verb practice when verbs
 * exist, otherwise the richest type the cards support. Keeps nouns-only and
 * phrases-only collections quizzable without hunting through toggles.
 */
export function defaultQuizKinds(cards: readonly Card[]): QuizKind[] {
  if (cards.some((card) => card.type === 'verb')) {
    return ['present'];
  }
  const hasPlural = cards.some(
    (card) =>
      card.type === 'vocab' && (card.fields.plural1 !== null || card.fields.plural2 !== null),
  );
  if (hasPlural) {
    return ['plural', 'meaning'];
  }
  return ['meaning'];
}

/** Toggles a kind while keeping the canonical option order. */
export function toggleQuizKind(kinds: readonly QuizKind[], kind: QuizKind): QuizKind[] {
  const next = kinds.includes(kind) ? kinds.filter((item) => item !== kind) : [...kinds, kind];
  return KIND_ORDER.filter((item) => next.includes(item));
}

/** Fixed seed so the availability count stays stable across renders. */
const ELIGIBLE_COUNT_SEED = 1;

/** Dry-runs buildQuiz uncapped; it yields at most one question per card. */
export function countEligibleQuestions(cards: readonly Card[], kinds: readonly QuizKind[]): number {
  if (cards.length === 0 || kinds.length === 0) {
    return 0;
  }
  return buildQuiz([...cards], {
    count: cards.length,
    kinds: [...kinds],
    rng: mulberry32(ELIGIBLE_COUNT_SEED),
  }).length;
}

/** Why Start is disabled, or null when the quiz can begin. */
export function startBlockedReason(
  eligible: number,
  kinds: readonly QuizKind[],
  totalCards: number,
): string | null {
  if (kinds.length === 0) {
    return 'Turn on at least one question type to start.';
  }
  if (totalCards === 0) {
    return 'No cards in these lessons yet. Scan a workbook page on the Scan tab first.';
  }
  if (eligible < MIN_QUIZ_QUESTIONS) {
    if (kinds.every((kind) => VERB_ONLY_KINDS.has(kind))) {
      return 'These question types need verb cards. Turn on Meaning or Plural, or scan verb pages first.';
    }
    return 'Not enough cards to quiz yet. Scan a few more pages first.';
  }
  return null;
}

export interface QuizConfig {
  count: number;
  kinds: QuizKind[];
}

export function serializeQuizParams(config: QuizConfig): { count: string; kinds: string } {
  return { count: String(config.count), kinds: config.kinds.join(',') };
}

function isQuizKind(value: string): value is QuizKind {
  return (KIND_ORDER as readonly string[]).includes(value);
}

const routeParamValueSchema = z.union([z.string(), z.array(z.string())]).optional();

const quizRouteParamsSchema = z.object({
  count: routeParamValueSchema,
  kinds: routeParamValueSchema,
});

function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    return typeof first === 'string' ? first : null;
  }
  return null;
}

/** Route params arrive as strings; returns null when they do not describe a valid quiz. */
export function parseQuizParams(raw: unknown): QuizConfig | null {
  const parsed = quizRouteParamsSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const countRaw = firstValue(parsed.data.count);
  const kindsRaw = firstValue(parsed.data.kinds);
  if (countRaw === null || kindsRaw === null) {
    return null;
  }
  const count = Number(countRaw);
  if (!Number.isInteger(count) || count < 1) {
    return null;
  }
  const kinds: QuizKind[] = [];
  for (const part of kindsRaw.split(',')) {
    if (part.length === 0) {
      continue;
    }
    if (!isQuizKind(part)) {
      return null;
    }
    if (!kinds.includes(part)) {
      kinds.push(part);
    }
  }
  if (kinds.length === 0) {
    return null;
  }
  return { count, kinds };
}

/** Human summary of the study filter, e.g. "Lesson 9, Lesson 10" or "All lessons". */
export function describeLessonSelection(
  selection: readonly string[],
  lessons: readonly { id: string; name: string }[] | undefined,
  noLessonId: string,
): string {
  if (selection.length === 0) {
    return 'All lessons';
  }
  const fallback =
    selection.length === 1 ? '1 lesson selected' : `${selection.length} lessons selected`;
  if (lessons === undefined) {
    return fallback;
  }
  const names: string[] = [];
  for (const id of selection) {
    if (id === noLessonId) {
      names.push('No lesson');
      continue;
    }
    const lesson = lessons.find((candidate) => candidate.id === id);
    if (lesson !== undefined) {
      names.push(lesson.name);
    }
  }
  if (names.length === 0) {
    return fallback;
  }
  return names.join(', ');
}
