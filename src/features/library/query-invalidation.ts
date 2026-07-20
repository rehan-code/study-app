import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queries';

const [CARDS_KEY_ROOT, CARD_BY_ID_SEGMENT] = queryKeys.card('');

export const CARD_IMAGES_BUCKET = 'card-images' as const;

/** Refetches every card query: the byId caches and all filtered lists. */
export function invalidateAllCardQueries(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: [CARDS_KEY_ROOT] });
}

export function invalidateLessonQueries(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: queryKeys.lessons });
}

/** Forces a fresh signed URL so a regenerated image (same storage path) reloads. */
export function invalidateCardImageUrl(client: QueryClient, path: string): Promise<void> {
  return client.invalidateQueries({ queryKey: queryKeys.signedUrl(CARD_IMAGES_BUCKET, path) });
}

/**
 * After deleting a card: refresh the list queries, but never refetch the
 * deleted card's byId query (its observer may still be mounted for a frame
 * and a refetch would 404).
 */
export async function invalidateAfterCardDelete(
  client: QueryClient,
  cardId: string,
): Promise<void> {
  await client.invalidateQueries({ queryKey: queryKeys.card(cardId), refetchType: 'none' });
  await client.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === CARDS_KEY_ROOT && query.queryKey[1] !== CARD_BY_ID_SEGMENT,
  });
}
