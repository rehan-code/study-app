import type { Card } from '@/domain/cards';
import { isDue, isNew } from '@/domain/srs';

export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening';

export function greetingForHour(hour: number): Greeting {
  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  }
  if (hour >= 12 && hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

export interface StudyStats {
  /** Previously studied cards whose review is due now. */
  dueReviews: number;
  /** Cards never answered. */
  newCards: number;
  total: number;
  /** Everything a due-mode session could contain right now (due reviews plus due new cards). */
  readyNow: number;
}

export function computeStudyStats(cards: readonly Card[], now: Date): StudyStats {
  let dueReviews = 0;
  let newCards = 0;
  let readyNow = 0;
  for (const card of cards) {
    const cardIsDue = isDue(card.srs, now);
    if (cardIsDue) {
      readyNow += 1;
    }
    if (isNew(card.srs)) {
      newCards += 1;
    } else if (cardIsDue) {
      dueReviews += 1;
    }
  }
  return { dueReviews, newCards, total: cards.length, readyNow };
}

export function hasLessonlessCards(cards: readonly Card[]): boolean {
  return cards.some((card) => card.lessonId === null);
}
