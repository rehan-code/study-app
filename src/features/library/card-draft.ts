import {
  FIELD_LABELS,
  parseCardFields,
  type Card,
  type CardFields,
  type CardType,
} from '@/domain/cards';

/** Editable working copy of a card's content; empty string stands for a null field. */
export interface CardDraft {
  fields: Record<string, string>;
  meaning: string;
}

/** The field that becomes the flashcard headline and must not be empty. */
export function headlineFieldKey(type: CardType): string {
  return type === 'verb' ? 'past' : 'arabic';
}

export function draftFromCard(card: Card): CardDraft {
  const values = card.fields as Record<string, string | null>;
  const fields: Record<string, string> = {};
  for (const def of FIELD_LABELS[card.type]) {
    fields[def.key] = values[def.key] ?? '';
  }
  return { fields, meaning: card.meaning };
}

export function isDraftDirty(card: Card, draft: CardDraft): boolean {
  const original = draftFromCard(card);
  if (draft.meaning !== original.meaning) {
    return true;
  }
  return FIELD_LABELS[card.type].some(
    (def) => (draft.fields[def.key] ?? '') !== original.fields[def.key],
  );
}

export type CardDraftProblem = 'missing_headline' | 'missing_meaning';

export function validateCardDraft(type: CardType, draft: CardDraft): CardDraftProblem | null {
  if ((draft.fields[headlineFieldKey(type)] ?? '').trim() === '') {
    return 'missing_headline';
  }
  if (draft.meaning.trim() === '') {
    return 'missing_meaning';
  }
  return null;
}

export function describeCardDraftProblem(problem: CardDraftProblem): string {
  if (problem === 'missing_headline') {
    return 'Fill in the Arabic to save.';
  }
  return 'Fill in the meaning to save.';
}

/**
 * Normalizes the draft through the card field schemas ('' and '-' become null,
 * values are trimmed). Callers must run validateCardDraft first; an empty
 * headline makes the schema throw.
 */
export function draftToCardFields(type: CardType, draft: CardDraft): CardFields {
  return parseCardFields(type, draft.fields).fields;
}
