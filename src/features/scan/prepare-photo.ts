import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { resizeTargetFor, UPLOAD_JPEG_QUALITY } from '@/features/scan/image-sizing';
import type { ScanPhoto } from '@/features/scan/photo-selection';

function usableDimensions(width: number | undefined, height: number | undefined): boolean {
  return (
    width !== undefined &&
    height !== undefined &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
}

/**
 * Downscales the longest side to the upload ceiling and re-encodes as JPEG.
 * Rendering the untouched original first spikes memory by gigabytes on 48MP
 * camera photos and iOS kills the app (expo/expo#40158), so when the picker
 * reported dimensions we resize in a single pass and never render full size.
 * The render-to-measure path remains only for assets with unusable metadata.
 */
export async function preparePhotoForUpload(photo: ScanPhoto): Promise<string> {
  if (usableDimensions(photo.width, photo.height)) {
    const target = resizeTargetFor(photo.width ?? 0, photo.height ?? 0);
    const context = ImageManipulator.manipulate(photo.uri);
    const image = await (target === null ? context : context.resize(target)).renderAsync();
    const saved = await image.saveAsync({ compress: UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG });
    return saved.uri;
  }

  // Re-manipulate by uri rather than passing the rendered ImageRef back into
  // manipulate(): the SDK 57 Either<URL, SharedRef> argument converter trips
  // an uncatchable native assertion on shared refs and kills the app.
  const original = await ImageManipulator.manipulate(photo.uri).renderAsync();
  const target = resizeTargetFor(original.width, original.height);
  const image =
    target === null
      ? original
      : await ImageManipulator.manipulate(photo.uri).resize(target).renderAsync();
  const saved = await image.saveAsync({ compress: UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG });
  return saved.uri;
}
