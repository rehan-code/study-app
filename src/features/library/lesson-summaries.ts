import type { Card } from '@/domain/cards';
import type { Lesson } from '@/domain/lessons';
import { isDue } from '@/domain/srs';
import { NO_LESSON_ID } from '@/lib/queries';

export const NO_LESSON_NAME = 'No lesson';

export interface LessonSummary {
  /** A real lesson id, or NO_LESSON_ID for the virtual "No lesson" group. */
  lessonId: string;
  name: string;
  total: number;
  due: number;
}

/**
 * One summary per lesson in the given order (lessons without cards included),
 * plus a trailing "No lesson" group only when lesson-less cards exist.
 */
export function buildLessonSummaries(
  lessons: readonly Lesson[],
  cards: readonly Card[],
  now: Date,
): LessonSummary[] {
  const counts = new Map<string, { total: number; due: number }>();
  for (const card of cards) {
    const key = card.lessonId ?? NO_LESSON_ID;
    const entry = counts.get(key) ?? { total: 0, due: 0 };
    entry.total += 1;
    if (isDue(card.srs, now)) {
      entry.due += 1;
    }
    counts.set(key, entry);
  }

  const summaries: LessonSummary[] = lessons.map((lesson) => ({
    lessonId: lesson.id,
    name: lesson.name,
    total: counts.get(lesson.id)?.total ?? 0,
    due: counts.get(lesson.id)?.due ?? 0,
  }));

  const noLesson = counts.get(NO_LESSON_ID);
  if (noLesson !== undefined) {
    summaries.push({
      lessonId: NO_LESSON_ID,
      name: NO_LESSON_NAME,
      total: noLesson.total,
      due: noLesson.due,
    });
  }
  return summaries;
}

export function cardCountLabel(total: number): string {
  return total === 1 ? '1 card' : `${total} cards`;
}
