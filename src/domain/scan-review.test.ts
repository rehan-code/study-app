import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  PARSED_FIELD_KEYS,
  type ParsedRow,
  type ParsedScan,
  type RowCorrection,
} from '@/domain/parsed-scan';
import {
  draftToCardSeed,
  isBlankRow,
  parsedToDrafts,
  validateDrafts,
  type ReviewDraft,
} from '@/domain/scan-review';

function verbRow(
  fields: Record<string, string | null>,
  meaning: string | null,
  note: string | null = null,
  corrections: RowCorrection[] = [],
): ParsedRow {
  return { fields, meaning, note, corrections };
}

const BLANK_ROW: ParsedRow = verbRow({ past: null, present: null, masdar: null }, null);

function verbsScan(overrides: Partial<ParsedScan> = {}): ParsedScan {
  return {
    kind: 'verbs',
    rows: [
      verbRow(
        {
          past: 'اِتَّصَلَ',
          preposition: 'بـ',
          present: 'يَتَّصِلُ',
          imperative: 'اِتَّصِلْ',
          masdar: 'اِتِّصَال',
          activeParticiple: null,
          passiveParticiple: null,
        },
        'To call',
      ),
      verbRow(
        {
          past: 'تُوُفِّيَ',
          preposition: '-',
          present: 'يُتَوَفَّى',
          imperative: '-',
          masdar: '-',
          activeParticiple: null,
          passiveParticiple: null,
        },
        'To pass away',
      ),
      verbRow(
        {
          past: 'اِحْتَاجَ',
          preposition: 'إِلَى',
          present: 'يَحْتَاجُ',
          imperative: null,
          masdar: 'اِحْتِيَاج/حَاجَة',
          activeParticiple: null,
          passiveParticiple: null,
        },
        'To need',
        'Same verb pattern as lesson 8',
      ),
    ],
    lessonMarkers: [],
    warnings: [],
    ...overrides,
  };
}

function draft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    key: 'row-0',
    type: 'verb',
    fields: {
      past: 'اِتَّصَلَ',
      preposition: 'بـ',
      present: 'يَتَّصِلُ',
      imperative: 'اِتَّصِلْ',
      masdar: 'اِتِّصَال',
      activeParticiple: null,
      passiveParticiple: null,
    },
    meaning: 'To call',
    note: null,
    lessonName: 'Lesson 9',
    excluded: false,
    corrections: [],
    ...overrides,
  };
}

describe('isBlankRow', () => {
  it('is blank when every field is null and there is no meaning', () => {
    expect(isBlankRow(BLANK_ROW)).toBe(true);
    expect(isBlankRow(verbRow({}, null))).toBe(true);
  });

  it('treats empty, whitespace, and dash cells as blank', () => {
    expect(isBlankRow(verbRow({ past: '', present: '   ', masdar: '-' }, null))).toBe(true);
  });

  it('is not blank when any field has content', () => {
    expect(isBlankRow(verbRow({ past: 'اِتَّصَلَ' }, null))).toBe(false);
  });

  it('is not blank for meaning-only rows', () => {
    expect(isBlankRow(verbRow({ past: null }, 'To call'))).toBe(false);
  });

  it('treats a whitespace-only meaning as no meaning', () => {
    expect(isBlankRow(verbRow({ past: null }, '   '))).toBe(true);
  });
});

describe('parsedToDrafts', () => {
  it('maps rows to editable drafts with the scan kind card type', () => {
    const drafts = parsedToDrafts('verbs', verbsScan(), null);
    expect(drafts).toHaveLength(3);
    expect(drafts[0].type).toBe('verb');
    expect(drafts[0].key).toBe('row-0');
    expect(drafts[0].fields.past).toBe('اِتَّصَلَ');
    expect(drafts[0].meaning).toBe('To call');
    expect(drafts[0].note).toBeNull();
    expect(drafts[0].excluded).toBe(false);
    expect(drafts[2].note).toBe('Same verb pattern as lesson 8');
  });

  it('drops blank rows while keeping keys stable by original row index', () => {
    const scan = verbsScan();
    const withBlank = verbsScan({ rows: [scan.rows[0], BLANK_ROW, scan.rows[2]] });
    const drafts = parsedToDrafts('verbs', withBlank, null);
    expect(drafts.map((entry) => entry.key)).toEqual(['row-0', 'row-2']);
  });

  it('normalizes fields to the parsed field keys for the kind', () => {
    const scan = verbsScan({
      rows: [verbRow({ past: 'اِتَّصَلَ', watermark: 'AndalusInstitute.com' }, 'To call')],
    });
    const drafts = parsedToDrafts('verbs', scan, null);
    expect(Object.keys(drafts[0].fields).sort()).toEqual([...PARSED_FIELD_KEYS.verbs].sort());
    expect(drafts[0].fields.present).toBeNull();
    expect('watermark' in drafts[0].fields).toBe(false);
  });

  it('turns a null meaning into an empty editable string', () => {
    const scan = verbsScan({ rows: [verbRow({ past: 'اِتَّصَلَ' }, null)] });
    expect(parsedToDrafts('verbs', scan, null)[0].meaning).toBe('');
  });

  it('maps nouns scans to vocab drafts and phrases scans to phrase drafts', () => {
    const nouns = parsedToDrafts(
      'nouns',
      {
        kind: 'nouns',
        rows: [verbRow({ arabic: 'أُسْبُوعٌ', plural1: 'أَسَابِيعُ' }, 'Week')],
        lessonMarkers: [],
        warnings: [],
      },
      null,
    );
    expect(nouns[0].type).toBe('vocab');
    expect(Object.keys(nouns[0].fields).sort()).toEqual([...PARSED_FIELD_KEYS.nouns].sort());
    const phrases = parsedToDrafts(
      'phrases',
      {
        kind: 'phrases',
        rows: [verbRow({ arabic: 'إِنْ شَاءَ اللهُ' }, 'God willing')],
        lessonMarkers: [],
        warnings: [],
      },
      null,
    );
    expect(phrases[0].type).toBe('phrase');
  });

  describe('lesson markers', () => {
    it('uses the fallback for every row when there are no markers', () => {
      const drafts = parsedToDrafts('verbs', verbsScan(), 'Lesson 8');
      expect(drafts.map((entry) => entry.lessonName)).toEqual(['Lesson 8', 'Lesson 8', 'Lesson 8']);
    });

    it('leaves lessonName null with no markers and no fallback', () => {
      const drafts = parsedToDrafts('verbs', verbsScan(), null);
      expect(drafts.map((entry) => entry.lessonName)).toEqual([null, null, null]);
    });

    it('applies a marker at beforeRow 0 to every row', () => {
      const scan = verbsScan({ lessonMarkers: [{ beforeRow: 0, name: 'LESSON 9' }] });
      const drafts = parsedToDrafts('verbs', scan, 'Lesson 8');
      expect(drafts.map((entry) => entry.lessonName)).toEqual(['Lesson 9', 'Lesson 9', 'Lesson 9']);
    });

    it('gives rows before the first marker the fallback lesson', () => {
      const scan = verbsScan({ lessonMarkers: [{ beforeRow: 1, name: 'LESSON 10' }] });
      const drafts = parsedToDrafts('verbs', scan, 'Lesson 9');
      expect(drafts.map((entry) => entry.lessonName)).toEqual([
        'Lesson 9',
        'Lesson 10',
        'Lesson 10',
      ]);
    });

    it('supports several markers on one spread, applied in beforeRow order', () => {
      const scan = verbsScan({
        lessonMarkers: [
          { beforeRow: 2, name: 'LESSON 11' },
          { beforeRow: 0, name: 'LESSON 9' },
          { beforeRow: 1, name: 'lesson 10' },
        ],
      });
      const drafts = parsedToDrafts('verbs', scan, null);
      expect(drafts.map((entry) => entry.lessonName)).toEqual([
        'Lesson 9',
        'Lesson 10',
        'Lesson 11',
      ]);
    });

    it('ignores a marker beyond the last row', () => {
      const scan = verbsScan({ lessonMarkers: [{ beforeRow: 99, name: 'LESSON 12' }] });
      const drafts = parsedToDrafts('verbs', scan, 'Lesson 9');
      expect(drafts.map((entry) => entry.lessonName)).toEqual(['Lesson 9', 'Lesson 9', 'Lesson 9']);
    });

    it('applies markers by original row index even when blank rows are dropped', () => {
      const scan = verbsScan();
      const withBlank = verbsScan({
        rows: [scan.rows[0], BLANK_ROW, scan.rows[2]],
        lessonMarkers: [{ beforeRow: 1, name: 'LESSON 10' }],
      });
      const drafts = parsedToDrafts('verbs', withBlank, 'Lesson 9');
      expect(drafts.map((entry) => [entry.key, entry.lessonName])).toEqual([
        ['row-0', 'Lesson 9'],
        ['row-2', 'Lesson 10'],
      ]);
    });

    it('normalizes marker names matching lesson N to a canonical form', () => {
      const cases: [string, string][] = [
        ['LESSON 10', 'Lesson 10'],
        ['lesson7', 'Lesson 7'],
        ['Lesson 09', 'Lesson 9'],
        ['  Revision  ', 'Revision'],
      ];
      for (const [raw, normalized] of cases) {
        const scan = verbsScan({ lessonMarkers: [{ beforeRow: 0, name: raw }] });
        expect(parsedToDrafts('verbs', scan, null)[0].lessonName).toBe(normalized);
      }
    });

    it('passes the fallback lesson name through unnormalized', () => {
      const drafts = parsedToDrafts('verbs', verbsScan(), 'lesson 3');
      expect(drafts[0].lessonName).toBe('lesson 3');
    });
  });

  describe('corrections', () => {
    const wrongPresent = { ...verbsScan().rows[0].fields, present: 'يَتَّصَلُ' };

    it('defaults a flagged field to the checked form and keeps what the page says', () => {
      const scan = verbsScan({
        rows: [
          verbRow(wrongPresent, 'To call', null, [
            {
              field: 'present',
              suggested: 'يَتَّصِلُ',
              reason: 'The middle radical takes kasra in the present tense.',
            },
          ]),
        ],
      });
      const drafts = parsedToDrafts('verbs', scan, null);
      expect(drafts[0].fields.present).toBe('يَتَّصِلُ');
      expect(drafts[0].corrections).toEqual([
        {
          field: 'present',
          scanned: 'يَتَّصَلُ',
          suggested: 'يَتَّصِلُ',
          reason: 'The middle radical takes kasra in the present tense.',
        },
      ]);
    });

    it('ignores corrections for fields the kind does not have', () => {
      const scan = verbsScan({
        rows: [
          verbRow(wrongPresent, 'To call', null, [
            { field: 'plural1', suggested: 'أَسَابِيعُ', reason: 'Wrong plural.' },
          ]),
        ],
      });
      const drafts = parsedToDrafts('verbs', scan, null);
      expect(drafts[0].corrections).toEqual([]);
      expect(drafts[0].fields.present).toBe('يَتَّصَلُ');
    });

    it('ignores corrections aimed at blank or dash cells', () => {
      const scan = verbsScan({
        rows: [
          verbRow({ ...wrongPresent, imperative: '-', masdar: null }, 'To call', null, [
            { field: 'imperative', suggested: 'اِتَّصِلْ', reason: 'Missing imperative.' },
            { field: 'masdar', suggested: 'اِتِّصَال', reason: 'Missing masdar.' },
          ]),
        ],
      });
      const drafts = parsedToDrafts('verbs', scan, null);
      expect(drafts[0].corrections).toEqual([]);
      expect(drafts[0].fields.imperative).toBe('-');
      expect(drafts[0].fields.masdar).toBeNull();
    });

    it('ignores corrections that do not change the page value', () => {
      const scan = verbsScan({
        rows: [
          verbRow(wrongPresent, 'To call', null, [
            { field: 'present', suggested: ' يَتَّصَلُ ', reason: 'No real change.' },
          ]),
        ],
      });
      const drafts = parsedToDrafts('verbs', scan, null);
      expect(drafts[0].corrections).toEqual([]);
      expect(drafts[0].fields.present).toBe('يَتَّصَلُ');
    });

    it('keeps only the first correction per field', () => {
      const scan = verbsScan({
        rows: [
          verbRow(wrongPresent, 'To call', null, [
            { field: 'present', suggested: 'يَتَّصِلُ', reason: 'First.' },
            { field: 'present', suggested: 'يَتَواصَلُ', reason: 'Second.' },
          ]),
        ],
      });
      const drafts = parsedToDrafts('verbs', scan, null);
      expect(drafts[0].corrections).toHaveLength(1);
      expect(drafts[0].fields.present).toBe('يَتَّصِلُ');
    });

    it('feeds the checked form into card seeds unless the user changes it', () => {
      const scan = verbsScan({
        rows: [
          verbRow(wrongPresent, 'To call', null, [
            { field: 'present', suggested: 'يَتَّصِلُ', reason: 'Kasra, not fatha.' },
          ]),
        ],
      });
      const seeds = parsedToDrafts('verbs', scan, null).map(draftToCardSeed);
      expect(seeds[0].fields).toMatchObject({ present: 'يَتَّصِلُ' });
    });
  });
});

describe('validateDrafts', () => {
  it('accepts complete drafts', () => {
    expect(validateDrafts([draft()])).toEqual([]);
  });

  it('flags a missing verb headline', () => {
    expect(validateDrafts([draft({ fields: { ...draft().fields, past: null } })])).toEqual([
      { key: 'row-0', problem: 'missing_headline' },
    ]);
    expect(validateDrafts([draft({ fields: { ...draft().fields, past: '   ' } })])).toEqual([
      { key: 'row-0', problem: 'missing_headline' },
    ]);
  });

  it('flags vocab and phrase drafts missing their arabic headline', () => {
    const vocabDraft = draft({ type: 'vocab', fields: { arabic: null }, key: 'row-4' });
    expect(validateDrafts([vocabDraft])).toEqual([{ key: 'row-4', problem: 'missing_headline' }]);
    const phraseDraft = draft({ type: 'phrase', fields: { arabic: '' }, key: 'row-5' });
    expect(validateDrafts([phraseDraft])).toEqual([{ key: 'row-5', problem: 'missing_headline' }]);
  });

  it('flags a missing meaning', () => {
    expect(validateDrafts([draft({ meaning: '  ' })])).toEqual([
      { key: 'row-0', problem: 'missing_meaning' },
    ]);
  });

  it('reports both problems for an empty draft', () => {
    const problems = validateDrafts([draft({ fields: { past: null }, meaning: '' })]);
    expect(problems).toEqual([
      { key: 'row-0', problem: 'missing_headline' },
      { key: 'row-0', problem: 'missing_meaning' },
    ]);
  });

  it('attributes problems to the right rows across several drafts', () => {
    const problems = validateDrafts([
      draft(),
      draft({ key: 'row-1', meaning: '' }),
      draft({ key: 'row-2', fields: { past: null } }),
    ]);
    expect(problems).toEqual([
      { key: 'row-1', problem: 'missing_meaning' },
      { key: 'row-2', problem: 'missing_headline' },
    ]);
  });
});

describe('draftToCardSeed', () => {
  it('builds a verb seed preserving harakat exactly', () => {
    const seed = draftToCardSeed(draft());
    expect(seed.type).toBe('verb');
    expect(seed.meaning).toBe('To call');
    expect(seed.fields).toEqual({
      past: 'اِتَّصَلَ',
      preposition: 'بـ',
      present: 'يَتَّصِلُ',
      imperative: 'اِتَّصِلْ',
      masdar: 'اِتِّصَال',
      activeParticiple: null,
      passiveParticiple: null,
      note: null,
    });
  });

  it('merges the review note into the card fields', () => {
    const seed = draftToCardSeed(draft({ note: 'Book has a typo here' }));
    expect(seed.fields.note).toBe('Book has a typo here');
  });

  it('normalizes dash, empty, and whitespace cells to null', () => {
    const seed = draftToCardSeed(
      draft({
        fields: { ...draft().fields, imperative: '-', masdar: '', activeParticiple: '   ' },
      }),
    );
    expect(seed.fields).toMatchObject({ imperative: null, masdar: null, activeParticiple: null });
  });

  it('trims values and the meaning', () => {
    const seed = draftToCardSeed(
      draft({ fields: { ...draft().fields, present: ' يَتَّصِلُ ' }, meaning: '  To call  ' }),
    );
    expect(seed.meaning).toBe('To call');
    if (!('present' in seed.fields)) {
      throw new Error('expected verb fields');
    }
    expect(seed.fields.present).toBe('يَتَّصِلُ');
  });

  it('drops keys the card schema does not know', () => {
    const seed = draftToCardSeed(draft({ fields: { ...draft().fields, watermark: 'ignore me' } }));
    expect('watermark' in seed.fields).toBe(false);
  });

  it('builds vocab seeds with synonyms and antonyms intact', () => {
    const seed = draftToCardSeed(
      draft({
        type: 'vocab',
        fields: {
          arabic: 'يَمِين',
          plural1: null,
          plural2: null,
          synonym: null,
          synonymPlural: null,
          antonym: 'يَسَار/شِمَال',
          antonymPlural: null,
        },
        meaning: 'Right side',
      }),
    );
    expect(seed.type).toBe('vocab');
    expect(seed.fields).toMatchObject({ arabic: 'يَمِين', antonym: 'يَسَار/شِمَال' });
  });

  it('throws a ZodError when the headline is empty or missing', () => {
    expect(() => draftToCardSeed(draft({ fields: { ...draft().fields, past: '' } }))).toThrow(
      ZodError,
    );
    expect(() => draftToCardSeed(draft({ fields: { ...draft().fields, past: '   ' } }))).toThrow(
      ZodError,
    );
    expect(() => draftToCardSeed(draft({ fields: {} }))).toThrow(ZodError);
    expect(() => draftToCardSeed(draft({ type: 'vocab', fields: { arabic: null } }))).toThrow(
      ZodError,
    );
  });

  it('round-trips parsed rows through drafts into valid seeds', () => {
    const drafts = parsedToDrafts('verbs', verbsScan(), 'Lesson 9');
    const seeds = drafts.map(draftToCardSeed);
    expect(seeds[0].fields).toMatchObject({ past: 'اِتَّصَلَ', masdar: 'اِتِّصَال' });
    // Dash cells from the workbook become nulls, not parse errors.
    expect(seeds[1].fields).toMatchObject({ preposition: null, imperative: null, masdar: null });
    expect(seeds[2].fields).toMatchObject({
      masdar: 'اِحْتِيَاج/حَاجَة',
      note: 'Same verb pattern as lesson 8',
    });
  });
});
