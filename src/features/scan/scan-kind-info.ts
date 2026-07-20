import type { SFSymbol } from 'expo-symbols';

import { SCAN_KINDS, type ScanKind } from '@/domain/cards';

export interface ScanKindInfo {
  kind: ScanKind;
  label: string;
  description: string;
  icon: SFSymbol;
  photoHint: string;
}

const SPREAD_PHOTO_HINT = 'Photograph the right page first, then the left page of the spread.';

export const SCAN_KIND_INFO: Record<ScanKind, ScanKindInfo> = {
  nouns: {
    kind: 'nouns',
    label: 'Nouns spread',
    description: 'Singular, plurals, synonyms and opposites across a two-page spread.',
    icon: 'character.book.closed',
    photoHint: SPREAD_PHOTO_HINT,
  },
  verbs: {
    kind: 'verbs',
    label: 'Verbs spread',
    description: 'Past, present, command, masdar and participles across a two-page spread.',
    icon: 'arrow.triangle.2.circlepath',
    photoHint: SPREAD_PHOTO_HINT,
  },
  phrases: {
    kind: 'phrases',
    label: 'Phrases page',
    description: 'An Arabic phrase and its English meaning on each row.',
    icon: 'text.quote',
    photoHint: 'Phrases pages are often a single photo. Add a second only for a full spread.',
  },
};

export const SCAN_KIND_INFOS: readonly ScanKindInfo[] = SCAN_KINDS.map(
  (kind) => SCAN_KIND_INFO[kind],
);
