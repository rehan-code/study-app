/**
 * Repairs the harakat that pdf.js hands back detached from their word.
 *
 * In this book every mark that sits on a word's FINAL letter is drawn as its
 * own zero-advance glyph, so bidi reordering strands it ahead of the word
 * instead of after it. It arrives one of two ways:
 *
 *   1. as a text item of its own, positioned over the word's last letter, or
 *   2. wedged onto the front of the NEXT item's string.
 *
 * Both land before the word they belong to, so the raw text reads "مُحَمَّد"
 * where the page prints "مُحَمَّدٌ". Tanween only ever falls on a final letter,
 * so left alone this drops every tanween in the book.
 *
 * Marks are reattached in drawing order: each word takes the marks left over
 * from the item drawn just before it. A mark item of kind 1 is anchored over
 * the word it belongs to, so when a stale kind 2 carry is still waiting the
 * anchored item wins and the carry is emitted untouched rather than guessed at.
 */

/** Sits on the previous letter and adds no width of its own. */
const COMBINING_MARK = /^\p{Mn}$/u;

/**
 * Precomposed marks such as U+FC5E (shadda with dammatan) or U+FE77 (tatweel
 * with fatha) decompose to a carrier plus the real marks. The carrier is a
 * space or a tatweel and is only there to hold the mark up.
 */
const MARK_CARRIER = /[\sـ]/g;

/** Arabic base letters, including the presentation forms this PDF is written in. */
const ARABIC_LETTER = /[ؠ-يٮ-ۓۮ-ۿﭐ-﷿ﺀ-ﻼ]/;

/** Marks belong on the last letter, not after the punctuation that follows it. */
const TRAILING_PUNCTUATION = /[\s.,;:!?،؛؟"'()[\]«»]/;

export interface PositionedText {
  text: string;
  x: number;
  y: number;
}

/** The combining marks this character carries, or null if it is not one. */
function marksOf(character: string): string | null {
  const decomposed = character.normalize('NFKC').replace(MARK_CARRIER, '');
  if (decomposed.length === 0) {
    return null;
  }
  for (const part of decomposed) {
    if (!COMBINING_MARK.test(part)) {
      return null;
    }
  }
  return decomposed;
}

/** Splits the displaced marks off the front of an item's text. */
function splitLeadingMarks(text: string): { marks: string; rest: string } {
  const characters = [...text];
  let index = 0;
  let marks = '';
  while (index < characters.length) {
    const found = marksOf(characters[index]);
    if (found === null) {
      break;
    }
    marks += found;
    index += 1;
  }
  return { marks, rest: characters.slice(index).join('') };
}

function withTrailingMarks(word: string, marks: string): string {
  let end = word.length;
  while (end > 0 && TRAILING_PUNCTUATION.test(word[end - 1])) {
    end -= 1;
  }
  return word.slice(0, end) + marks + word.slice(end);
}

/**
 * Reattaches displaced marks to the words they belong to. Items must arrive in
 * the order the page drew them; the caller sorts into reading order afterwards.
 * Marks that cannot be placed are passed through untouched, so nothing the PDF
 * held is dropped here.
 */
export function reattachDisplacedMarks(items: readonly PositionedText[]): PositionedText[] {
  const repaired: PositionedText[] = [];
  let carried: PositionedText | null = null;
  for (const item of items) {
    const { marks, rest } = splitLeadingMarks(item.text);
    if (rest === '') {
      // A mark item of its own: it is drawn over the word it belongs to, so it
      // outranks any carry still waiting from an earlier item.
      if (carried !== null) {
        repaired.push(carried);
      }
      carried = { text: marks, x: item.x, y: item.y };
      continue;
    }
    if (carried !== null && ARABIC_LETTER.test(rest)) {
      repaired.push({ text: withTrailingMarks(rest, carried.text), x: item.x, y: item.y });
    } else {
      if (carried !== null) {
        repaired.push(carried);
      }
      repaired.push({ text: rest, x: item.x, y: item.y });
    }
    carried = marks === '' ? null : { text: marks, x: item.x, y: item.y };
  }
  if (carried !== null) {
    repaired.push(carried);
  }
  return repaired;
}
