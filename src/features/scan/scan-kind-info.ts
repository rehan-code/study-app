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
  'The book reads right to left, so the spread begins on the right-hand page. Photograph that one first, then the left-hand page.';

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
    photoHint: 'Phrases pages are often a single photo. Add a second only for a full spread.',
    pages: [
      { label: 'First page', hint: 'Usually the only photo you need.' },
      { label: 'Second page', hint: 'Only for phrases continuing across the spread.' },
    ],
  },
};

export const SCAN_KIND_INFOS: readonly ScanKindInfo[] = SCAN_KINDS.map(
  (kind) => SCAN_KIND_INFO[kind],
);
