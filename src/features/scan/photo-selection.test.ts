import { describe, expect, it } from 'vitest';

import {
  addPhotos,
  MAX_SCAN_PAGES,
  pageLabelForIndex,
  remainingPhotoSlots,
  removePhotoAt,
  replacePhotoAt,
  swapPhotos,
  type ScanPhoto,
} from '@/features/scan/photo-selection';

const right: ScanPhoto = { uri: 'file:///right.jpg' };
const left: ScanPhoto = { uri: 'file:///left.jpg' };
const extra: ScanPhoto = { uri: 'file:///extra.jpg' };

describe('pageLabelForIndex', () => {
  it('labels the spread order', () => {
    expect(pageLabelForIndex(0)).toBe('Right page');
    expect(pageLabelForIndex(1)).toBe('Left page');
    expect(pageLabelForIndex(2)).toBe('Page 3');
  });
});

describe('addPhotos', () => {
  it('appends in order', () => {
    expect(addPhotos([right], [left])).toEqual([right, left]);
  });

  it('caps at the page limit', () => {
    expect(addPhotos([right, left], [extra])).toHaveLength(MAX_SCAN_PAGES);
    expect(addPhotos([right], [left, extra])).toEqual([right, left]);
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

describe('swapPhotos', () => {
  it('swaps a pair', () => {
    expect(swapPhotos([right, left])).toEqual([left, right]);
  });

  it('leaves shorter lists unchanged', () => {
    expect(swapPhotos([right])).toEqual([right]);
    expect(swapPhotos([])).toEqual([]);
  });
});

describe('remainingPhotoSlots', () => {
  it('counts down to zero', () => {
    expect(remainingPhotoSlots([])).toBe(2);
    expect(remainingPhotoSlots([right])).toBe(1);
    expect(remainingPhotoSlots([right, left])).toBe(0);
  });
});
