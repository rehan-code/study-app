import type { CardFields, CardType } from '@/domain/cards';
import { isNew, newSrsState, type SrsState } from '@/domain/srs';

/**
 * Word identity, so a word the collection already holds is not imported as a
 * brand new one. Two rows teach the same word when their Arabic letters and
 * their English meaning agree: the same word rarely prints identically twice
 * across a book, so harakat, tatweel and letter case are all ignored.
 *
 * A mirror copy lives at supabase/functions/_shared/word-key.ts (Deno cannot
 * import from src/); keep both files in sync. The mirror's test checks that
 * the two agree key for key.
 */

/** Everything that sits on a letter: harakat, tanween, shadda, sukun, superscript alif. */
const COMBINING_MARK = /\p{Mn}/gu;

/** Padding, never part of the word. */
const TATWEEL_AND_SPACE = /[\sـ]/g;

/** Letters this book's fonts substitute from Urdu and Persian sets. */
const LOOKALIKE_LETTERS: Record<string, string> = {
  ھ: 'ه',
  ہ: 'ه',
  ک: 'ك',
  ی: 'ي',
  ے: 'ي',
};

/** Mirror of arabicSkeleton in supabase/functions/_shared/vocalize.ts. */
function arabicSkeleton(text: string): string {
  const letters = text.normalize('NFKC').replace(COMBINING_MARK, '').replace(TATWEEL_AND_SPACE, '');
  let skeleton = '';
  for (const letter of letters) {
    skeleton += LOOKALIKE_LETTERS[letter] ?? letter;
  }
  return skeleton;
}

export interface WordSeed {
  type: CardType;
  fields: CardFields;
  meaning: string;
}

/**
 * The word a row is about. Plurals, participles and prepositions vary between
 * printings of the same entry, so identity rests on the headword alone.
 */
function headword(seed: WordSeed): string | null {
  if (seed.type === 'verb') {
    return 'past' in seed.fields ? seed.fields.past : null;
  }
  return 'arabic' in seed.fields ? seed.fields.arabic : null;
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
function isBetterProgress(candidate: SrsState, current: SrsState): boolean {
  if (candidate.box !== current.box) {
    return candidate.box > current.box;
  }
  const candidateAt = candidate.lastReviewedAt?.getTime() ?? 0;
  const currentAt = current.lastReviewedAt?.getTime() ?? 0;
  return candidateAt > currentAt;
}

/**
 * Progress the collection already has for each word it knows, best copy per
 * word. Never-answered cards are left out: a word carries nothing an import
 * could inherit until it has been studied at least once.
 */
export function studiedProgressByWord(
  cards: readonly (WordSeed & { srs: SrsState })[],
): Map<string, SrsState> {
  const byKey = new Map<string, SrsState>();
  for (const card of cards) {
    if (isNew(card.srs)) {
      continue;
    }
    const key = wordKey(card);
    if (key === null) {
      continue;
    }
    const current = byKey.get(key);
    if (current === undefined || isBetterProgress(card.srs, current)) {
      byKey.set(key, card.srs);
    }
  }
  return byKey;
}

/**
 * What an imported row starts at: the progress of the word the collection
 * already knows, so a word that turns up again in a later lesson is not a new
 * word all over again, or a clean slate when it is genuinely new.
 */
export function startingSrs(
  studied: ReadonlyMap<string, SrsState>,
  seed: WordSeed,
  now: Date,
): SrsState {
  const key = wordKey(seed);
  const inherited = key === null ? undefined : studied.get(key);
  return inherited ?? newSrsState(now);
}
