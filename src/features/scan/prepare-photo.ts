import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { resizeTargetFor, UPLOAD_JPEG_QUALITY } from '@/features/scan/image-sizing';

/**
 * Downscales the longest side to the upload ceiling and re-encodes as JPEG.
 * Renders first so the decision uses actual decoded dimensions (picker
 * metadata can report 0). Returns a local file uri ready for upload.
 */
export async function preparePhotoForUpload(uri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const target = resizeTargetFor(original.width, original.height);
  const image =
    target === null
      ? original
      : await ImageManipulator.manipulate(original).resize(target).renderAsync();
  const saved = await image.saveAsync({ compress: UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG });
  return saved.uri;
}
