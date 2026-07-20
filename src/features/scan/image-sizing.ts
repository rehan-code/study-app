export const MAX_UPLOAD_SIDE_PX = 2048;
export const UPLOAD_JPEG_QUALITY = 0.8;

export interface ResizeTarget {
  width?: number;
  height?: number;
}

/**
 * Target for downscaling the longest side to the upload ceiling while the
 * manipulator preserves aspect ratio. Returns null when the image is already
 * small enough (never upscale) or the dimensions are unusable.
 */
export function resizeTargetFor(
  width: number,
  height: number,
  maxSide: number = MAX_UPLOAD_SIDE_PX,
): ResizeTarget | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  if (Math.max(width, height) <= maxSide) {
    return null;
  }
  if (width >= height) {
    return { width: maxSide };
  }
  return { height: maxSide };
}
