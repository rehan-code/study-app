import type { QuizQuestion } from '@/domain/quiz';

export interface QuizScore {
  correct: number;
  total: number;
}

/** Unanswered questions count as wrong so a partial answers array never inflates the score. */
export function scoreQuiz(
  questions: readonly QuizQuestion[],
  answers: readonly number[],
): QuizScore {
  let correct = 0;
  for (let index = 0; index < questions.length; index += 1) {
    if (answers[index] === questions[index].correctIndex) {
      correct += 1;
    }
  }
  return { correct, total: questions.length };
}

export interface ScoreTier {
  headline: string;
  message: string;
}

export function scoreTier(score: QuizScore): ScoreTier {
  if (score.total === 0) {
    return { headline: 'No questions', message: 'There was nothing to score this time.' };
  }
  const fraction = score.correct / score.total;
  if (fraction === 1) {
    return { headline: 'Perfect!', message: 'Every single answer right. Keep it up!' };
  }
  if (fraction >= 0.8) {
    return { headline: 'Great work!', message: 'Almost all of them. So close to perfect.' };
  }
  if (fraction >= 0.5) {
    return { headline: 'Nice effort!', message: 'A solid round. The tricky ones will stick soon.' };
  }
  return {
    headline: 'Keep going!',
    message: 'These words need a little more time. A study session will help them stick.',
  };
}
