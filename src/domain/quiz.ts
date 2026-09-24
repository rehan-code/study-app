import { cardHeadline, withCardSrs, type Card } from '@/domain/cards';
import { isNew, learnedness, reviewCard, type SrsState } from '@/domain/srs';

export const QUIZ_KINDS = ['present', 'imperative', 'masdar', 'meaning', 'plural'] as const;
export type QuizKind = (typeof QUIZ_KINDS)[number];

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
 * counted as one edit, so shapes like افواف and اوفاف stay close. This is the
 * innermost loop of quiz building, run for every candidate a question weighs,
 * so it keeps only the three rows the recurrence reads and skips Math.min.
 */
function editDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  const width = b.length + 1;
  let twoBack = new Array<number>(width).fill(0);
  let previous = Array.from({ length: width }, (_, j) => j);
  let current = new Array<number>(width).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    const letter = a.charCodeAt(i - 1);
    const letterBefore = i > 1 ? a.charCodeAt(i - 2) : -1;
    for (let j = 1; j < width; j += 1) {
      const other = b.charCodeAt(j - 1);
      let best = previous[j - 1] + (letter === other ? 0 : 1);
      if (previous[j] + 1 < best) {
        best = previous[j] + 1;
      }
      if (current[j - 1] + 1 < best) {
        best = current[j - 1] + 1;
      }
      if (
        j > 1 &&
        letterBefore === other &&
        letter === b.charCodeAt(j - 2) &&
        twoBack[j - 2] + 1 < best
      ) {
        best = twoBack[j - 2] + 1;
      }
      current[j] = best;
    }
    const spare = twoBack;
    twoBack = previous;
    previous = current;
    current = spare;
  }
  return previous[b.length];
}

/** The two forms similarity compares, derived once per text instead of once per pair. */
interface ArabicShape {
  letters: string;
  pattern: string;
}

type ShapeCache = Map<string, ArabicShape>;

function shapeOf(shapes: ShapeCache, text: string): ArabicShape {
  const cached = shapes.get(text);
  if (cached !== undefined) {
    return cached;
  }
  const letters = normalizeArabic(text);
  const shape = { letters, pattern: patternSkeleton(letters) };
  shapes.set(text, shape);
  return shape;
}

/**
 * Lower is more similar. Letter distance separates unrelated words; pattern
 * distance pulls words on the same wazn together so a plural question about
 * بَاب prefers other أَفْعَال plurals over فُعُول ones.
 */
function similarityScore(a: ArabicShape, b: ArabicShape): number {
  return editDistance(a.letters, b.letters) + editDistance(a.pattern, b.pattern);
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

/** English comparison form, so "Side" and "side" count as the same answer. */
function normalizeMeaning(meaning: string): string {
  return meaning.trim().toLowerCase();
}

/** Values that would read as the same option to the user collapse into one. */
function choiceKey(value: string, kind: QuizKind): string {
  return kind === 'meaning' ? normalizeMeaning(value) : value;
}

/** One card's answer for one kind, with the keys the distractor rules compare. */
interface Answer {
  cardId: string;
  value: string;
  choiceKey: string;
  meaningKey: string;
  /**
   * What similarity is measured on: the answer itself, or for meaning
   * questions (whose choices are English) the card's Arabic headline.
   */
  shapeText: string;
}

function answerFor(card: Card, kind: QuizKind): Answer | null {
  const value = correctAnswerFor(card, kind);
  if (value === null) {
    return null;
  }
  return {
    cardId: card.id,
    value,
    choiceKey: choiceKey(value, kind),
    meaningKey: normalizeMeaning(card.meaning),
    shapeText: kind === 'meaning' ? cardHeadline(card) : value,
  };
}

/** Every card's answer per kind, in collection order, worked out once per build. */
function answersByKind(
  cards: readonly Card[],
  kinds: readonly QuizKind[],
): Map<QuizKind, Answer[]> {
  const byKind = new Map<QuizKind, Answer[]>();
  for (const kind of kinds) {
    const answers: Answer[] = [];
    for (const card of cards) {
      const answer = answerFor(card, kind);
      if (answer !== null) {
        answers.push(answer);
      }
    }
    byKind.set(kind, answers);
  }
  return byKind;
}

/**
 * Whether another card's answer may be offered as a wrong option. Words
 * sharing the prompt's English translation are skipped: their answer is just
 * as right as the correct one, whichever form the question asks for.
 */
function isDistractor(candidate: Answer, prompt: Answer): boolean {
  return (
    candidate.cardId !== prompt.cardId &&
    candidate.meaningKey !== prompt.meaningKey &&
    candidate.choiceKey !== prompt.choiceKey
  );
}

/** What the questions of one build share. */
interface QuizContext {
  answers: ReadonlyMap<QuizKind, readonly Answer[]>;
  shapes: ShapeCache;
  kinds: readonly QuizKind[];
  rng: () => number;
}

function quizContext(
  cards: readonly Card[],
  kinds: readonly QuizKind[],
  rng: () => number,
): QuizContext {
  return { answers: answersByKind(cards, kinds), shapes: new Map(), kinds, rng };
}

/**
 * Distractors closest to the correct answer, so options feel plausible. Form
 * kinds compare answer to answer; meaning choices are English, so those rank
 * by how confusable the source words' Arabic headlines are instead.
 */
function rankedDistractors(context: QuizContext, kind: QuizKind, prompt: Answer): string[] {
  const target = shapeOf(context.shapes, prompt.shapeText);
  const bestByKey = new Map<string, { value: string; score: number }>();
  for (const candidate of context.answers.get(kind) ?? []) {
    if (!isDistractor(candidate, prompt)) {
      continue;
    }
    const score = similarityScore(target, shapeOf(context.shapes, candidate.shapeText));
    const existing = bestByKey.get(candidate.choiceKey);
    if (existing === undefined || score < existing.score) {
      bestByKey.set(candidate.choiceKey, { value: candidate.value, score });
    }
  }
  const ranked = shuffleWith([...bestByKey.values()], context.rng)
    .sort((a, b) => a.score - b.score)
    .slice(0, RANKED_POOL)
    .map((entry) => entry.value);
  return shuffleWith(ranked, context.rng).slice(0, PREFERRED_DISTRACTORS);
}

function buildQuestion(context: QuizContext, card: Card): QuizQuestion | null {
  for (const kind of shuffleWith(context.kinds, context.rng)) {
    const prompt = answerFor(card, kind);
    if (prompt === null) {
      continue;
    }
    const distractors = rankedDistractors(context, kind, prompt);
    if (distractors.length === 0) {
      continue;
    }
    const choices = shuffleWith([prompt.value, ...distractors], context.rng);
    return {
      cardId: card.id,
      kind,
      promptArabic: cardHeadline(card),
      promptMeaning: card.meaning,
      instruction: INSTRUCTIONS[kind],
      choices,
      correctIndex: choices.indexOf(prompt.value),
    };
  }
  return null;
}

/**
 * A word that is fully learned still gets this much weight, so a quiz keeps
 * some variety instead of drilling the same shaky handful forever.
 */
const MASTERED_WEIGHT = 0.15;

/**
 * How likely a word is to be picked. Squaring the gap to fully learned makes
 * the drop-off steep: a word sitting in box 0 comes up roughly eight times as
 * often as one at the top box, and one halfway there nearly three times as often.
 */
function selectionWeight(state: SrsState): number {
  const gap = 1 - learnedness(state);
  return MASTERED_WEIGHT + gap * gap;
}

/**
 * Weighted sampling without replacement (Efraimidis-Spirakis): each card gets
 * the key rng^(1/weight), and sorting by that key descending draws heavier
 * cards first while still leaving lighter ones a real chance.
 */
function weightedOrder(cards: readonly Card[], rng: () => number): Card[] {
  return cards
    .map((card) => ({ card, key: Math.pow(rng(), 1 / selectionWeight(card.srs)) }))
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.card);
}

/** Cards the quiz may ask about: the ones already answered at least once. */
export function quizPool(cards: readonly Card[]): Card[] {
  return cards.filter((card) => !isNew(card.srs));
}

/**
 * Questions come from words the user has already studied, weighted so the
 * least learned come up most, and are then asked least-learned first.
 * Distractors still draw on the whole collection, new words included.
 */
export function buildQuiz(
  cards: Card[],
  options: { count: number; kinds: QuizKind[]; rng: () => number },
): QuizQuestion[] {
  const { count, kinds, rng } = options;
  if (count <= 0 || kinds.length === 0) {
    return [];
  }
  const context = quizContext(cards, kinds, rng);
  const picked: { question: QuizQuestion; learned: number }[] = [];
  for (const card of weightedOrder(quizPool(cards), rng)) {
    if (picked.length >= count) {
      break;
    }
    const question = buildQuestion(context, card);
    if (question !== null) {
      picked.push({ question, learned: learnedness(card.srs) });
    }
  }
  // Stable, so equally learned words keep the order they were drawn in.
  return picked.sort((a, b) => a.learned - b.learned).map((entry) => entry.question);
}

/**
 * How many questions an uncapped buildQuiz would yield, found without ranking
 * any distractors: a studied card counts once some kind has an answer for it
 * and another card offers a different option. Ranking is the slow part of a
 * build, and a count does not need it.
 */
export function countQuizQuestions(cards: readonly Card[], kinds: readonly QuizKind[]): number {
  if (kinds.length === 0) {
    return 0;
  }
  const answers = answersByKind(cards, kinds);
  return quizPool(cards).filter((card) =>
    kinds.some((kind) => {
      const prompt = answerFor(card, kind);
      return (
        prompt !== null &&
        (answers.get(kind) ?? []).some((candidate) => isDistractor(candidate, prompt))
      );
    }),
  ).length;
}

/**
 * One lap of an endless quiz: every studied card once, drawn by weight and
 * then least learned first, the order an uncapped buildQuiz asks them in.
 */
function lapOrder(cards: readonly Card[], rng: () => number): string[] {
  return weightedOrder(quizPool(cards), rng)
    .map((card) => ({ id: card.id, learned: learnedness(card.srs) }))
    .sort((a, b) => a.learned - b.learned)
    .map((entry) => entry.id);
}

/**
 * The next question of an endless quiz, built only when it is needed, since
 * building a whole lap up front ranks distractors for every studied card.
 * `lap` holds the card ids still to ask; once it runs dry a fresh lap is drawn
 * from `cards`, so levels changed along the way set the next lap's order.
 * Null only when no studied card can be asked about at all.
 */
export function nextEndlessQuestion(
  cards: readonly Card[],
  lap: readonly string[],
  kinds: readonly QuizKind[],
  rng: () => number,
): { question: QuizQuestion; lap: string[] } | null {
  if (kinds.length === 0) {
    return null;
  }
  const byId = new Map(cards.map((card) => [card.id, card]));
  const context = quizContext(cards, kinds, rng);
  const askFrom = (ids: readonly string[]) => {
    for (let index = 0; index < ids.length; index += 1) {
      const card = byId.get(ids[index]);
      const question = card === undefined ? null : buildQuestion(context, card);
      if (question !== null) {
        return { question, lap: ids.slice(index + 1) };
      }
    }
    return null;
  };
  return askFrom(lap) ?? askFrom(lapOrder(cards, rng));
}

/**
 * A quiz answer counts exactly like a flashcard answer: right moves the word up
 * a box, wrong sends it back to the start. Returns the card's new progress plus
 * the collection carrying it, or null when the card is not in the collection.
 */
export function answerQuizQuestion(
  cards: readonly Card[],
  cardId: string,
  correct: boolean,
  now: Date,
): { cards: Card[]; srs: SrsState } | null {
  const card = cards.find((candidate) => candidate.id === cardId);
  if (card === undefined) {
    return null;
  }
  const srs = reviewCard(card.srs, correct ? 'got_it' : 'not_yet', now);
  return {
    cards: cards.map((candidate) =>
      candidate.id === cardId ? withCardSrs(candidate, srs) : candidate,
    ),
    srs,
  };
}
