import { describe, expect, it } from 'vitest';

import { wordKey as appWordKey, type WordSeed as AppWordSeed } from '@/domain/word-key';
import { startingProgress, studiedProgressByWord, wordKey, type WordProgress } from './word-key.ts';

const REVIEWED_AT = '2026-07-06T10:00:00+00:00';

type RawFields = Record<string, string | null>;

interface StudiedRow extends WordProgress {
  type: string;
  fields: RawFields;
  meaning: string;
}

function row(arabic: string, meaning: string, progress: Partial<WordProgress> = {}): StudiedRow {
  return {
    type: 'vocab',
    fields: { arabic, plural1: null, note: null },
    meaning,
    box: 0,
    due_at: REVIEWED_AT,
    correct_count: 0,
    incorrect_count: 0,
    last_reviewed_at: REVIEWED_AT,
    ...progress,
  };
}

/** The same raw row as the app's card schemas would hold it. */
function appSeed(type: AppWordSeed['type'], fields: RawFields, meaning: string): AppWordSeed {
  if (type === 'verb') {
    return {
      type,
      fields: {
        past: fields.past ?? '',
        preposition: fields.preposition ?? null,
        present: null,
        imperative: null,
        masdar: null,
        activeParticiple: null,
        passiveParticiple: null,
        note: null,
      },
      meaning,
    };
  }
  if (type === 'phrase') {
    return { type, fields: { arabic: fields.arabic ?? '', note: null }, meaning };
  }
  return {
    type,
    fields: {
      arabic: fields.arabic ?? '',
      plural1: null,
      plural2: null,
      synonym: null,
      synonymPlural: null,
      antonym: null,
      antonymPlural: null,
      note: null,
    },
    meaning,
  };
}

/** Both sides must agree, or the same word would import as new from the PDF path only. */
describe('word-key mirrors src/domain/word-key.ts', () => {
  const cases: { label: string; type: AppWordSeed['type']; fields: RawFields; meaning: string }[] =
    [
      { label: 'vowelled noun', type: 'vocab', fields: { arabic: 'بَيْتٌ' }, meaning: 'House' },
      { label: 'bare noun', type: 'vocab', fields: { arabic: 'بيت' }, meaning: 'house' },
      { label: 'tatweel noun', type: 'vocab', fields: { arabic: 'بـيت' }, meaning: '  House ' },
      {
        label: 'verb with a preposition',
        type: 'verb',
        fields: { past: 'ذَهَبَ', preposition: 'إِلَى' },
        meaning: 'To go',
      },
      {
        label: 'phrase',
        type: 'phrase',
        fields: { arabic: 'مَا شَاءَ اللَّهُ' },
        meaning: 'God willed it',
      },
      { label: 'row with no meaning', type: 'vocab', fields: { arabic: 'بَيْت' }, meaning: '  ' },
      { label: 'row with no Arabic', type: 'vocab', fields: { arabic: '' }, meaning: 'House' },
    ];
  for (const { label, type, fields, meaning } of cases) {
    it(`agrees on the ${label}`, () => {
      expect(wordKey({ type, fields, meaning })).toBe(appWordKey(appSeed(type, fields, meaning)));
    });
  }
});

describe('studiedProgressByWord', () => {
  it('leaves out cards that have never been answered', () => {
    expect(studiedProgressByWord([row('بَيْت', 'House', { last_reviewed_at: null })]).size).toBe(0);
  });

  it('keeps the copy that is furthest along', () => {
    const byWord = studiedProgressByWord([
      row('بَيْت', 'House', { box: 2 }),
      row('بيت', 'house', { box: 5 }),
    ]);
    expect([...byWord.values()].map((progress) => progress.box)).toEqual([5]);
  });

  it('breaks a tie on box with the most recent answer', () => {
    const later = '2026-08-01T10:00:00+00:00';
    const byWord = studiedProgressByWord([
      row('بَيْت', 'House', { box: 3, last_reviewed_at: later }),
      row('بَيْت', 'House', { box: 3 }),
    ]);
    expect([...byWord.values()].map((progress) => progress.last_reviewed_at)).toEqual([later]);
  });
});

describe('startingProgress', () => {
  const nowIso = '2026-09-01T09:00:00.000Z';
  const studied = studiedProgressByWord([row('بَيْتٌ', 'House', { box: 4, correct_count: 6 })]);

  it('carries the progress of a word the collection already knows', () => {
    const start = startingProgress(
      studied,
      { type: 'vocab', fields: { arabic: 'بيت' }, meaning: 'house' },
      nowIso,
    );
    expect(start).toEqual({
      box: 4,
      due_at: REVIEWED_AT,
      correct_count: 6,
      incorrect_count: 0,
      last_reviewed_at: REVIEWED_AT,
    });
  });

  it('starts a genuinely new word from scratch', () => {
    const start = startingProgress(
      studied,
      { type: 'vocab', fields: { arabic: 'مَدْرَسَة' }, meaning: 'School' },
      nowIso,
    );
    expect(start).toEqual({
      box: 0,
      due_at: nowIso,
      correct_count: 0,
      incorrect_count: 0,
      last_reviewed_at: null,
    });
  });
});
