import { describe, expect, it } from 'vitest';

import { cardHeadline, type Card } from '@/domain/cards';
import { buildQuiz, mulberry32, type QuizKind, type QuizQuestion } from '@/domain/quiz';
import { newSrsState } from '@/domain/srs';

const NOW = new Date('2026-07-06T10:00:00.000Z');

interface VerbSpec {
  id: string;
  past: string;
  preposition?: string | null;
  present?: string | null;
  imperative?: string | null;
  masdar?: string | null;
  meaning: string;
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
    srs: newSrsState(NOW),
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

function vocabCard(id: string, arabic: string, meaning: string): Card {
  return {
    id,
    type: 'vocab',
    lessonId: null,
    scanId: null,
    meaning,
    aiImagePath: null,
    imageEnabled: true,
    srs: newSrsState(NOW),
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
      kinds: ['present', 'imperative', 'masdar', 'meaning'],
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
