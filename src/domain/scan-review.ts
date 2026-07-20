import {
  parseCardFields,
  SCAN_KIND_TO_CARD_TYPE,
  type CardFields,
  type CardType,
  type ScanKind,
} from '@/domain/cards';
import {
  PARSED_FIELD_KEYS,
  type LessonMarker,
  type ParsedRow,
  type ParsedScan,
} from '@/domain/parsed-scan';

export interface ReviewDraft {
  key: string;
  type: CardType;
  fields: Record<string, string | null>;
  meaning: string;
  note: string | null;
  lessonName: string | null;
  excluded: boolean;
}

const LESSON_NUMBER_PATTERN = /lesson\s*(\d+)/i;

/** "LESSON 07" and "lesson7" both become "Lesson 7" so names match across scans. */
function normalizeLessonName(name: string): string {
  const match = LESSON_NUMBER_PATTERN.exec(name);
  if (match !== null) {
    return `Lesson ${Number(match[1])}`;
  }
  return name.trim();
}

/** Blank and "-" cells both mean "not filled in" on the workbook pages. */
function isBlankCell(value: string | null): boolean {
  if (value === null) {
    return true;
  }
  const trimmed = value.trim();
  return trimmed === '' || trimmed === '-';
}

export function isBlankRow(row: ParsedRow): boolean {
  const hasField = Object.values(row.fields).some((value) => !isBlankCell(value));
  const hasMeaning = row.meaning !== null && row.meaning.trim() !== '';
  return !hasField && !hasMeaning;
}

function lessonNameForRow(
  markers: readonly LessonMarker[],
  rowIndex: number,
  fallbackLessonName: string | null,
): string | null {
  let name = fallbackLessonName;
  for (const marker of markers) {
    if (marker.beforeRow > rowIndex) {
      break;
    }
    name = normalizeLessonName(marker.name);
  }
  return name;
}

export function parsedToDrafts(
  kind: ScanKind,
  parsed: ParsedScan,
  fallbackLessonName: string | null,
): ReviewDraft[] {
  const type = SCAN_KIND_TO_CARD_TYPE[kind];
  const keys = PARSED_FIELD_KEYS[kind];
  const markers = [...parsed.lessonMarkers].sort((a, b) => a.beforeRow - b.beforeRow);
  const drafts: ReviewDraft[] = [];
  parsed.rows.forEach((row, index) => {
    if (isBlankRow(row)) {
      return;
    }
    const fields: Record<string, string | null> = {};
    for (const key of keys) {
      fields[key] = row.fields[key] ?? null;
    }
    drafts.push({
      key: `row-${index}`,
      type,
      fields,
      meaning: row.meaning ?? '',
      note: row.note,
      lessonName: lessonNameForRow(markers, index, fallbackLessonName),
      excluded: false,
    });
  });
  return drafts;
}

export interface DraftValidation {
  key: string;
  problem: 'missing_headline' | 'missing_meaning';
}

const HEADLINE_KEY_BY_TYPE: Record<CardType, string> = {
  vocab: 'arabic',
  verb: 'past',
  phrase: 'arabic',
};

export function validateDrafts(drafts: ReviewDraft[]): DraftValidation[] {
  const problems: DraftValidation[] = [];
  for (const draft of drafts) {
    const headline = draft.fields[HEADLINE_KEY_BY_TYPE[draft.type]];
    if (headline === null || headline === undefined || headline.trim() === '') {
      problems.push({ key: draft.key, problem: 'missing_headline' });
    }
    if (draft.meaning.trim() === '') {
      problems.push({ key: draft.key, problem: 'missing_meaning' });
    }
  }
  return problems;
}

export function draftToCardSeed(draft: ReviewDraft): {
  type: CardType;
  fields: CardFields;
  meaning: string;
} {
  const merged = { ...draft.fields, note: draft.note };
  const typed = parseCardFields(draft.type, merged);
  return { type: typed.type, fields: typed.fields, meaning: draft.meaning.trim() };
}
