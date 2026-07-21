import { FIELD_LABELS, type CardType } from '@/domain/cards';
import type { DraftCorrection, DraftValidation, ReviewDraft } from '@/domain/scan-review';

/** The first field of every card type is its required Arabic headline. */
export function headlineFieldKey(type: CardType): string {
  return FIELD_LABELS[type][0].key;
}

export function headlineErrorMessage(type: CardType): string {
  switch (type) {
    case 'vocab':
      return 'Add the Arabic word';
    case 'verb':
      return 'Add the past tense verb';
    case 'phrase':
      return 'Add the Arabic phrase';
  }
}

export const MEANING_ERROR_MESSAGE = 'Add the meaning';

function updateDraft(
  drafts: readonly ReviewDraft[],
  key: string,
  update: (draft: ReviewDraft) => ReviewDraft,
): ReviewDraft[] {
  return drafts.map((draft) => {
    if (draft.key !== key) {
      return draft;
    }
    return update(draft);
  });
}

export function setDraftField(
  drafts: readonly ReviewDraft[],
  key: string,
  fieldKey: string,
  value: string,
): ReviewDraft[] {
  return updateDraft(drafts, key, (draft) => ({
    ...draft,
    fields: { ...draft.fields, [fieldKey]: value },
  }));
}

export function setDraftMeaning(
  drafts: readonly ReviewDraft[],
  key: string,
  value: string,
): ReviewDraft[] {
  return updateDraft(drafts, key, (draft) => ({ ...draft, meaning: value }));
}

export function setDraftNote(
  drafts: readonly ReviewDraft[],
  key: string,
  value: string,
): ReviewDraft[] {
  return updateDraft(drafts, key, (draft) => ({ ...draft, note: value }));
}

export function setDraftLesson(
  drafts: readonly ReviewDraft[],
  key: string,
  lessonName: string | null,
): ReviewDraft[] {
  return updateDraft(drafts, key, (draft) => ({ ...draft, lessonName }));
}

export function setAllDraftLessons(
  drafts: readonly ReviewDraft[],
  lessonName: string | null,
): ReviewDraft[] {
  return drafts.map((draft) => ({ ...draft, lessonName }));
}

export function toggleDraftExcluded(drafts: readonly ReviewDraft[], key: string): ReviewDraft[] {
  return updateDraft(drafts, key, (draft) => ({ ...draft, excluded: !draft.excluded }));
}

export function includedDrafts(drafts: readonly ReviewDraft[]): ReviewDraft[] {
  return drafts.filter((draft) => !draft.excluded);
}

export type BulkLessonValue = { state: 'same'; name: string | null } | { state: 'mixed' };

export function bulkLessonValue(drafts: readonly ReviewDraft[]): BulkLessonValue {
  if (drafts.length === 0) {
    return { state: 'same', name: null };
  }
  const first = drafts[0].lessonName;
  const allSame = drafts.every((draft) => draft.lessonName === first);
  if (allSame) {
    return { state: 'same', name: first };
  }
  return { state: 'mixed' };
}

export interface DraftFieldErrors {
  headline: boolean;
  meaning: boolean;
}

export function fieldErrorsFromProblems(
  problems: readonly DraftValidation[],
): Record<string, DraftFieldErrors> {
  const errors: Record<string, DraftFieldErrors> = {};
  for (const problem of problems) {
    const current = errors[problem.key] ?? { headline: false, meaning: false };
    if (problem.problem === 'missing_headline') {
      current.headline = true;
    } else {
      current.meaning = true;
    }
    errors[problem.key] = current;
  }
  return errors;
}

export function clearFieldError(
  errors: Record<string, DraftFieldErrors>,
  key: string,
  which: keyof DraftFieldErrors,
): Record<string, DraftFieldErrors> {
  const current = errors[key];
  if (current === undefined || !current[which]) {
    return errors;
  }
  const next = { ...errors, [key]: { ...current, [which]: false } };
  if (!next[key].headline && !next[key].meaning) {
    delete next[key];
  }
  return next;
}

/** Which of a flagged field's versions the current value matches. */
export type CorrectionChoice = 'suggested' | 'scanned' | 'custom';

export function correctionChoice(value: string, correction: DraftCorrection): CorrectionChoice {
  const trimmed = value.trim();
  if (trimmed === correction.suggested.trim()) {
    return 'suggested';
  }
  if (trimmed === correction.scanned.trim()) {
    return 'scanned';
  }
  return 'custom';
}

/** Flagged answers across the rows that will actually be saved. */
export function correctionCount(drafts: readonly ReviewDraft[]): number {
  return drafts.reduce((sum, draft) => (draft.excluded ? sum : sum + draft.corrections.length), 0);
}

export function correctionSummaryMessage(count: number): string {
  if (count === 1) {
    return '1 answer on the page looks like a mistake. The correction is filled in; the flagged field also shows what was written.';
  }
  return `${count} answers on the page look like mistakes. Corrections are filled in; flagged fields also show what was written.`;
}

/** Lesson names the drafts reference, deduplicated case-insensitively, first casing wins. */
export function distinctLessonNames(drafts: readonly ReviewDraft[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const draft of drafts) {
    const name = draft.lessonName?.trim();
    if (!name) {
      continue;
    }
    const lower = name.toLowerCase();
    if (seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    names.push(name);
  }
  return names;
}

/** Existing lesson names plus pending draft names, deduplicated case-insensitively. */
export function mergeLessonNames(existing: readonly string[], extras: readonly string[]): string[] {
  const seen = new Set(existing.map((name) => name.trim().toLowerCase()));
  const merged = [...existing];
  const pending: string[] = [];
  for (const extra of extras) {
    const name = extra.trim();
    if (name === '' || seen.has(name.toLowerCase())) {
      continue;
    }
    seen.add(name.toLowerCase());
    pending.push(name);
  }
  pending.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return [...merged, ...pending];
}
