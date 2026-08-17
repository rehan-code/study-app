/**
 * Harakat from knowledge of Arabic rather than from the PDF.
 *
 * The page's own marks are only as good as the glyphs the typesetter left
 * behind, so the importer treats the printed LETTERS as the truth and asks for
 * the vowelling separately: given the letters, the cell's grammatical role
 * (past tense, broken plural, masdar...) and the English meaning, there is one
 * right answer, and it does not depend on the PDF at all.
 *
 * What comes back is never trusted blindly. `chooseVocalized` keeps a proposal
 * only when it is the same word: identical letters once marks, tatweel and
 * spacing are removed. So this pass can add or correct harakat and can clean up
 * the font's presentation forms, but it can never quietly swap in a different
 * word than the one the book prints. It is also monotonic: a proposal that
 * carries fewer marks than the page is dropped, so a vague answer can never
 * strip vowelling the book already had.
 */

/** Everything that sits on a letter: harakat, tanween, shadda, sukun, superscript alif. */
const COMBINING_MARK = /\p{Mn}/gu;

/** Padding, never part of the word. */
const TATWEEL_AND_SPACE = /[\sـ]/g;

/**
 * Letters this book's fonts substitute from Urdu and Persian sets. They print
 * as ordinary Arabic and mean the ordinary Arabic letter, so the guard has to
 * see them as equal or it would reject every proposal touching them.
 */
const LOOKALIKE_LETTERS: Record<string, string> = {
  ھ: 'ه', // U+06BE heh doachashmee
  ہ: 'ه', // U+06C1 heh goal
  ک: 'ك', // U+06A9 keheh
  ی: 'ي', // U+06CC farsi yeh
  ے: 'ي', // U+06D2 yeh barree
};

export interface VocalizableRow {
  fields: Record<string, string | null>;
  meaning: string | null;
  note: string | null;
}

export interface VocalizableLesson {
  nouns: VocalizableRow[];
  verbs: VocalizableRow[];
  phrases: VocalizableRow[];
}

export type ScanKindName = 'nouns' | 'verbs' | 'phrases';

export type FieldKeysByKind = Readonly<Record<ScanKindName, readonly string[]>>;

/** One Arabic cell awaiting its harakat. */
export interface VocalizationTarget {
  index: number;
  /** "verbs.imperative", "nouns.plural1"; what decides the correct vowelling. */
  role: string;
  /** Exactly as the page prints it, harakat and all. */
  text: string;
  /** The row's English meaning, which picks between readings of the letters. */
  meaning: string | null;
}

/**
 * The word behind the vowelling: the letters alone, with the font's quirks
 * folded away. Two spellings share a skeleton when they are the same word.
 */
export function arabicSkeleton(text: string): string {
  const letters = text.normalize('NFKC').replace(COMBINING_MARK, '').replace(TATWEEL_AND_SPACE, '');
  let skeleton = '';
  for (const letter of letters) {
    skeleton += LOOKALIKE_LETTERS[letter] ?? letter;
  }
  return skeleton;
}

function markCount(text: string): number {
  return (text.normalize('NFKC').match(COMBINING_MARK) ?? []).length;
}

/**
 * The form to store: the proposal when it is the same word better vowelled,
 * and the page's own text whenever anything at all looks off.
 */
export function chooseVocalized(bookForm: string, proposed: string | null | undefined): string {
  if (proposed === null || proposed === undefined) {
    return bookForm;
  }
  const candidate = proposed.trim();
  if (candidate === '' || arabicSkeleton(candidate) !== arabicSkeleton(bookForm)) {
    return bookForm;
  }
  const marks = markCount(candidate);
  if (marks === 0 || marks < markCount(bookForm)) {
    return bookForm;
  }
  return candidate;
}

/**
 * Visits every Arabic cell of a batch in one fixed order. Both passes below go
 * through here, so what gets asked about and what gets written back cannot
 * drift out of step.
 */
function forEachArabicCell(
  lessons: readonly VocalizableLesson[],
  fieldKeys: FieldKeysByKind,
  visit: (row: VocalizableRow, key: string, role: string) => void,
): void {
  const kinds: ScanKindName[] = ['nouns', 'verbs', 'phrases'];
  for (const lesson of lessons) {
    for (const kind of kinds) {
      for (const row of lesson[kind]) {
        for (const key of [...fieldKeys[kind], 'note']) {
          const value = key === 'note' ? row.note : (row.fields[key] ?? null);
          if (value === null || value.trim() === '') {
            continue;
          }
          visit(row, key, `${kind}.${key}`);
        }
      }
    }
  }
}

/** Every cell worth vowelling, in the order `applyVocalizations` writes them back. */
export function vocalizationTargets(
  lessons: readonly VocalizableLesson[],
  fieldKeys: FieldKeysByKind,
): VocalizationTarget[] {
  const targets: VocalizationTarget[] = [];
  forEachArabicCell(lessons, fieldKeys, (row, key, role) => {
    const text = key === 'note' ? row.note : row.fields[key];
    targets.push({ index: targets.length, role, text: (text ?? '').trim(), meaning: row.meaning });
  });
  return targets;
}

/**
 * Writes the accepted proposals back into the rows. Cells with no proposal, or
 * whose proposal failed the guard, keep exactly what the page said.
 */
export function applyVocalizations(
  lessons: readonly VocalizableLesson[],
  fieldKeys: FieldKeysByKind,
  proposals: ReadonlyMap<number, string>,
): { changed: number; kept: number } {
  let index = 0;
  let changed = 0;
  let kept = 0;
  forEachArabicCell(lessons, fieldKeys, (row, key) => {
    const bookForm = ((key === 'note' ? row.note : row.fields[key]) ?? '').trim();
    const chosen = chooseVocalized(bookForm, proposals.get(index));
    if (chosen === bookForm) {
      kept += 1;
    } else {
      changed += 1;
      if (key === 'note') {
        row.note = chosen;
      } else {
        row.fields[key] = chosen;
      }
    }
    index += 1;
  });
  return { changed, kept };
}
