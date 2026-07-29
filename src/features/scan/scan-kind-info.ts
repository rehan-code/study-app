import type { SFSymbol } from 'expo-symbols';

import { SCAN_KINDS, type ScanKind } from '@/domain/cards';

export interface ScanPageInfo {
  label: string;
  hint: string;
}

export interface ScanKindInfo {
  kind: ScanKind;
  label: string;
  description: string;
  icon: SFSymbol;
  photoHint: string;
  pages: readonly ScanPageInfo[];
}

const SPREAD_PHOTO_HINT =
  'The book reads right to left, so each spread begins on the right-hand page. Photograph that one first, then the left-hand page. Add another pair for every further spread; they are read in order as one long table.';

export const SCAN_KIND_INFO: Record<ScanKind, ScanKindInfo> = {
  nouns: {
    kind: 'nouns',
    label: 'Nouns spread',
    description: 'Singular, plurals, synonyms and opposites across a two-page spread.',
    icon: 'character.book.closed',
    photoHint: SPREAD_PHOTO_HINT,
    pages: [
      { label: 'Right page', hint: 'Where the spread begins: singular, plurals, and meaning.' },
      { label: 'Left page', hint: 'The facing page: synonym and opposite with their plurals.' },
    ],
  },
  verbs: {
    kind: 'verbs',
    label: 'Verbs spread',
    description: 'Past, present, command, masdar and participles across a two-page spread.',
    icon: 'arrow.triangle.2.circlepath',
    photoHint: SPREAD_PHOTO_HINT,
    pages: [
      { label: 'Right page', hint: 'Where the spread begins: past, present, command, masdar.' },
      { label: 'Left page', hint: 'The facing page: participles and the "To ..." meaning.' },
    ],
  },
  phrases: {
    kind: 'phrases',
    label: 'Phrases page',
    description: 'An Arabic phrase and its English meaning on each row.',
    icon: 'text.quote',
    photoHint:
      'One photo per phrases page. Add as many as you like; their rows are read top to bottom, page after page.',
    pages: [{ label: 'Phrases page', hint: 'Arabic phrase and English meaning on each row.' }],
  },
};

export const SCAN_KIND_INFOS: readonly ScanKindInfo[] = SCAN_KINDS.map(
  (kind) => SCAN_KIND_INFO[kind],
);
