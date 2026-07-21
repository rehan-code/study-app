import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { pixelCropRect, scaleRect, type CropRect, type Size } from '@/features/scan/crop-geometry';
import { resizeTargetFor } from '@/features/scan/image-sizing';
import type { ScanPhoto } from '@/features/scan/photo-selection';

// Slightly above the upload quality: the upload pass re-encodes the crop output.
const CROP_JPEG_QUALITY = 0.92;

export interface CropSource {
  uri: string;
  width?: number;
  height?: number;
}

/** The photo a crop edit starts from: the pre-crop original when one exists. */
export function cropSourceOf(photo: ScanPhoto): CropSource {
  if (photo.original !== undefined) {
    return photo.original;
  }
  return { uri: photo.uri, width: photo.width, height: photo.height };
}

/** Restores the pre-crop photo (a no-op for a photo that was never cropped). */
export function uncroppedPhotoFrom(photo: ScanPhoto, sourceSize: Size): ScanPhoto {
  const source = cropSourceOf(photo);
  return { uri: source.uri, width: sourceSize.width, height: sourceSize.height };
}

/**
 * Renders `rect` (in source pixel coordinates) as a new photo. Downscales to
 * the upload ceiling in the same pass so a full-resolution camera photo is
 * never rendered untouched (see preparePhotoForUpload for why that matters).
 */
export async function applyCropToPhoto(
  photo: ScanPhoto,
  rect: CropRect,
  sourceSize: Size,
): Promise<ScanPhoto> {
  const source = cropSourceOf(photo);
  const target = resizeTargetFor(sourceSize.width, sourceSize.height);
  const context = ImageManipulator.manipulate(source.uri);
  const base = await (target === null ? context : context.resize(target)).renderAsync();
  const pixelRect = pixelCropRect(scaleRect(rect, sourceSize, base), base);
  const cropped = await ImageManipulator.manipulate(base).crop(pixelRect).renderAsync();
  const saved = await cropped.saveAsync({ compress: CROP_JPEG_QUALITY, format: SaveFormat.JPEG });
  return {
    uri: saved.uri,
    width: cropped.width,
    height: cropped.height,
    original: { uri: source.uri, width: sourceSize.width, height: sourceSize.height },
    cropRect: rect,
  };
}
