/**
 * Base64 for the Anthropic image blocks. Chunked because
 * String.fromCharCode(...bytes) blows the argument limit on a whole photo.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

const ANTHROPIC_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * The image media type Anthropic will accept for a downloaded image, taken from
 * its Content-Type header and falling back to JPEG when the header is missing
 * or names a format the API does not take.
 */
export function imageMediaType(header: string | null): string {
  const value = header?.split(';')[0]?.trim().toLowerCase() ?? '';
  return ANTHROPIC_MEDIA_TYPES.has(value) ? value : 'image/jpeg';
}
