import { describe, expect, it } from 'vitest';

import { reattachDisplacedMarks, type PositionedText } from './arabic-marks.ts';

const FATHA = 'َ';
const DAMMA = 'ُ';
const KASRA = 'ِ';
const SHADDA = 'ّ';
const DAMMATAN = 'ٌ';

/** Precomposed forms this book's font uses: the mark rides a space or a tatweel. */
const SHADDA_WITH_DAMMATAN = 'ﱞ';
const TATWEEL_WITH_FATHA = 'ﹷ';

function at(text: string, x: number, y = 600): PositionedText {
  return { text, x, y };
}

describe('reattachDisplacedMarks', () => {
  it('puts a mark drawn as its own item onto the word that follows it', () => {
    const repaired = reattachDisplacedMarks([at(DAMMATAN, 509), at('مُحَمَّد', 508)]);

    expect(repaired).toEqual([{ text: 'مُحَمَّد' + DAMMATAN, x: 508, y: 600 }]);
  });

  it('moves a mark stranded on the front of an item onto the next word', () => {
    // How a vocabulary row arrives: the singular's tanween is wedged onto the
    // front of the plural, which is drawn before it.
    const repaired = reattachDisplacedMarks([
      at(DAMMATAN, 359),
      at(DAMMATAN + 'أُسَر', 357),
      at('أُسْرَة', 496),
    ]);

    expect(repaired.map((item) => item.text)).toEqual(['أُسَر' + DAMMATAN, 'أُسْرَة' + DAMMATAN]);
  });

  it('carries a mark through a whole run of table cells', () => {
    const repaired = reattachDisplacedMarks([
      at(DAMMA, 231),
      at(DAMMA + 'الجَمْع', 229),
      at('الأَوَّل', 335),
    ]);

    expect(repaired.map((item) => item.text)).toEqual(['الجَمْع' + DAMMA, 'الأَوَّل' + DAMMA]);
  });

  it('unpacks a precomposed shadda and tanween onto the word', () => {
    const repaired = reattachDisplacedMarks([at(SHADDA_WITH_DAMMATAN, 516), at('عَلِي', 514)]);

    expect(repaired.map((item) => item.text)).toEqual(['عَلِي' + DAMMATAN + SHADDA]);
  });

  it('drops the tatweel a precomposed mark rides on', () => {
    const repaired = reattachDisplacedMarks([at(TATWEEL_WITH_FATHA, 371), at('كَان', 368)]);

    expect(repaired.map((item) => item.text)).toEqual(['كَان' + FATHA]);
  });

  it('lets a mark drawn over a word outrank a mark still being carried', () => {
    // The carried fatha has no target here; the kasra is drawn over أَمْر, so it
    // wins, and the fatha is passed through rather than guessed onto a word.
    const repaired = reattachDisplacedMarks([
      at(FATHA + 'أَمْر', 267),
      at(KASRA, 293),
      at('مُخَالَفَة', 292),
    ]);

    expect(repaired.map((item) => item.text)).toEqual(['أَمْر', FATHA, 'مُخَالَفَة' + KASRA]);
  });

  it('puts the mark on the last letter, not after the punctuation', () => {
    const repaired = reattachDisplacedMarks([at(KASRA, 360), at('اللَّه،', 358)]);

    expect(repaired.map((item) => item.text)).toEqual(['اللَّه' + KASRA + '،']);
  });

  it('never hands a mark to a neighbouring English cell', () => {
    const repaired = reattachDisplacedMarks([at(DAMMATAN, 300), at('Family', 67)]);

    expect(repaired.map((item) => item.text)).toEqual([DAMMATAN, 'Family']);
  });

  it('keeps a mark that has no word after it at all', () => {
    const repaired = reattachDisplacedMarks([at('كِتَاب', 500), at(DAMMATAN, 480)]);

    expect(repaired.map((item) => item.text)).toEqual(['كِتَاب', DAMMATAN]);
  });

  it('leaves text that needs no repair exactly as it was', () => {
    const items = [at('مُسْتَشْفَيَات' + DAMMATAN, 340), at('Hospital', 62), at('.', 245)];

    expect(reattachDisplacedMarks(items)).toEqual(items);
  });

  it('leaves a tatweel diacritic legend alone as printed content', () => {
    // The grammar notes print bare marks on a tatweel to name them. The tatweel
    // leads, so there is no stranded haraka on the front to move.
    const legend = 'ـــ' + KASRA + 'ــ';

    expect(reattachDisplacedMarks([at(legend, 449)]).map((item) => item.text)).toEqual([legend]);
  });

  it('does not mutate the items it was given', () => {
    const items = [at(DAMMATAN, 509), at('مُحَمَّد', 508)];

    reattachDisplacedMarks(items);

    expect(items.map((item) => item.text)).toEqual([DAMMATAN, 'مُحَمَّد']);
  });
});
