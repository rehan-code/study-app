import { Directory, File, Paths } from 'expo-file-system';

import { makeStorageSlug } from '@/lib/supabase';

/**
 * A picked book lives in the documents folder rather than the picker's cache
 * copy, so importing the next lesson weeks later can still show its pages: iOS
 * reclaims the cache directory under storage pressure, and a curriculum PDF is
 * big enough to be an early candidate. Only the newest book is kept.
 */
const BOOKS_DIRECTORY = 'books';

function booksDirectory(): Directory {
  const directory = new Directory(Paths.document, BOOKS_DIRECTORY);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  return directory;
}

/** Moves a freshly picked PDF into permanent storage, dropping any older book. */
export async function keepBookFile(pickedUri: string): Promise<string> {
  try {
    const directory = booksDirectory();
    for (const entry of directory.list()) {
      entry.delete();
    }
    const destination = new File(directory, `${makeStorageSlug()}.pdf`);
    await new File(pickedUri).move(destination);
    return destination.uri;
  } catch (error) {
    console.warn('[book-file] could not keep the picked PDF:', error);
    throw new Error("Couldn't open that PDF. Please try picking it again.");
  }
}

/** The kept book if it is still on disk, null once it has gone. */
export function existingBookFile(localUri: string | null): string | null {
  if (localUri === null) {
    return null;
  }
  return new File(localUri).exists ? localUri : null;
}
