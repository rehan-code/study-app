import { describe, expect, it } from 'vitest';

import {
  addPhotos,
  groupHeading,
  groupPhotos,
  MAX_SCAN_PAGES,
  pageLabelForIndex,
  pagesPerGroup,
  photoLabel,
  remainingPhotoSlots,
  removePhotoAt,
  replacePhotoAt,
  swapGroupPages,
  type ScanPhoto,
} from '@/features/scan/photo-selection';

const right: ScanPhoto = { uri: 'file:///right.jpg' };
const left: ScanPhoto = { uri: 'file:///left.jpg' };
const extra: ScanPhoto = { uri: 'file:///extra.jpg' };

function photos(count: number): ScanPhoto[] {
  return Array.from({ length: count }, (_, index) => ({ uri: `file:///page-${index}.jpg` }));
}

describe('pagesPerGroup', () => {
  it('pairs the spread kinds and leaves phrases pages alone', () => {
    expect(pagesPerGroup('nouns')).toBe(2);
    expect(pagesPerGroup('verbs')).toBe(2);
    expect(pagesPerGroup('phrases')).toBe(1);
  });
});

describe('pageLabelForIndex', () => {
  it('labels the order within a group', () => {
    expect(pageLabelForIndex(0)).toBe('Right page');
    expect(pageLabelForIndex(1)).toBe('Left page');
    expect(pageLabelForIndex(2)).toBe('Page 3');
  });
});

describe('groupPhotos', () => {
  it('pairs photos into spreads', () => {
    const groups = groupPhotos(photos(4), 2);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ index: 0, startIndex: 0, photos: photos(4).slice(0, 2) });
    expect(groups[1]).toEqual({ index: 1, startIndex: 2, photos: photos(4).slice(2, 4) });
  });

  it('leaves a trailing lone page as its own group', () => {
    const groups = groupPhotos(photos(3), 2);
    expect(groups).toHaveLength(2);
    expect(groups[1].photos).toHaveLength(1);
    expect(groups[1].startIndex).toBe(2);
  });

  it('gives every photo its own group when the group size is one', () => {
    expect(groupPhotos(photos(3), 1)).toHaveLength(3);
  });

  it('returns nothing for an empty selection', () => {
    expect(groupPhotos([], 2)).toEqual([]);
  });
});

describe('groupHeading', () => {
  it('stays quiet while there is only one group', () => {
    expect(groupHeading('verbs', 0, 1)).toBeNull();
    expect(groupHeading('phrases', 0, 1)).toBeNull();
  });

  it('numbers spreads once there are several', () => {
    expect(groupHeading('verbs', 0, 3)).toBe('Spread 1');
    expect(groupHeading('nouns', 2, 3)).toBe('Spread 3');
  });

  it('leaves standalone pages to their own card label', () => {
    expect(groupHeading('phrases', 1, 2)).toBeNull();
  });
});

describe('photoLabel', () => {
  const spreadLabels = ['Right page', 'Left page'];

  it('names each side of a spread', () => {
    expect(photoLabel('verbs', 0, 0, 2, spreadLabels)).toBe('Right page');
    expect(photoLabel('verbs', 1, 1, 2, spreadLabels)).toBe('Left page');
  });

  it('numbers standalone pages once there are several', () => {
    expect(photoLabel('phrases', 2, 0, 4, ['Phrases page'])).toBe('Page 3');
  });

  it('keeps the plain label for a lone standalone page', () => {
    expect(photoLabel('phrases', 0, 0, 1, ['Phrases page'])).toBe('Phrases page');
  });
});

describe('addPhotos', () => {
  it('appends in order', () => {
    expect(addPhotos([right], [left])).toEqual([right, left]);
  });

  it('caps at the page limit', () => {
    expect(addPhotos(photos(MAX_SCAN_PAGES), [extra])).toHaveLength(MAX_SCAN_PAGES);
    expect(addPhotos(photos(MAX_SCAN_PAGES - 1), [left, extra])).toHaveLength(MAX_SCAN_PAGES);
  });

  it('does not mutate the input', () => {
    const current = [right];
    addPhotos(current, [left]);
    expect(current).toEqual([right]);
  });
});

describe('removePhotoAt', () => {
  it('removes by index', () => {
    expect(removePhotoAt([right, left], 0)).toEqual([left]);
    expect(removePhotoAt([right, left], 1)).toEqual([right]);
  });

  it('ignores out-of-range indexes', () => {
    expect(removePhotoAt([right], 5)).toEqual([right]);
  });
});

describe('replacePhotoAt', () => {
  it('replaces by index without mutating the input', () => {
    const current = [right, left];
    expect(replacePhotoAt(current, 1, extra)).toEqual([right, extra]);
    expect(current).toEqual([right, left]);
  });

  it('ignores out-of-range indexes', () => {
    expect(replacePhotoAt([right], 5, extra)).toEqual([right]);
  });
});

describe('swapGroupPages', () => {
  it('swaps the pair at the given start', () => {
    expect(swapGroupPages([right, left], 0)).toEqual([left, right]);
  });

  it('only touches the group it was given', () => {
    const all = [right, left, extra, right];
    expect(swapGroupPages(all, 2)).toEqual([right, left, right, extra]);
  });

  it('leaves an incomplete group unchanged', () => {
    expect(swapGroupPages([right], 0)).toEqual([right]);
    expect(swapGroupPages([right, left], 1)).toEqual([right, left]);
    expect(swapGroupPages([], 0)).toEqual([]);
  });

  it('does not mutate the input', () => {
    const current = [right, left];
    swapGroupPages(current, 0);
    expect(current).toEqual([right, left]);
  });
});

describe('remainingPhotoSlots', () => {
  it('counts down to zero', () => {
    expect(remainingPhotoSlots([])).toBe(MAX_SCAN_PAGES);
    expect(remainingPhotoSlots(photos(MAX_SCAN_PAGES - 1))).toBe(1);
    expect(remainingPhotoSlots(photos(MAX_SCAN_PAGES))).toBe(0);
  });
});
