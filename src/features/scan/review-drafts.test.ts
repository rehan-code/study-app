import { describe, expect, it } from 'vitest';

import type { DraftValidation, ReviewDraft } from '@/domain/scan-review';
import {
  bulkLessonValue,
  clearFieldError,
  distinctLessonNames,
  fieldErrorsFromProblems,
  headlineErrorMessage,
  headlineFieldKey,
  includedDrafts,
  mergeLessonNames,
  setAllDraftLessons,
  setDraftField,
  setDraftLesson,
  setDraftMeaning,
  setDraftNote,
  toggleDraftExcluded,
} from '@/features/scan/review-drafts';

function makeDraft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return {
    key: 'row-0',
    type: 'verb',
    fields: { past: 'اتصل', preposition: 'بـ', present: 'يتصل', masdar: 'اتصال' },
    meaning: 'To call',
    note: null,
    lessonName: null,
    excluded: false,
    ...overrides,
  };
}

describe('headlineFieldKey', () => {
  it('maps each card type to its required Arabic field', () => {
    expect(headlineFieldKey('vocab')).toBe('arabic');
    expect(headlineFieldKey('verb')).toBe('past');
    expect(headlineFieldKey('phrase')).toBe('arabic');
  });
});

describe('headlineErrorMessage', () => {
  it('is friendly per type', () => {
    expect(headlineErrorMessage('vocab')).toBe('Add the Arabic word');
    expect(headlineErrorMessage('verb')).toBe('Add the past tense verb');
    expect(headlineErrorMessage('phrase')).toBe('Add the Arabic phrase');
  });
});

describe('draft updates', () => {
  const drafts = [makeDraft(), makeDraft({ key: 'row-1', meaning: 'To look' })];

  it('updates one field without mutating', () => {
    const next = setDraftField(drafts, 'row-0', 'present', 'يَتَّصِلُ');
    expect(next[0].fields.present).toBe('يَتَّصِلُ');
    expect(next[1]).toBe(drafts[1]);
    expect(drafts[0].fields.present).toBe('يتصل');
  });

  it('updates meaning and note by key', () => {
    expect(setDraftMeaning(drafts, 'row-1', 'To watch')[1].meaning).toBe('To watch');
    expect(setDraftNote(drafts, 'row-0', 'book typo')[0].note).toBe('book typo');
  });

  it('sets lessons per row and in bulk', () => {
    expect(setDraftLesson(drafts, 'row-1', 'Lesson 9')[1].lessonName).toBe('Lesson 9');
    const all = setAllDraftLessons(drafts, 'Lesson 10');
    expect(all.every((draft) => draft.lessonName === 'Lesson 10')).toBe(true);
    const cleared = setAllDraftLessons(all, null);
    expect(cleared.every((draft) => draft.lessonName === null)).toBe(true);
  });

  it('toggles exclusion', () => {
    const excluded = toggleDraftExcluded(drafts, 'row-0');
    expect(excluded[0].excluded).toBe(true);
    expect(toggleDraftExcluded(excluded, 'row-0')[0].excluded).toBe(false);
  });

  it('filters included drafts', () => {
    const mixed = [makeDraft({ excluded: true }), makeDraft({ key: 'row-1' })];
    expect(includedDrafts(mixed).map((draft) => draft.key)).toEqual(['row-1']);
  });
});

describe('bulkLessonValue', () => {
  it('reports a shared value including none', () => {
    expect(bulkLessonValue([])).toEqual({ state: 'same', name: null });
    expect(bulkLessonValue([makeDraft(), makeDraft({ key: 'row-1' })])).toEqual({
      state: 'same',
      name: null,
    });
    const named = [
      makeDraft({ lessonName: 'Lesson 9' }),
      makeDraft({ key: 'row-1', lessonName: 'Lesson 9' }),
    ];
    expect(bulkLessonValue(named)).toEqual({ state: 'same', name: 'Lesson 9' });
  });

  it('reports mixed values', () => {
    const mixed = [
      makeDraft({ lessonName: 'Lesson 9' }),
      makeDraft({ key: 'row-1', lessonName: null }),
    ];
    expect(bulkLessonValue(mixed)).toEqual({ state: 'mixed' });
  });
});

describe('field errors', () => {
  const problems: DraftValidation[] = [
    { key: 'row-0', problem: 'missing_headline' },
    { key: 'row-0', problem: 'missing_meaning' },
    { key: 'row-2', problem: 'missing_meaning' },
  ];

  it('groups problems per draft', () => {
    const errors = fieldErrorsFromProblems(problems);
    expect(errors['row-0']).toEqual({ headline: true, meaning: true });
    expect(errors['row-2']).toEqual({ headline: false, meaning: true });
    expect(errors['row-1']).toBeUndefined();
  });

  it('clears one flag and drops empty entries', () => {
    const errors = fieldErrorsFromProblems(problems);
    const afterHeadline = clearFieldError(errors, 'row-0', 'headline');
    expect(afterHeadline['row-0']).toEqual({ headline: false, meaning: true });
    const afterMeaning = clearFieldError(afterHeadline, 'row-0', 'meaning');
    expect(afterMeaning['row-0']).toBeUndefined();
    expect(afterMeaning['row-2']).toEqual({ headline: false, meaning: true });
  });

  it('returns the same object when nothing changes', () => {
    const errors = fieldErrorsFromProblems(problems);
    expect(clearFieldError(errors, 'row-1', 'meaning')).toBe(errors);
    expect(clearFieldError(errors, 'row-2', 'headline')).toBe(errors);
  });
});

describe('lesson name helpers', () => {
  it('collects distinct draft lesson names case-insensitively', () => {
    const drafts = [
      makeDraft({ lessonName: 'Lesson 9' }),
      makeDraft({ key: 'row-1', lessonName: 'lesson 9' }),
      makeDraft({ key: 'row-2', lessonName: '  Lesson 10  ' }),
      makeDraft({ key: 'row-3', lessonName: null }),
    ];
    expect(distinctLessonNames(drafts)).toEqual(['Lesson 9', 'Lesson 10']);
  });

  it('merges existing and pending names without duplicates', () => {
    const merged = mergeLessonNames(['Lesson 2', 'Lesson 10'], ['lesson 10', 'Lesson 9', '']);
    expect(merged).toEqual(['Lesson 2', 'Lesson 10', 'Lesson 9']);
  });

  it('sorts pending names numerically', () => {
    expect(mergeLessonNames([], ['Lesson 10', 'Lesson 9'])).toEqual(['Lesson 9', 'Lesson 10']);
  });
});
