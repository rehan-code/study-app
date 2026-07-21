export interface Size {
  width: number;
  height: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function usableSize(size: Size): boolean {
  return (
    Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
  );
}

/** Largest size with `image`'s aspect ratio that fits inside `container`. */
export function fitContain(image: Size, container: Size): Size {
  if (!usableSize(image) || !usableSize(container)) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(container.width / image.width, container.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

export function fullRect(bounds: Size): CropRect {
  return { x: 0, y: 0, width: bounds.width, height: bounds.height };
}

/** Shifts the rect by the drag delta, keeping it fully inside the bounds. */
export function moveRect(rect: CropRect, dx: number, dy: number, bounds: Size): CropRect {
  return {
    x: clamp(rect.x + dx, 0, Math.max(0, bounds.width - rect.width)),
    y: clamp(rect.y + dy, 0, Math.max(0, bounds.height - rect.height)),
    width: rect.width,
    height: rect.height,
  };
}

/** Drags one corner by the delta; the opposite corner stays anchored. */
export function resizeRect(
  rect: CropRect,
  corner: CropCorner,
  dx: number,
  dy: number,
  bounds: Size,
  minSide: number,
): CropRect {
  const min = Math.max(1, Math.min(minSide, bounds.width, bounds.height));
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (corner === 'topLeft' || corner === 'bottomLeft') {
    left = clamp(left + dx, 0, right - min);
  } else {
    right = clamp(right + dx, left + min, bounds.width);
  }
  if (corner === 'topLeft' || corner === 'topRight') {
    top = clamp(top + dy, 0, bottom - min);
  } else {
    bottom = clamp(bottom + dy, top + min, bounds.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Maps a rect between coordinate spaces (e.g. on-screen points to image pixels). */
export function scaleRect(rect: CropRect, from: Size, to: Size): CropRect {
  if (!usableSize(from) || !usableSize(to)) {
    return fullRect(to);
  }
  const scaleX = to.width / from.width;
  const scaleY = to.height / from.height;
  return {
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  };
}

export interface PixelCropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** Integer crop rect clamped inside the image, as the image manipulator expects. */
export function pixelCropRect(rect: CropRect, image: Size): PixelCropRect {
  const imageWidth = Math.max(1, Math.round(image.width));
  const imageHeight = Math.max(1, Math.round(image.height));
  const originX = clamp(Math.round(rect.x), 0, imageWidth - 1);
  const originY = clamp(Math.round(rect.y), 0, imageHeight - 1);
  return {
    originX,
    originY,
    width: clamp(Math.round(rect.width), 1, imageWidth - originX),
    height: clamp(Math.round(rect.height), 1, imageHeight - originY),
  };
}

/** True when the rect covers (almost) the whole bounds, so cropping is a no-op. */
export function isNearlyFullRect(rect: CropRect, bounds: Size, tolerance = 1): boolean {
  return (
    rect.x <= tolerance &&
    rect.y <= tolerance &&
    rect.x + rect.width >= bounds.width - tolerance &&
    rect.y + rect.height >= bounds.height - tolerance
  );
}
