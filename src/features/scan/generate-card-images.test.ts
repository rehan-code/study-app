import { describe, expect, it } from 'vitest';

import { generateImagesForCards } from '@/features/scan/generate-card-images';

describe('generateImagesForCards', () => {
  it('generates an image for every card and reports success', async () => {
    const generated: string[] = [];
    const ready: string[] = [];
    const result = await generateImagesForCards(['a', 'b', 'c'], {
      generate: (cardId) => {
        generated.push(cardId);
        return Promise.resolve();
      },
      onImageReady: (cardId) => {
        ready.push(cardId);
      },
    });
    expect(result).toEqual({ succeeded: 3, failed: 0 });
    expect(generated.sort()).toEqual(['a', 'b', 'c']);
    expect(ready.sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps going when a generation fails and counts it', async () => {
    const ready: string[] = [];
    const result = await generateImagesForCards(['a', 'b', 'c'], {
      generate: (cardId) => {
        if (cardId === 'b') {
          return Promise.reject(new Error('fal is down'));
        }
        return Promise.resolve();
      },
      onImageReady: (cardId) => {
        ready.push(cardId);
      },
      concurrency: 1,
    });
    expect(result).toEqual({ succeeded: 2, failed: 1 });
    expect(ready).toEqual(['a', 'c']);
  });

  it('never runs more than the configured concurrency at once', async () => {
    let running = 0;
    let peak = 0;
    const result = await generateImagesForCards(['a', 'b', 'c', 'd', 'e'], {
      generate: async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => {
          setTimeout(resolve, 1);
        });
        running -= 1;
      },
      concurrency: 2,
    });
    expect(result).toEqual({ succeeded: 5, failed: 0 });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('handles an empty card list without calling the generator', async () => {
    const result = await generateImagesForCards([], {
      generate: () => Promise.reject(new Error('should not be called')),
    });
    expect(result).toEqual({ succeeded: 0, failed: 0 });
  });
});
