import { describe, expect, it } from 'vitest';

import {
  fitContain,
  fullRect,
  isNearlyFullRect,
  moveRect,
  pixelCropRect,
  resizeRect,
  scaleRect,
  usableSize,
  type CropRect,
  type Size,
} from '@/features/scan/crop-geometry';

const bounds: Size = { width: 300, height: 400 };

describe('usableSize', () => {
  it('accepts positive finite dimensions', () => {
    expect(usableSize({ width: 10, height: 20 })).toBe(true);
  });

  it('rejects zero, negative, and non-finite dimensions', () => {
    expect(usableSize({ width: 0, height: 20 })).toBe(false);
    expect(usableSize({ width: 10, height: -1 })).toBe(false);
    expect(usableSize({ width: NaN, height: 20 })).toBe(false);
    expect(usableSize({ width: Infinity, height: 20 })).toBe(false);
  });
});

describe('fitContain', () => {
  it('fits a landscape image by width', () => {
    expect(fitContain({ width: 200, height: 100 }, { width: 100, height: 100 })).toEqual({
      width: 100,
      height: 50,
    });
  });

  it('fits a portrait image by height', () => {
    expect(fitContain({ width: 100, height: 200 }, { width: 100, height: 100 })).toEqual({
      width: 50,
      height: 100,
    });
  });

  it('upscales a small image to fill the container', () => {
    expect(fitContain({ width: 10, height: 10 }, { width: 100, height: 200 })).toEqual({
      width: 100,
      height: 100,
    });
  });

  it('returns zero size for unusable input', () => {
    expect(fitContain({ width: 0, height: 10 }, bounds)).toEqual({ width: 0, height: 0 });
  });
});

describe('moveRect', () => {
  const rect: CropRect = { x: 50, y: 50, width: 100, height: 100 };

  it('shifts by the delta', () => {
    expect(moveRect(rect, 10, -20, bounds)).toEqual({ x: 60, y: 30, width: 100, height: 100 });
  });

  it('clamps to the bounds', () => {
    expect(moveRect(rect, -999, 999, bounds)).toEqual({ x: 0, y: 300, width: 100, height: 100 });
  });

  it('pins an oversized rect at the origin', () => {
    const wide: CropRect = { x: 0, y: 0, width: 500, height: 100 };
    expect(moveRect(wide, 50, 0, bounds).x).toBe(0);
  });
});

describe('resizeRect', () => {
  const rect: CropRect = { x: 100, y: 100, width: 100, height: 100 };

  it('drags the top-left corner and anchors the bottom-right', () => {
    expect(resizeRect(rect, 'topLeft', -50, -30, bounds, 40)).toEqual({
      x: 50,
      y: 70,
      width: 150,
      height: 130,
    });
  });

  it('drags the bottom-right corner and anchors the top-left', () => {
    expect(resizeRect(rect, 'bottomRight', 40, 60, bounds, 40)).toEqual({
      x: 100,
      y: 100,
      width: 140,
      height: 160,
    });
  });

  it('enforces the minimum side', () => {
    const shrunk = resizeRect(rect, 'bottomRight', -999, -999, bounds, 40);
    expect(shrunk).toEqual({ x: 100, y: 100, width: 40, height: 40 });
  });

  it('clamps to the bounds', () => {
    const grown = resizeRect(rect, 'bottomRight', 999, 999, bounds, 40);
    expect(grown).toEqual({ x: 100, y: 100, width: 200, height: 300 });
    const pulled = resizeRect(rect, 'topLeft', -999, -999, bounds, 40);
    expect(pulled).toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });

  it('handles the mixed corners', () => {
    expect(resizeRect(rect, 'topRight', 20, -20, bounds, 40)).toEqual({
      x: 100,
      y: 80,
      width: 120,
      height: 120,
    });
    expect(resizeRect(rect, 'bottomLeft', -20, 20, bounds, 40)).toEqual({
      x: 80,
      y: 100,
      width: 120,
      height: 120,
    });
  });

  it('caps the minimum side at the bounds', () => {
    const tiny: Size = { width: 30, height: 30 };
    const result = resizeRect(
      { x: 0, y: 0, width: 30, height: 30 },
      'bottomRight',
      -99,
      -99,
      tiny,
      40,
    );
    expect(result.width).toBe(30);
    expect(result.height).toBe(30);
  });
});

describe('scaleRect', () => {
  it('maps between coordinate spaces', () => {
    const rect: CropRect = { x: 10, y: 20, width: 30, height: 40 };
    expect(scaleRect(rect, { width: 100, height: 100 }, { width: 200, height: 50 })).toEqual({
      x: 20,
      y: 10,
      width: 60,
      height: 20,
    });
  });

  it('falls back to the full target for unusable spaces', () => {
    const rect: CropRect = { x: 10, y: 10, width: 10, height: 10 };
    expect(scaleRect(rect, { width: 0, height: 0 }, { width: 50, height: 50 })).toEqual(
      fullRect({ width: 50, height: 50 }),
    );
  });
});

describe('pixelCropRect', () => {
  it('rounds to integers', () => {
    expect(pixelCropRect({ x: 10.4, y: 19.6, width: 100.2, height: 49.5 }, bounds)).toEqual({
      originX: 10,
      originY: 20,
      width: 100,
      height: 50,
    });
  });

  it('clamps to the image so the rect never overflows', () => {
    expect(pixelCropRect({ x: 250, y: 380, width: 100, height: 100 }, bounds)).toEqual({
      originX: 250,
      originY: 380,
      width: 50,
      height: 20,
    });
  });

  it('never collapses below one pixel', () => {
    const result = pixelCropRect({ x: -10, y: -10, width: 0, height: 0 }, bounds);
    expect(result).toEqual({ originX: 0, originY: 0, width: 1, height: 1 });
  });
});

describe('isNearlyFullRect', () => {
  it('accepts the exact full rect', () => {
    expect(isNearlyFullRect(fullRect(bounds), bounds)).toBe(true);
  });

  it('accepts a rect within the tolerance', () => {
    expect(isNearlyFullRect({ x: 1, y: 0.5, width: 298.5, height: 399 }, bounds, 2)).toBe(true);
  });

  it('rejects a real crop', () => {
    expect(isNearlyFullRect({ x: 20, y: 0, width: 280, height: 400 }, bounds, 2)).toBe(false);
  });
});
