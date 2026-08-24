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

/** Moves a freshly picked PDF into permanent storage. */
export async function keepBookFile(pickedUri: string): Promise<string> {
  try {
    const destination = new File(booksDirectory(), `${makeStorageSlug()}.pdf`);
    await new File(pickedUri).move(destination);
    return destination.uri;
  } catch (error) {
    console.warn('[book-file] could not keep the picked PDF:', error);
    throw new Error("Couldn't open that PDF. Please try picking it again.");
  }
}

/**
 * Drops every kept book except the one just committed to an import. Deleting
 * only now, not at pick time, means backing out of a fresh pick leaves the
 * previous book's pages still there to preview.
 */
export function dropOtherBookFiles(keptUri: string): void {
  try {
    const keptName = new File(keptUri).name;
    for (const entry of booksDirectory().list()) {
      if (entry.name !== keptName) {
        entry.delete();
      }
    }
  } catch (error) {
    console.warn('[book-file] could not clean up older books:', error);
  }
}

/** The kept book if it is still on disk, null once it has gone. */
export function existingBookFile(localUri: string | null): string | null {
  if (localUri === null) {
    return null;
  }
  const stored = new File(localUri);
  if (stored.exists) {
    return localUri;
  }
  // A remembered URI outlives its absolute path: iOS moves the app's data
  // container to a fresh UUID on every install, taking Documents with it. The
  // book itself survives the move, so look it up by name under today's path.
  const relocated = new File(booksDirectory(), stored.name);
  return relocated.exists ? relocated.uri : null;
}
