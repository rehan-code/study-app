import { cardHeadline, type Card } from '@/domain/cards';

export type QuizKind = 'present' | 'imperative' | 'masdar' | 'meaning' | 'plural';

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
  plural: 'Pick the plural (الجمع)',
};

const PREFERRED_DISTRACTORS = 3;

/**
 * Distractors are drawn from the most similar candidates rather than the whole
 * pool. Keeping a couple extra lets the rng vary the picks between quizzes
 * without letting obviously unrelated answers in.
 */
const RANKED_POOL = PREFERRED_DISTRACTORS + 2;

/** Tatweel, harakat, tanween, shadda, sukun, and superscript alif. */
const ARABIC_MARKS = /[\u0640\u064B-\u0652\u0670]/g;

/** Comparison form: marks stripped and hamza seats unified so patterns align. */
function normalizeArabic(text: string): string {
  return text
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ|ى/g, 'ي');
}

/**
 * Long vowels and endings kept, every other letter masked with ف, so words
 * sharing a morphological template (wazn) collapse to the same shape, e.g.
 * both أبواب and أقلام are near افعال.
 */
function patternSkeleton(normalized: string): string {
  return normalized.replace(/[^اويةء ]/g, 'ف');
}

/**
 * Optimal string alignment distance: Levenshtein plus adjacent transpositions
 * counted as one edit, so shapes like افواف and اوفاف stay close.
 */
function editDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      let best = Math.min(
        rows[i - 1][j] + 1,
        current[j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2][j - 2] + 1);
      }
      current.push(best);
    }
    rows.push(current);
  }
  return rows[a.length][b.length];
}

/**
 * Lower is more similar. Letter distance separates unrelated words; pattern
 * distance pulls words on the same wazn together so a plural question about
 * بَاب prefers other أَفْعَال plurals over فُعُول ones.
 */
function similarityScore(a: string, b: string): number {
  const normalA = normalizeArabic(a);
  const normalB = normalizeArabic(b);
  return (
    editDistance(normalA, normalB) +
    editDistance(patternSkeleton(normalA), patternSkeleton(normalB))
  );
}

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
  if (kind === 'plural') {
    if (card.type !== 'vocab') {
      return null;
    }
    return card.fields.plural1 ?? card.fields.plural2;
  }
  if (card.type !== 'verb') {
    return null;
  }
  return card.fields[VERB_FIELD_BY_KIND[kind]];
}

/**
 * Distractors closest to the correct answer, so options feel plausible. Form
 * kinds compare answer to answer; meaning choices are English, so those rank
 * by how confusable the source words' Arabic headlines are instead.
 */
function rankedDistractors(
  cards: readonly Card[],
  card: Card,
  kind: QuizKind,
  correct: string,
  rng: () => number,
): string[] {
  const target = kind === 'meaning' ? cardHeadline(card) : correct;
  const bestScoreByValue = new Map<string, number>();
  for (const other of cards) {
    if (other.id === card.id) {
      continue;
    }
    const value = correctAnswerFor(other, kind);
    if (value === null || value === correct) {
      continue;
    }
    const score = similarityScore(target, kind === 'meaning' ? cardHeadline(other) : value);
    const existing = bestScoreByValue.get(value);
    if (existing === undefined || score < existing) {
      bestScoreByValue.set(value, score);
    }
  }
  const ranked = shuffleWith([...bestScoreByValue.entries()], rng)
    .sort((a, b) => a[1] - b[1])
    .slice(0, RANKED_POOL)
    .map(([value]) => value);
  return shuffleWith(ranked, rng).slice(0, PREFERRED_DISTRACTORS);
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
    const distractors = rankedDistractors(cards, card, kind, correct, rng);
    if (distractors.length === 0) {
      continue;
    }
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
