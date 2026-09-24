import { describe, expect, it } from 'vitest';

import { cardHeadline, withCardSrs, type Card } from '@/domain/cards';
import {
  answerQuizQuestion,
  buildQuiz,
  choicesAreArabic,
  countQuizQuestions,
  mulberry32,
  nextEndlessQuestion,
  promptIsArabic,
  quizPool,
  QUIZ_KINDS,
  type QuizKind,
  type QuizQuestion,
} from '@/domain/quiz';
import { MAX_BOX, newSrsState, type SrsState } from '@/domain/srs';

const NOW = new Date('2026-07-06T10:00:00.000Z');

/** Quizzes only draw on studied words, so fixtures default to a reviewed card. */
function studiedSrs(box = 3, incorrectCount = 0): SrsState {
  return {
    box,
    dueAt: NOW,
    correctCount: box,
    incorrectCount,
    lastReviewedAt: NOW,
  };
}

interface VerbSpec {
  id: string;
  past: string;
  preposition?: string | null;
  present?: string | null;
  imperative?: string | null;
  masdar?: string | null;
  meaning: string;
  srs?: SrsState;
}

function verbCard(spec: VerbSpec): Card {
  return {
    id: spec.id,
    type: 'verb',
    lessonId: null,
    scanId: null,
    meaning: spec.meaning,
    aiImagePath: null,
    imageEnabled: true,
    srs: spec.srs ?? studiedSrs(),
    createdAt: NOW,
    fields: {
      past: spec.past,
      preposition: spec.preposition ?? null,
      present: spec.present ?? null,
      imperative: spec.imperative ?? null,
      masdar: spec.masdar ?? null,
      activeParticiple: null,
      passiveParticiple: null,
      note: null,
    },
  };
}

function vocabCard(id: string, arabic: string, meaning: string, srs?: SrsState): Card {
  return {
    id,
    type: 'vocab',
    lessonId: null,
    scanId: null,
    meaning,
    aiImagePath: null,
    imageEnabled: true,
    srs: srs ?? studiedSrs(),
    createdAt: NOW,
    fields: {
      arabic,
      plural1: null,
      plural2: null,
      synonym: null,
      synonymPlural: null,
      antonym: null,
      antonymPlural: null,
      note: null,
    },
  };
}

const ittasala = verbCard({
  id: 'v-ittasala',
  past: 'اِتَّصَلَ',
  preposition: 'بـ',
  present: 'يَتَّصِلُ',
  imperative: 'اِتَّصِلْ',
  masdar: 'اِتِّصَال',
  meaning: 'To call',
});
const nazara = verbCard({
  id: 'v-nazara',
  past: 'نَظَرَ',
  preposition: 'إِلَى',
  present: 'يَنْظُرُ',
  imperative: 'اُنْظُرْ',
  masdar: 'نَظَر',
  meaning: 'To look at',
});
const bahatha = verbCard({
  id: 'v-bahatha',
  past: 'بَحَثَ',
  preposition: 'عَنْ',
  present: 'يَبْحَثُ',
  imperative: 'اِبْحَثْ',
  masdar: 'بَحْث',
  meaning: 'To search for',
});
const raghiba = verbCard({
  id: 'v-raghiba',
  past: 'رَغِبَ',
  preposition: 'فِي',
  present: 'يَرْغَبُ',
  imperative: 'اِرْغَبْ',
  masdar: 'رَغْبَة',
  meaning: 'To desire',
});
const tuwuffiya = verbCard({
  id: 'v-tuwuffiya',
  past: 'تُوُفِّيَ',
  present: 'يُتَوَفَّى',
  meaning: 'To pass away',
});
const ihtaja = verbCard({
  id: 'v-ihtaja',
  past: 'اِحْتَاجَ',
  preposition: 'إِلَى',
  present: 'يَحْتَاجُ',
  masdar: 'اِحْتِيَاج/حَاجَة',
  meaning: 'To need',
});

const fullVerbs = [ittasala, nazara, bahatha, raghiba];
const usbu = vocabCard('n-usbu', 'أُسْبُوعٌ', 'Week');
const yameen = vocabCard('n-yameen', 'يَمِينٌ', 'Right side');

function findCard(cards: Card[], question: QuizQuestion): Card {
  const card = cards.find((candidate) => candidate.id === question.cardId);
  if (card === undefined) {
    throw new Error(`question references unknown card ${question.cardId}`);
  }
  return card;
}

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('buildQuiz verb-form questions', () => {
  it('builds well-formed present-tense questions from verb cards', () => {
    const questions = buildQuiz(fullVerbs, {
      count: 4,
      kinds: ['present'],
      rng: mulberry32(1),
    });
    expect(questions).toHaveLength(4);
    for (const question of questions) {
      const card = findCard(fullVerbs, question);
      if (card.type !== 'verb') {
        throw new Error('expected a verb card');
      }
      expect(question.kind).toBe('present');
      expect(question.instruction).toBe('Pick the present tense (المضارع)');
      expect(question.promptArabic).toBe(cardHeadline(card));
      expect(question.promptMeaning).toBe(card.meaning);
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices).size).toBe(question.choices.length);
      expect(question.choices[question.correctIndex]).toBe(card.fields.present);
      const presents = new Set(
        fullVerbs.map((verb) => (verb.type === 'verb' ? verb.fields.present : null)),
      );
      for (const choice of question.choices) {
        expect(presents.has(choice)).toBe(true);
      }
    }
  });

  it('shows the preposition in the prompt', () => {
    const questions = buildQuiz([ittasala, nazara], {
      count: 2,
      kinds: ['present'],
      rng: mulberry32(3),
    });
    const prompts = questions.map((question) => question.promptArabic).sort();
    expect(prompts).toEqual(['اِتَّصَلَ بـ', 'نَظَرَ إِلَى'].sort());
  });

  it('ignores non-verb cards for verb-form kinds', () => {
    const questions = buildQuiz([usbu, yameen, ...fullVerbs], {
      count: 10,
      kinds: ['imperative'],
      rng: mulberry32(5),
    });
    expect(questions).toHaveLength(4);
    for (const question of questions) {
      expect(question.cardId.startsWith('v-')).toBe(true);
    }
  });

  it('skips verbs whose target field is null', () => {
    const questions = buildQuiz([tuwuffiya, ...fullVerbs], {
      count: 10,
      kinds: ['imperative'],
      rng: mulberry32(5),
    });
    expect(questions).toHaveLength(4);
    expect(questions.some((question) => question.cardId === 'v-tuwuffiya')).toBe(false);
  });

  it('allows a single distractor when only two verbs qualify', () => {
    const questions = buildQuiz([ittasala, nazara], {
      count: 2,
      kinds: ['present'],
      rng: mulberry32(11),
    });
    expect(questions).toHaveLength(2);
    for (const question of questions) {
      expect(question.choices).toHaveLength(2);
      expect(new Set(question.choices).size).toBe(2);
    }
  });

  it('skips a card entirely when no distractor exists', () => {
    // The only other verb has no masdar, so nazara cannot get even one distractor.
    const questions = buildQuiz([nazara, tuwuffiya], {
      count: 5,
      kinds: ['masdar'],
      rng: mulberry32(2),
    });
    expect(questions).toEqual([]);
  });

  it('deduplicates identical distractor values', () => {
    const dhahaba = verbCard({
      id: 'v-dhahaba',
      past: 'ذَهَبَ',
      present: 'يَذْهَبُ',
      meaning: 'To go',
    });
    const raha = verbCard({ id: 'v-raha', past: 'رَاحَ', present: 'يَذْهَبُ', meaning: 'To go' });
    const questions = buildQuiz([ittasala, dhahaba, raha], {
      count: 3,
      kinds: ['present'],
      rng: mulberry32(9),
    });
    const forIttasala = questions.find((question) => question.cardId === 'v-ittasala');
    expect(forIttasala).toBeDefined();
    // The two identical distractors collapse into one choice.
    expect(forIttasala?.choices.sort()).toEqual(['يَتَّصِلُ', 'يَذْهَبُ'].sort());
    for (const question of questions) {
      expect(new Set(question.choices).size).toBe(question.choices.length);
    }
  });

  it('never offers the form of a word that shares the prompt meaning', () => {
    const dhahaba = verbCard({
      id: 'v-dhahaba',
      past: 'ذَهَبَ',
      present: 'يَذْهَبُ',
      meaning: 'To go',
    });
    const raha = verbCard({ id: 'v-raha', past: 'رَاحَ', present: 'يَرُوحُ', meaning: 'to go' });
    for (const seed of [1, 2, 3, 17, 99]) {
      const questions = buildQuiz([dhahaba, raha, ittasala, nazara, bahatha], {
        count: 5,
        kinds: ['present'],
        rng: mulberry32(seed),
      });
      const forDhahaba = questions.find((question) => question.cardId === 'v-dhahaba');
      expect(forDhahaba?.choices).not.toContain('يَرُوحُ');
      const forRaha = questions.find((question) => question.cardId === 'v-raha');
      expect(forRaha?.choices).not.toContain('يَذْهَبُ');
    }
  });
});

describe('buildQuiz meaning questions', () => {
  it('accepts any card type and uses meanings as choices', () => {
    const cards = [usbu, yameen, ittasala];
    const questions = buildQuiz(cards, { count: 3, kinds: ['meaning'], rng: mulberry32(4) });
    expect(questions).toHaveLength(3);
    for (const question of questions) {
      const card = findCard(cards, question);
      expect(question.kind).toBe('meaning');
      expect(question.instruction).toBe('Pick the meaning');
      expect(question.promptArabic).toBe(cardHeadline(card));
      expect(question.choices[question.correctIndex]).toBe(card.meaning);
      expect(question.choices).toHaveLength(3);
    }
  });

  it('skips cards with a blank meaning and never offers blank distractors', () => {
    const blank = vocabCard('n-blank', 'كَذَلِكَ', '   ');
    const questions = buildQuiz([blank, usbu, yameen], {
      count: 5,
      kinds: ['meaning'],
      rng: mulberry32(6),
    });
    expect(questions).toHaveLength(2);
    for (const question of questions) {
      expect(question.cardId).not.toBe('n-blank');
      for (const choice of question.choices) {
        expect(choice.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('prefers meanings of words that look like the prompt word', () => {
    // Four short words are confusable with بيت; مدرسة and مستشفى are not.
    const bayt = vocabCard('n-bayt2', 'بَيْت', 'House');
    const lookalikes = [
      vocabCard('n-bint', 'بِنْت', 'Girl'),
      vocabCard('n-zayt', 'زَيْت', 'Oil'),
      vocabCard('n-sawt', 'صَوْت', 'Voice'),
      vocabCard('n-waqt', 'وَقْت', 'Time'),
      vocabCard('n-sayyara', 'سَيَّارَة', 'Car'),
    ];
    const unrelated = [
      vocabCard('n-madrasa', 'مَدْرَسَة', 'School'),
      vocabCard('n-mustashfa', 'مُسْتَشْفَى', 'Hospital'),
    ];
    const cards = [bayt, ...lookalikes, ...unrelated];
    for (const seed of [1, 2, 3, 17, 99]) {
      const questions = buildQuiz(cards, { count: 8, kinds: ['meaning'], rng: mulberry32(seed) });
      const forBayt = questions.find((question) => question.cardId === 'n-bayt2');
      expect(forBayt).toBeDefined();
      expect(forBayt?.choices).toContain('House');
      expect(forBayt?.choices).not.toContain('School');
      expect(forBayt?.choices).not.toContain('Hospital');
    }
  });

  it('excludes distractors identical to the correct meaning', () => {
    const left = vocabCard('n-left', 'يَسَارٌ', 'Side');
    const right = vocabCard('n-right', 'يَمِينٌ', 'Side');
    const front = vocabCard('n-front', 'أَمَامَ', 'In front of');
    const questions = buildQuiz([left, right, front], {
      count: 3,
      kinds: ['meaning'],
      rng: mulberry32(8),
    });
    for (const question of questions) {
      const card = findCard([left, right, front], question);
      const duplicates = question.choices.filter((choice) => choice === card.meaning.trim());
      expect(duplicates).toHaveLength(1);
    }
  });

  it('treats meanings that differ only by case as the same answer', () => {
    const left = vocabCard('n-left2', 'يَسَارٌ', 'Side');
    const right = vocabCard('n-right2', 'يَمِينٌ', 'side');
    const front = vocabCard('n-front2', 'أَمَامَ', 'In front of');
    const back = vocabCard('n-back2', 'وَرَاءَ', 'Behind');
    const cards = [left, right, front, back];
    for (const seed of [1, 2, 3, 17, 99]) {
      const questions = buildQuiz(cards, { count: 4, kinds: ['meaning'], rng: mulberry32(seed) });
      const forLeft = questions.find((question) => question.cardId === 'n-left2');
      expect(forLeft?.choices).not.toContain('side');
      const forRight = questions.find((question) => question.cardId === 'n-right2');
      expect(forRight?.choices).not.toContain('Side');
    }
  });
});

describe('buildQuiz arabic-word questions', () => {
  it('prompts with the meaning and offers Arabic words from any card type', () => {
    const cards = [usbu, yameen, ittasala];
    const headlines = new Set(cards.map((card) => cardHeadline(card)));
    const questions = buildQuiz(cards, { count: 3, kinds: ['arabic'], rng: mulberry32(4) });
    expect(questions).toHaveLength(3);
    for (const question of questions) {
      const card = findCard(cards, question);
      expect(question.kind).toBe('arabic');
      expect(question.instruction).toBe('Pick the Arabic word');
      expect(question.promptMeaning).toBe(card.meaning);
      expect(question.promptArabic).toBe(cardHeadline(card));
      expect(question.choices[question.correctIndex]).toBe(cardHeadline(card));
      expect(question.choices).toHaveLength(3);
      expect(new Set(question.choices).size).toBe(question.choices.length);
      for (const choice of question.choices) {
        expect(headlines.has(choice)).toBe(true);
      }
    }
  });

  it('keeps the preposition on verb choices', () => {
    const questions = buildQuiz([ittasala, nazara], {
      count: 2,
      kinds: ['arabic'],
      rng: mulberry32(3),
    });
    expect(questions).toHaveLength(2);
    for (const question of questions) {
      expect([...question.choices].sort()).toEqual(['اِتَّصَلَ بـ', 'نَظَرَ إِلَى'].sort());
    }
  });

  it('skips cards with a blank meaning, since there is nothing to ask', () => {
    const blank = vocabCard('n-blank', 'كَذَلِكَ', '   ');
    const questions = buildQuiz([blank, usbu, yameen], {
      count: 5,
      kinds: ['arabic'],
      rng: mulberry32(6),
    });
    expect(questions).toHaveLength(2);
    expect(questions.some((question) => question.cardId === 'n-blank')).toBe(false);
  });

  it('never offers the Arabic of a word that shares the prompt meaning', () => {
    const left = vocabCard('n-left3', 'يَسَارٌ', 'Side');
    const right = vocabCard('n-right3', 'يَمِينٌ', 'side');
    const front = vocabCard('n-front3', 'أَمَامَ', 'In front of');
    const back = vocabCard('n-back3', 'وَرَاءَ', 'Behind');
    const cards = [left, right, front, back];
    for (const seed of [1, 2, 3, 17, 99]) {
      const questions = buildQuiz(cards, { count: 4, kinds: ['arabic'], rng: mulberry32(seed) });
      const forLeft = questions.find((question) => question.cardId === 'n-left3');
      expect(forLeft?.choices).toContain('يَسَارٌ');
      expect(forLeft?.choices).not.toContain('يَمِينٌ');
      const forRight = questions.find((question) => question.cardId === 'n-right3');
      expect(forRight?.choices).toContain('يَمِينٌ');
      expect(forRight?.choices).not.toContain('يَسَارٌ');
    }
  });

  it('prefers Arabic words that look like the correct one', () => {
    const bayt = vocabCard('n-bayt3', 'بَيْت', 'House');
    const lookalikes = [
      vocabCard('n-bint3', 'بِنْت', 'Girl'),
      vocabCard('n-zayt3', 'زَيْت', 'Oil'),
      vocabCard('n-sawt3', 'صَوْت', 'Voice'),
      vocabCard('n-waqt3', 'وَقْت', 'Time'),
      vocabCard('n-sayyara3', 'سَيَّارَة', 'Car'),
    ];
    const unrelated = [
      vocabCard('n-madrasa3', 'مَدْرَسَة', 'School'),
      vocabCard('n-mustashfa3', 'مُسْتَشْفَى', 'Hospital'),
    ];
    const cards = [bayt, ...lookalikes, ...unrelated];
    for (const seed of [1, 2, 3, 17, 99]) {
      const questions = buildQuiz(cards, { count: 8, kinds: ['arabic'], rng: mulberry32(seed) });
      const forBayt = questions.find((question) => question.cardId === 'n-bayt3');
      expect(forBayt).toBeDefined();
      expect(forBayt?.choices).toContain('بَيْت');
      expect(forBayt?.choices).not.toContain('مَدْرَسَة');
      expect(forBayt?.choices).not.toContain('مُسْتَشْفَى');
    }
  });
});

describe('question languages', () => {
  it('answers in English only for meaning questions', () => {
    for (const kind of QUIZ_KINDS) {
      expect(choicesAreArabic(kind)).toBe(kind !== 'meaning');
    }
  });

  it('prompts in English only for arabic-word questions', () => {
    for (const kind of QUIZ_KINDS) {
      expect(promptIsArabic(kind)).toBe(kind !== 'arabic');
    }
  });
});

describe('buildQuiz plural questions', () => {
  function pluralCard(
    id: string,
    arabic: string,
    meaning: string,
    plural1: string | null,
    plural2: string | null = null,
  ): Card {
    const base = vocabCard(id, arabic, meaning);
    if (base.type !== 'vocab') {
      throw new Error('expected a vocab card');
    }
    return { ...base, fields: { ...base.fields, plural1, plural2 } };
  }

  const bab = pluralCard('n-bab', 'بَاب', 'Door', 'أَبْوَاب');
  const bayt = pluralCard('n-bayt', 'بَيْت', 'House', 'بُيُوت');
  const qalb = pluralCard('n-qalb', 'قَلْب', 'Heart', 'قُلُوب');

  it('builds plural questions from vocab cards', () => {
    const cards = [bab, bayt, qalb];
    const questions = buildQuiz(cards, { count: 3, kinds: ['plural'], rng: mulberry32(4) });
    expect(questions).toHaveLength(3);
    for (const question of questions) {
      const card = findCard(cards, question);
      if (card.type !== 'vocab') {
        throw new Error('expected a vocab card');
      }
      expect(question.kind).toBe('plural');
      expect(question.instruction).toBe('Pick the plural (الجمع)');
      expect(question.choices[question.correctIndex]).toBe(card.fields.plural1);
    }
  });

  it('falls back to the second plural when the first is missing', () => {
    const cards = [pluralCard('n-akh', 'أَخ', 'Brother', null, 'إِخْوَة'), bab, bayt];
    const questions = buildQuiz(cards, { count: 3, kinds: ['plural'], rng: mulberry32(7) });
    const forAkh = questions.find((question) => question.cardId === 'n-akh');
    expect(forAkh?.choices[forAkh.correctIndex]).toBe('إِخْوَة');
  });

  it('skips vocab cards without any plural and all non-vocab cards', () => {
    const questions = buildQuiz([usbu, ittasala, bab, bayt], {
      count: 10,
      kinds: ['plural'],
      rng: mulberry32(9),
    });
    const ids = questions.map((question) => question.cardId).sort();
    expect(ids).toEqual(['n-bab', 'n-bayt']);
  });

  it('prefers distractors on the same pattern as the correct plural', () => {
    // Five plurals share the أفعال pattern with أبواب; three are فعول.
    const sameWazn = [
      pluralCard('n-qalam', 'قَلَم', 'Pen', 'أَقْلَام'),
      pluralCard('n-walad', 'وَلَد', 'Boy', 'أَوْلَاد'),
      pluralCard('n-lawn', 'لَوْن', 'Color', 'أَلْوَان'),
      pluralCard('n-burj', 'بُرْج', 'Tower', 'أَبْرَاج'),
      pluralCard('n-nahr', 'نَهْر', 'River', 'أَنْهَار'),
    ];
    const otherWazn = [bayt, qalb, pluralCard('n-ayn', 'عَيْن', 'Eye', 'عُيُون')];
    const cards = [bab, ...sameWazn, ...otherWazn];
    const rejected = new Set(['بُيُوت', 'قُلُوب', 'عُيُون']);
    for (const seed of [1, 2, 3, 17, 99]) {
      const questions = buildQuiz(cards, { count: 9, kinds: ['plural'], rng: mulberry32(seed) });
      const forBab = questions.find((question) => question.cardId === 'n-bab');
      expect(forBab).toBeDefined();
      expect(forBab?.choices).toHaveLength(4);
      for (const choice of forBab?.choices ?? []) {
        expect(rejected.has(choice)).toBe(false);
      }
    }
  });
});

describe('buildQuiz composition', () => {
  it('never repeats a card within one quiz', () => {
    const cards = [...fullVerbs, ihtaja, usbu, yameen];
    const questions = buildQuiz(cards, {
      count: 20,
      kinds: ['present', 'masdar', 'meaning'],
      rng: mulberry32(10),
    });
    const ids = questions.map((question) => question.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns as many questions as possible when eligible cards run short', () => {
    const questions = buildQuiz(fullVerbs, {
      count: 10,
      kinds: ['present'],
      rng: mulberry32(12),
    });
    expect(questions).toHaveLength(4);
  });

  it('only asks kinds the card is eligible for', () => {
    const cards = [tuwuffiya, ...fullVerbs];
    const questions = buildQuiz(cards, {
      count: 10,
      kinds: ['imperative', 'meaning'],
      rng: mulberry32(13),
    });
    const forTuwuffiya = questions.find((question) => question.cardId === 'v-tuwuffiya');
    expect(forTuwuffiya?.kind).toBe('meaning');
  });

  it('returns an empty quiz for empty inputs', () => {
    const rng = mulberry32(1);
    expect(buildQuiz([], { count: 5, kinds: ['present'], rng })).toEqual([]);
    expect(buildQuiz(fullVerbs, { count: 0, kinds: ['present'], rng })).toEqual([]);
    expect(buildQuiz(fullVerbs, { count: 5, kinds: [], rng })).toEqual([]);
  });

  it('keeps every correctIndex consistent with the choices', () => {
    const cards = [...fullVerbs, ihtaja, usbu, yameen];
    const questions = buildQuiz(cards, {
      count: 20,
      kinds: ['present', 'imperative', 'masdar', 'meaning', 'arabic'],
      rng: mulberry32(21),
    });
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThan(question.choices.length);
      expect(question.choices.length).toBeGreaterThanOrEqual(2);
      expect(question.choices.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('buildQuiz learnedness', () => {
  const shaky = verbCard({
    id: 'v-shaky',
    past: 'رَجَعَ',
    present: 'يَرْجِعُ',
    meaning: 'To return',
    srs: studiedSrs(0, 4),
  });
  const middling = verbCard({
    id: 'v-middling',
    past: 'كَتَبَ',
    present: 'يَكْتُبُ',
    meaning: 'To write',
    srs: studiedSrs(3, 1),
  });
  const mastered = verbCard({
    id: 'v-mastered',
    past: 'قَرَأَ',
    present: 'يَقْرَأُ',
    meaning: 'To read',
    srs: studiedSrs(MAX_BOX),
  });
  const byLearnedness = [shaky, middling, mastered];

  it('leaves never-studied words out of the pool', () => {
    const fresh = verbCard({
      id: 'v-fresh',
      past: 'سَأَلَ',
      present: 'يَسْأَلُ',
      meaning: 'To ask',
      srs: newSrsState(NOW),
    });
    expect(quizPool([fresh, ...byLearnedness]).map((card) => card.id)).toEqual([
      'v-shaky',
      'v-middling',
      'v-mastered',
    ]);
  });

  it('never asks about a word that has not been studied', () => {
    const fresh = verbCard({
      id: 'v-fresh',
      past: 'سَأَلَ',
      present: 'يَسْأَلُ',
      meaning: 'To ask',
      srs: newSrsState(NOW),
    });
    for (const seed of [1, 2, 3, 17, 99]) {
      const questions = buildQuiz([fresh, ...byLearnedness], {
        count: 10,
        kinds: ['present'],
        rng: mulberry32(seed),
      });
      expect(questions).toHaveLength(3);
      expect(questions.some((question) => question.cardId === 'v-fresh')).toBe(false);
    }
  });

  it('still offers never-studied words as distractors', () => {
    const fresh = verbCard({
      id: 'v-fresh',
      past: 'سَأَلَ',
      present: 'يَسْأَلُ',
      meaning: 'To ask',
      srs: newSrsState(NOW),
    });
    const questions = buildQuiz([fresh, ...byLearnedness], {
      count: 10,
      kinds: ['present'],
      rng: mulberry32(4),
    });
    const choices = questions.flatMap((question) => question.choices);
    expect(choices).toContain('يَسْأَلُ');
  });

  it('returns an empty quiz when nothing has been studied yet', () => {
    const fresh = fullVerbs.map((card) => withCardSrs(card, newSrsState(NOW)));
    expect(buildQuiz(fresh, { count: 5, kinds: ['present'], rng: mulberry32(5) })).toEqual([]);
  });

  it('asks the least learned words first', () => {
    for (const seed of [1, 2, 3, 17, 99]) {
      const questions = buildQuiz(byLearnedness, {
        count: 3,
        kinds: ['present'],
        rng: mulberry32(seed),
      });
      expect(questions.map((question) => question.cardId)).toEqual([
        'v-shaky',
        'v-middling',
        'v-mastered',
      ]);
    }
  });

  it('picks the least learned words far more often when the quiz is short', () => {
    const appearances = new Map<string, number>();
    for (let seed = 1; seed <= 200; seed += 1) {
      const questions = buildQuiz(byLearnedness, {
        count: 1,
        kinds: ['present'],
        rng: mulberry32(seed),
      });
      expect(questions).toHaveLength(1);
      const id = questions[0].cardId;
      appearances.set(id, (appearances.get(id) ?? 0) + 1);
    }
    const shakyCount = appearances.get('v-shaky') ?? 0;
    const middlingCount = appearances.get('v-middling') ?? 0;
    const masteredCount = appearances.get('v-mastered') ?? 0;
    expect(shakyCount).toBeGreaterThan(middlingCount);
    expect(middlingCount).toBeGreaterThan(masteredCount);
    // Mastered words stay in the rotation rather than dropping out entirely.
    expect(masteredCount).toBeGreaterThan(0);
  });
});

describe('answerQuizQuestion', () => {
  const cards = [
    verbCard({
      id: 'v-kataba',
      past: 'كَتَبَ',
      present: 'يَكْتُبُ',
      meaning: 'To write',
      srs: studiedSrs(2),
    }),
    usbu,
  ];
  const later = new Date(NOW.getTime() + 60_000);

  it('moves a right answer up a box', () => {
    const outcome = answerQuizQuestion(cards, 'v-kataba', true, later);
    expect(outcome?.srs.box).toBe(3);
    expect(outcome?.srs.correctCount).toBe(3);
    expect(outcome?.srs.lastReviewedAt).toEqual(later);
  });

  it('sends a wrong answer back to the start', () => {
    const outcome = answerQuizQuestion(cards, 'v-kataba', false, later);
    expect(outcome?.srs.box).toBe(0);
    expect(outcome?.srs.incorrectCount).toBe(1);
    expect(outcome?.srs.dueAt).toEqual(later);
  });

  it('returns the collection carrying the new progress and leaves the input alone', () => {
    const outcome = answerQuizQuestion(cards, 'v-kataba', true, later);
    expect(outcome?.cards.find((card) => card.id === 'v-kataba')?.srs.box).toBe(3);
    expect(outcome?.cards.find((card) => card.id === 'n-usbu')).toBe(usbu);
    expect(cards[0].srs.box).toBe(2);
  });

  it('returns null for a card outside the collection', () => {
    expect(answerQuizQuestion(cards, 'v-missing', true, later)).toBeNull();
  });
});

describe('buildQuiz determinism', () => {
  const cards = [...fullVerbs, ihtaja, tuwuffiya, usbu, yameen];
  const kinds: QuizKind[] = ['present', 'masdar', 'meaning'];

  it('produces identical quizzes for the same seed', () => {
    const first = buildQuiz(cards, { count: 6, kinds, rng: mulberry32(1234) });
    const second = buildQuiz(cards, { count: 6, kinds, rng: mulberry32(1234) });
    expect(first).toEqual(second);
  });

  it('produces a different quiz for a different seed', () => {
    const first = buildQuiz(cards, { count: 6, kinds, rng: mulberry32(1) });
    const second = buildQuiz(cards, { count: 6, kinds, rng: mulberry32(99) });
    expect(first).not.toEqual(second);
  });
});

describe('countQuizQuestions', () => {
  const fresh = verbCard({
    id: 'v-fresh',
    past: 'سَأَلَ',
    present: 'يَسْأَلُ',
    meaning: 'To ask',
    srs: newSrsState(NOW),
  });
  const raha = verbCard({ id: 'v-raha', past: 'رَاحَ', present: 'يَرُوحُ', meaning: 'to call' });
  const blank = vocabCard('n-blank', 'كَذَلِكَ', '   ');
  const withPlural = (card: Card, plural1: string): Card =>
    card.type === 'vocab' ? { ...card, fields: { ...card.fields, plural1 } } : card;
  const decks: Card[][] = [
    [],
    [ittasala],
    fullVerbs,
    [...fullVerbs, ihtaja, tuwuffiya, usbu, yameen],
    [fresh, raha, blank, ittasala, nazara, tuwuffiya, usbu],
    [withPlural(usbu, 'أَسَابِيع'), withPlural(yameen, 'أَيْمَان'), ittasala],
  ];

  it('matches the length of an uncapped build for every deck and kind mix', () => {
    for (const cards of decks) {
      for (let mask = 1; mask < 1 << QUIZ_KINDS.length; mask += 1) {
        const kinds = QUIZ_KINDS.filter((_, bit) => (mask & (1 << bit)) !== 0);
        const built = buildQuiz(cards, { count: cards.length, kinds, rng: mulberry32(mask) });
        expect(countQuizQuestions(cards, kinds)).toBe(built.length);
      }
    }
  });

  it('returns 0 with no kinds', () => {
    expect(countQuizQuestions(fullVerbs, [])).toBe(0);
  });
});

describe('nextEndlessQuestion', () => {
  const deck = [...fullVerbs, ihtaja, tuwuffiya, usbu, yameen];
  const kinds: QuizKind[] = ['present', 'meaning'];

  function askInARow(cards: Card[], total: number): string[] {
    const asked: string[] = [];
    let lap: string[] = [];
    for (let turn = 0; turn < total; turn += 1) {
      const step = nextEndlessQuestion(cards, lap, kinds, mulberry32(turn + 1));
      if (step === null) {
        throw new Error('ran out of questions');
      }
      asked.push(step.question.cardId);
      lap = step.lap;
    }
    return asked;
  }

  it('asks every askable card once per lap, then starts another', () => {
    const lapSize = countQuizQuestions(deck, kinds);
    const asked = askInARow(deck, lapSize * 3);
    for (let lap = 0; lap < 3; lap += 1) {
      const ids = asked.slice(lap * lapSize, (lap + 1) * lapSize);
      expect(new Set(ids).size).toBe(lapSize);
    }
  });

  it('continues the lap it is handed', () => {
    const step = nextEndlessQuestion(deck, ['v-nazara', 'v-bahatha'], kinds, mulberry32(1));
    expect(step?.question.cardId).toBe('v-nazara');
    expect(step?.lap).toEqual(['v-bahatha']);
  });

  it('skips lap entries it cannot ask about', () => {
    const lap = ['v-gone', 'v-tuwuffiya', 'v-bahatha', 'v-nazara'];
    const step = nextEndlessQuestion(deck, lap, ['imperative'], mulberry32(2));
    expect(step?.question.cardId).toBe('v-bahatha');
    expect(step?.lap).toEqual(['v-nazara']);
  });

  it('draws a fresh lap when the one it is handed has nothing left to ask', () => {
    const step = nextEndlessQuestion(deck, ['v-gone'], kinds, mulberry32(3));
    expect(step).not.toBeNull();
    expect(step?.lap).toHaveLength(countQuizQuestions(deck, kinds) - 1);
  });

  it('orders each new lap least learned first, by the levels it is handed', () => {
    const shaky = verbCard({
      id: 'v-shaky',
      past: 'رَجَعَ',
      present: 'يَرْجِعُ',
      meaning: 'To return',
      srs: studiedSrs(0, 4),
    });
    const middling = verbCard({
      id: 'v-middling',
      past: 'كَتَبَ',
      present: 'يَكْتُبُ',
      meaning: 'To write',
      srs: studiedSrs(3, 1),
    });
    const mastered = verbCard({
      id: 'v-mastered',
      past: 'قَرَأَ',
      present: 'يَقْرَأُ',
      meaning: 'To read',
      srs: studiedSrs(MAX_BOX),
    });
    const flipped = [withCardSrs(shaky, mastered.srs), middling, withCardSrs(mastered, shaky.srs)];
    for (const seed of [1, 2, 3, 17, 99]) {
      const first = nextEndlessQuestion(
        [mastered, middling, shaky],
        [],
        ['present'],
        mulberry32(seed),
      );
      expect([first?.question.cardId, ...(first?.lap ?? [])]).toEqual([
        'v-shaky',
        'v-middling',
        'v-mastered',
      ]);
      const next = nextEndlessQuestion(flipped, [], ['present'], mulberry32(seed));
      expect([next?.question.cardId, ...(next?.lap ?? [])]).toEqual([
        'v-mastered',
        'v-middling',
        'v-shaky',
      ]);
    }
  });

  it('returns null when no studied card can be asked about', () => {
    expect(nextEndlessQuestion([ittasala], [], ['present'], mulberry32(1))).toBeNull();
    expect(nextEndlessQuestion(deck, [], [], mulberry32(1))).toBeNull();
    const unstudied = deck.map((card) => withCardSrs(card, newSrsState(NOW)));
    expect(nextEndlessQuestion(unstudied, [], kinds, mulberry32(1))).toBeNull();
  });
});
