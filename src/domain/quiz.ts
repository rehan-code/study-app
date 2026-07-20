import { cardHeadline, type Card } from '@/domain/cards';

export type QuizKind = 'present' | 'imperative' | 'masdar' | 'meaning';

export interface QuizQuestion {
  cardId: string;
  kind: QuizKind;
  promptArabic: string;
  promptMeaning: string;
  instruction: string;
  choices: string[];
  correctIndex: number;
}

const VERB_FIELD_BY_KIND = {
  present: 'present',
  imperative: 'imperative',
  masdar: 'masdar',
} as const;

const INSTRUCTIONS: Record<QuizKind, string> = {
  present: 'Pick the present tense (المضارع)',
  imperative: 'Pick the command form (الأمر)',
  masdar: 'Pick the verbal noun (المصدر)',
  meaning: 'Pick the meaning',
};

const PREFERRED_DISTRACTORS = 3;

/** Small deterministic PRNG; the standard mulberry32 mixing constants. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = result[i];
    result[i] = result[j];
    result[j] = swap;
  }
  return result;
}

/** What this card's correct answer would be for the kind, or null when ineligible. */
function correctAnswerFor(card: Card, kind: QuizKind): string | null {
  if (kind === 'meaning') {
    const meaning = card.meaning.trim();
    return meaning.length > 0 ? meaning : null;
  }
  if (card.type !== 'verb') {
    return null;
  }
  return card.fields[VERB_FIELD_BY_KIND[kind]];
}

function distractorPool(
  cards: readonly Card[],
  card: Card,
  kind: QuizKind,
  correct: string,
): string[] {
  const pool = new Set<string>();
  for (const other of cards) {
    if (other.id === card.id) {
      continue;
    }
    const value = correctAnswerFor(other, kind);
    if (value !== null && value !== correct) {
      pool.add(value);
    }
  }
  return [...pool];
}

function buildQuestion(
  cards: readonly Card[],
  card: Card,
  kinds: readonly QuizKind[],
  rng: () => number,
): QuizQuestion | null {
  for (const kind of shuffleWith(kinds, rng)) {
    const correct = correctAnswerFor(card, kind);
    if (correct === null) {
      continue;
    }
    const pool = distractorPool(cards, card, kind, correct);
    if (pool.length === 0) {
      continue;
    }
    const distractors = shuffleWith(pool, rng).slice(0, PREFERRED_DISTRACTORS);
    const choices = shuffleWith([correct, ...distractors], rng);
    return {
      cardId: card.id,
      kind,
      promptArabic: cardHeadline(card),
      promptMeaning: card.meaning,
      instruction: INSTRUCTIONS[kind],
      choices,
      correctIndex: choices.indexOf(correct),
    };
  }
  return null;
}

export function buildQuiz(
  cards: Card[],
  options: { count: number; kinds: QuizKind[]; rng: () => number },
): QuizQuestion[] {
  const { count, kinds, rng } = options;
  if (count <= 0 || kinds.length === 0) {
    return [];
  }
  const questions: QuizQuestion[] = [];
  for (const card of shuffleWith(cards, rng)) {
    if (questions.length >= count) {
      break;
    }
    const question = buildQuestion(cards, card, kinds, rng);
    if (question !== null) {
      questions.push(question);
    }
  }
  return questions;
}
