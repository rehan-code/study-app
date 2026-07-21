import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { pixelCropRect, type CropRect, type Size } from '@/features/scan/crop-geometry';
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
 * Renders `rect` (in source pixel coordinates) as a new photo. Crop and resize
 * run in one manipulator chain from the file uri: passing a rendered ImageRef
 * back into ImageManipulator.manipulate() trips an uncatchable native
 * assertion in SDK 57's Either<URL, SharedRef> argument converter and kills
 * the app. Cropping first also keeps the rect in source coordinates, whose
 * exact dimensions we know, then the crop result is downscaled to the upload
 * ceiling.
 */
export async function applyCropToPhoto(
  photo: ScanPhoto,
  rect: CropRect,
  sourceSize: Size,
): Promise<ScanPhoto> {
  const source = cropSourceOf(photo);
  const pixelRect = pixelCropRect(rect, sourceSize);
  const target = resizeTargetFor(pixelRect.width, pixelRect.height);
  const context = ImageManipulator.manipulate(source.uri).crop(pixelRect);
  const cropped = await (target === null ? context : context.resize(target)).renderAsync();
  const saved = await cropped.saveAsync({ compress: CROP_JPEG_QUALITY, format: SaveFormat.JPEG });
  return {
    uri: saved.uri,
    width: cropped.width,
    height: cropped.height,
    original: { uri: source.uri, width: sourceSize.width, height: sourceSize.height },
    cropRect: rect,
  };
}
