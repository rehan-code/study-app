import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { generateImagesForCards } from '@/features/scan/generate-card-images';
import { generateCardImage } from '@/lib/api';
import { listCardIdsWithoutImages, queryKeys } from '@/lib/queries';

export const missingImagesKey = ['cards', 'missing-images'] as const;

export interface MissingCardImages {
  /** Cards with pictures switched on that still have none. */
  missing: number;
  loading: boolean;
  loadError: string | null;
  running: boolean;
  /** Progress line while generating, or the result once finished. */
  status: string | null;
  /** The whole row's secondary line, so the route stays free of copy logic. */
  summary: string;
  generate: () => void;
}

function describeMissing(missing: number): string {
  if (missing === 0) {
    return 'Every card has a picture';
  }
  return missing === 1 ? '1 card has none yet' : `${missing} cards have none yet`;
}

/**
 * Fills in pictures for cards that never got one: everything imported from a
 * book (the edge function that reads pages never calls fal.ai) plus anything
 * whose generation failed at scan review. Best effort per card, so one refusal
 * does not stop the rest.
 */
export function useMissingCardImages(): MissingCardImages {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const runningRef = useRef(false);

  const query = useQuery({
    queryKey: missingImagesKey,
    queryFn: listCardIdsWithoutImages,
  });

  const generate = useCallback(() => {
    const cardIds = query.data;
    if (runningRef.current || cardIds === undefined || cardIds.length === 0) {
      return;
    }
    runningRef.current = true;
    setRunning(true);
    let made = 0;
    setStatus(`Making pictures, 0 of ${cardIds.length}`);
    void generateImagesForCards(cardIds, {
      generate: generateCardImage,
      onImageReady: (cardId) => {
        made += 1;
        setStatus(`Making pictures, ${made} of ${cardIds.length}`);
        void queryClient.invalidateQueries({ queryKey: queryKeys.cards([]) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.card(cardId) });
      },
    }).then((result) => {
      runningRef.current = false;
      setRunning(false);
      setStatus(
        result.failed === 0
          ? `Added ${result.succeeded} pictures.`
          : `Added ${result.succeeded} pictures; ${result.failed} could not be made.`,
      );
      void queryClient.invalidateQueries({ queryKey: missingImagesKey });
    });
  }, [query.data, queryClient]);

  const missing = query.data?.length ?? 0;
  let summary: string;
  if (status !== null) {
    summary = status;
  } else if (query.isPending) {
    summary = 'Counting your cards';
  } else if (query.isError) {
    summary = "Couldn't check your cards";
  } else {
    summary = describeMissing(missing);
  }

  return {
    missing,
    loading: query.isPending,
    loadError: query.isError ? query.error.message : null,
    running,
    status,
    summary,
    generate,
  };
}
