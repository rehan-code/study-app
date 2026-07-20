import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_SIDE_PX, resizeTargetFor } from '@/features/scan/image-sizing';

describe('resizeTargetFor', () => {
  it('returns null when the image already fits', () => {
    expect(resizeTargetFor(2048, 1536)).toBeNull();
    expect(resizeTargetFor(800, 600)).toBeNull();
  });

  it('caps the width of landscape images', () => {
    expect(resizeTargetFor(4032, 3024)).toEqual({ width: MAX_UPLOAD_SIDE_PX });
  });

  it('caps the height of portrait images', () => {
    expect(resizeTargetFor(3024, 4032)).toEqual({ height: MAX_UPLOAD_SIDE_PX });
  });

  it('treats square images as width-capped', () => {
    expect(resizeTargetFor(3000, 3000)).toEqual({ width: MAX_UPLOAD_SIDE_PX });
  });

  it('returns null for unusable dimensions', () => {
    expect(resizeTargetFor(0, 4000)).toBeNull();
    expect(resizeTargetFor(4000, -1)).toBeNull();
    expect(resizeTargetFor(Number.NaN, 4000)).toBeNull();
  });

  it('respects a custom ceiling', () => {
    expect(resizeTargetFor(1200, 900, 1000)).toEqual({ width: 1000 });
  });
});
