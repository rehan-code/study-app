import { describe, expect, it } from 'vitest';

import type { QuizQuestion } from '@/domain/quiz';

import { scoreQuiz, scoreTier } from '@/features/quiz/quiz-results';

function question(id: string, correctIndex: number): QuizQuestion {
  return {
    cardId: id,
    kind: 'present',
    promptArabic: 'اِتَّصَلَ',
    promptMeaning: 'To call',
    instruction: 'Pick the present tense (المضارع)',
    choices: ['يَتَّصِلُ', 'يَنْظُرُ', 'يَبْحَثُ'],
    correctIndex,
  };
}

describe('scoreQuiz', () => {
  it('counts all correct answers', () => {
    const questions = [question('a', 0), question('b', 2)];
    expect(scoreQuiz(questions, [0, 2])).toEqual({ correct: 2, total: 2 });
  });

  it('counts wrong answers against the total', () => {
    const questions = [question('a', 0), question('b', 2), question('c', 1)];
    expect(scoreQuiz(questions, [0, 1, 1])).toEqual({ correct: 2, total: 3 });
  });

  it('treats unanswered questions as wrong', () => {
    const questions = [question('a', 0), question('b', 1)];
    expect(scoreQuiz(questions, [0])).toEqual({ correct: 1, total: 2 });
  });

  it('handles an empty quiz', () => {
    expect(scoreQuiz([], [])).toEqual({ correct: 0, total: 0 });
  });
});

describe('scoreTier', () => {
  it('handles a zero-question quiz without dividing by zero', () => {
    expect(scoreTier({ correct: 0, total: 0 }).headline).toBe('No questions');
  });

  it('celebrates a perfect score', () => {
    expect(scoreTier({ correct: 10, total: 10 }).headline).toBe('Perfect!');
  });

  it('praises 80 percent and up', () => {
    expect(scoreTier({ correct: 8, total: 10 }).headline).toBe('Great work!');
    expect(scoreTier({ correct: 9, total: 10 }).headline).toBe('Great work!');
  });

  it('encourages 50 to 79 percent', () => {
    expect(scoreTier({ correct: 5, total: 10 }).headline).toBe('Nice effort!');
    expect(scoreTier({ correct: 7, total: 10 }).headline).toBe('Nice effort!');
  });

  it('stays kind below 50 percent', () => {
    expect(scoreTier({ correct: 0, total: 10 }).headline).toBe('Keep going!');
    expect(scoreTier({ correct: 4, total: 10 }).headline).toBe('Keep going!');
  });
});
