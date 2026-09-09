import { arabicSkeleton } from './vocalize.ts';

/**
 * Word identity, so a word the collection already holds is not imported as a
 * brand new one. Two rows teach the same word when their Arabic letters and
 * their English meaning agree: the same word rarely prints identically twice
 * across a book, so harakat, tatweel and letter case are all ignored.
 *
 * Mirror of src/domain/word-key.ts (Deno functions cannot import from src/).
 * Keep both files in sync; word-key.test.ts checks that they agree key for key.
 */

/** The field each card type is named by; the app's cardHeadline picks the same one. */
const HEADWORD_FIELD: Record<string, string> = {
  vocab: 'arabic',
  verb: 'past',
  phrase: 'arabic',
};

export interface WordSeed {
  type: string;
  fields: Record<string, string | null>;
  meaning: string;
}

/** Progress as the cards table stores it. */
export interface WordProgress {
  box: number;
  due_at: string;
  correct_count: number;
  incorrect_count: number;
  last_reviewed_at: string | null;
}

/**
 * The word a row is about. Plurals, participles and prepositions vary between
 * printings of the same entry, so identity rests on the headword alone.
 */
function headword(seed: WordSeed): string | null {
  const field = HEADWORD_FIELD[seed.type];
  if (field === undefined) {
    return null;
  }
  return seed.fields[field] ?? null;
}

/** Stable id for the word a row teaches, or null when it teaches no word. */
export function wordKey(seed: WordSeed): string | null {
  const arabic = arabicSkeleton(headword(seed) ?? '');
  const meaning = seed.meaning.trim().toLowerCase().replace(/\s+/g, ' ');
  if (arabic.length === 0 || meaning.length === 0) {
    return null;
  }
  return `${arabic}|${meaning}`;
}

/** Later progress wins; between two boxes the higher one is what the user knows. */
function isBetterProgress(candidate: WordProgress, current: WordProgress): boolean {
  if (candidate.box !== current.box) {
    return candidate.box > current.box;
  }
  const candidateAt = Date.parse(candidate.last_reviewed_at ?? '');
  const currentAt = Date.parse(current.last_reviewed_at ?? '');
  return (Number.isNaN(candidateAt) ? 0 : candidateAt) > (Number.isNaN(currentAt) ? 0 : currentAt);
}

/**
 * Progress the collection already has for each word it knows, best copy per
 * word. Never-answered cards are left out: a word carries nothing an import
 * could inherit until it has been studied at least once.
 */
export function studiedProgressByWord(
  rows: readonly (WordSeed & WordProgress)[],
): Map<string, WordProgress> {
  const byKey = new Map<string, WordProgress>();
  for (const row of rows) {
    if (row.last_reviewed_at === null) {
      continue;
    }
    const key = wordKey(row);
    if (key === null) {
      continue;
    }
    const current = byKey.get(key);
    if (current === undefined || isBetterProgress(row, current)) {
      byKey.set(key, {
        box: row.box,
        due_at: row.due_at,
        correct_count: row.correct_count,
        incorrect_count: row.incorrect_count,
        last_reviewed_at: row.last_reviewed_at,
      });
    }
  }
  return byKey;
}

/**
 * What an imported row starts at: the progress of the word the collection
 * already knows, so a word that turns up again in a later lesson is not a new
 * word all over again, or a clean slate when it is genuinely new.
 */
export function startingProgress(
  studied: ReadonlyMap<string, WordProgress>,
  seed: WordSeed,
  nowIso: string,
): WordProgress {
  const key = wordKey(seed);
  const inherited = key === null ? undefined : studied.get(key);
  return (
    inherited ?? {
      box: 0,
      due_at: nowIso,
      correct_count: 0,
      incorrect_count: 0,
      last_reviewed_at: null,
    }
  );
}
