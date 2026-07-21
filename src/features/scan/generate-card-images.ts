/** Small pool so a big scan doesn't fire one fal.ai request per card at once. */
const DEFAULT_CONCURRENCY = 3;

export interface GenerateImagesOptions {
  generate: (cardId: string) => Promise<unknown>;
  /** Called after each successful generation so the UI can refresh that card. */
  onImageReady?: (cardId: string) => void;
  concurrency?: number;
}

export interface GenerateImagesResult {
  succeeded: number;
  failed: number;
}

/**
 * Best-effort image generation for freshly saved cards. Failures are swallowed:
 * the card just stays without a picture and the user can generate one manually
 * from the card screen.
 */
export async function generateImagesForCards(
  cardIds: readonly string[],
  options: GenerateImagesOptions,
): Promise<GenerateImagesResult> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const result: GenerateImagesResult = { succeeded: 0, failed: 0 };
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < cardIds.length) {
      const cardId = cardIds[nextIndex];
      nextIndex += 1;
      try {
        await options.generate(cardId);
        result.succeeded += 1;
        options.onImageReady?.(cardId);
      } catch {
        result.failed += 1;
      }
    }
  };

  const workerCount = Math.min(concurrency, cardIds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return result;
}
