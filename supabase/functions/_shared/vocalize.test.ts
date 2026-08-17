import { describe, expect, it } from 'vitest';

import {
  applyVocalizations,
  arabicSkeleton,
  chooseVocalized,
  vocalizationTargets,
  type FieldKeysByKind,
  type VocalizableLesson,
} from './vocalize.ts';

const FIELD_KEYS: FieldKeysByKind = {
  nouns: ['arabic', 'plural1'],
  verbs: ['past', 'present'],
  phrases: ['arabic'],
};

function lesson(overrides: Partial<VocalizableLesson>): VocalizableLesson {
  return { nouns: [], verbs: [], phrases: [], ...overrides };
}

function row(fields: Record<string, string | null>, meaning: string | null, note = null) {
  return { fields, meaning, note };
}

describe('arabicSkeleton', () => {
  it('sees a vowelled word and its bare letters as the same word', () => {
    expect(arabicSkeleton('كِتَابٌ')).toBe(arabicSkeleton('كتاب'));
  });

  it('sees through the presentation forms the PDF is written in', () => {
    // ﻛﺘﺎﺏ, the same word spelled with initial/medial/final glyph forms.
    expect(arabicSkeleton('ﻛﺘﺎﺏ')).toBe(arabicSkeleton('كتاب'));
  });

  it('folds the Urdu lookalike letters this book substitutes', () => {
    expect(arabicSkeleton('اللّٰھ')).toBe(arabicSkeleton('الله'));
    expect(arabicSkeleton('کیف')).toBe(arabicSkeleton('كيف'));
  });

  it('ignores tatweel and spacing differences', () => {
    expect(arabicSkeleton('تَزَوﱠ ﺟَت')).toBe(arabicSkeleton('تزوجت'));
  });

  it('keeps genuinely different letters apart', () => {
    expect(arabicSkeleton('مدرسة')).not.toBe(arabicSkeleton('مدرسه'));
    expect(arabicSkeleton('مستشفى')).not.toBe(arabicSkeleton('مستشفي'));
    expect(arabicSkeleton('أسرة')).not.toBe(arabicSkeleton('اسرة'));
    expect(arabicSkeleton('كتب')).not.toBe(arabicSkeleton('كتاب'));
  });
});

describe('chooseVocalized', () => {
  it('takes the vowelling when the letters are the same word', () => {
    expect(chooseVocalized('أُسْرَة', 'أُسْرَةٌ')).toBe('أُسْرَةٌ');
  });

  it('takes a correction that only moves the marks around', () => {
    expect(chooseVocalized('مُعَلَّمٌ', 'مُعَلِّمٌ')).toBe('مُعَلِّمٌ');
  });

  it('rewrites presentation forms into ordinary Arabic', () => {
    expect(chooseVocalized('ﻛﺘﺎﺏ', 'كِتَابٌ')).toBe('كِتَابٌ');
  });

  it('refuses a different word, however plausible', () => {
    expect(chooseVocalized('مَدْرَسَة', 'مَدَارِسُ')).toBe('مَدْرَسَة');
    expect(chooseVocalized('كِتَاب', 'كُتُبٌ')).toBe('كِتَاب');
  });

  it('refuses a proposal that drops or adds a letter', () => {
    expect(chooseVocalized('مُدَرِّس', 'مُدَرِّسُونَ')).toBe('مُدَرِّس');
    expect(chooseVocalized('قَلَم', 'قَلْ')).toBe('قَلَم');
  });

  it('never strips harakat the page already had', () => {
    expect(chooseVocalized('مُحَمَّدٌ', 'محمد')).toBe('مُحَمَّدٌ');
    expect(chooseVocalized('مُحَمَّدٌ', 'مُحَمّد')).toBe('مُحَمَّدٌ');
  });

  it('falls back to the page when there is no proposal', () => {
    expect(chooseVocalized('كِتَاب', null)).toBe('كِتَاب');
    expect(chooseVocalized('كِتَاب', undefined)).toBe('كِتَاب');
    expect(chooseVocalized('كِتَاب', '   ')).toBe('كِتَاب');
  });

  it('keeps a corrupt cell exactly as it is rather than guessing', () => {
    // The broken heading font leaves ASCII inside the word; the letters no
    // longer match anything, so nothing is substituted.
    expect(chooseVocalized('الد#رْس', 'الدَّرْسُ')).toBe('الد#رْس');
  });
});

describe('vocalizationTargets', () => {
  it('describes every filled Arabic cell with its role and meaning', () => {
    const lessons = [
      lesson({
        nouns: [row({ arabic: 'كتاب', plural1: 'كتب' }, 'Book')],
        verbs: [row({ past: 'كتب', present: null }, 'To write')],
      }),
    ];

    expect(vocalizationTargets(lessons, FIELD_KEYS)).toEqual([
      { index: 0, role: 'nouns.arabic', text: 'كتاب', meaning: 'Book' },
      { index: 1, role: 'nouns.plural1', text: 'كتب', meaning: 'Book' },
      { index: 2, role: 'verbs.past', text: 'كتب', meaning: 'To write' },
    ]);
  });

  it('skips empty and missing cells', () => {
    const lessons = [lesson({ nouns: [row({ arabic: 'قلم', plural1: '   ' }, null)] })];

    expect(vocalizationTargets(lessons, FIELD_KEYS).map((t) => t.role)).toEqual(['nouns.arabic']);
  });

  it('includes the example sentence on a row', () => {
    const lessons = [
      lesson({ phrases: [{ fields: { arabic: 'مع' }, meaning: 'With', note: 'جملة' }] }),
    ];

    expect(vocalizationTargets(lessons, FIELD_KEYS).map((t) => t.role)).toEqual([
      'phrases.arabic',
      'phrases.note',
    ]);
  });
});

describe('applyVocalizations', () => {
  it('writes accepted proposals back into the same cells it asked about', () => {
    const lessons = [
      lesson({
        nouns: [row({ arabic: 'أسرة', plural1: 'أسر' }, 'Family')],
        verbs: [{ fields: { past: 'كتب' }, meaning: 'To write', note: 'جملة' }],
      }),
    ];
    const targets = vocalizationTargets(lessons, FIELD_KEYS);
    const proposals = new Map([
      [0, 'أُسْرَةٌ'],
      [1, 'أُسَرٌ'],
      [2, 'كَتَبَ'],
      [3, 'جُمْلَةٌ'],
    ]);

    const result = applyVocalizations(lessons, FIELD_KEYS, proposals);

    expect(targets).toHaveLength(4);
    expect(result).toEqual({ changed: 4, kept: 0 });
    expect(lessons[0].nouns[0].fields).toEqual({ arabic: 'أُسْرَةٌ', plural1: 'أُسَرٌ' });
    expect(lessons[0].verbs[0].fields.past).toBe('كَتَبَ');
    expect(lessons[0].verbs[0].note).toBe('جُمْلَةٌ');
  });

  it('leaves a cell alone when its proposal fails the guard', () => {
    const lessons = [lesson({ nouns: [row({ arabic: 'مدرسة', plural1: 'مدارس' }, 'School')] })];

    const result = applyVocalizations(
      lessons,
      FIELD_KEYS,
      new Map([
        [0, 'مَدْرَسَةٌ'],
        [1, 'مَكَاتِبُ'], // a different word entirely
      ]),
    );

    expect(result).toEqual({ changed: 1, kept: 1 });
    expect(lessons[0].nouns[0].fields).toEqual({ arabic: 'مَدْرَسَةٌ', plural1: 'مدارس' });
  });

  it('leaves everything untouched when no proposals came back', () => {
    const lessons = [lesson({ nouns: [row({ arabic: 'قلم', plural1: null }, 'Pen')] })];

    expect(applyVocalizations(lessons, FIELD_KEYS, new Map())).toEqual({ changed: 0, kept: 1 });
    expect(lessons[0].nouns[0].fields.arabic).toBe('قلم');
  });

  it('stays aligned with the targets when rows have gaps', () => {
    // The walk that numbers the cells and the walk that writes them back must
    // skip exactly the same empties, or every later cell lands on the wrong word.
    const lessons = [
      lesson({
        nouns: [row({ arabic: 'كتاب', plural1: null }, 'Book'), row({ arabic: 'قلم' }, 'Pen')],
      }),
    ];
    const targets = vocalizationTargets(lessons, FIELD_KEYS);

    expect(targets.map((t) => t.text)).toEqual(['كتاب', 'قلم']);

    applyVocalizations(lessons, FIELD_KEYS, new Map([[1, 'قَلَمٌ']]));

    expect(lessons[0].nouns[0].fields.arabic).toBe('كتاب');
    expect(lessons[0].nouns[1].fields.arabic).toBe('قَلَمٌ');
  });
});
