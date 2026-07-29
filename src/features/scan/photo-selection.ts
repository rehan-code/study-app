import type { ScanKind } from '@/domain/cards';
import type { CropRect } from '@/features/scan/crop-geometry';

/**
 * Four two-page spreads. One parse request carries every photo, so a higher
 * ceiling risks the AI truncating its answer partway down the table.
 */
export const MAX_SCAN_PAGES = 8;

export interface ScanPhoto {
  uri: string;
  /** Decoded dimensions from the picker; missing or zero when unreported. */
  width?: number;
  height?: number;
  /** Pre-crop source, kept so a crop can be re-adjusted instead of compounded. */
  original?: { uri: string; width: number; height: number };
  /** Applied crop in `original` pixel coordinates. */
  cropRect?: CropRect;
}

/**
 * Photos per group. Nouns and verbs tables run across a right/left spread, so
 * their photos pair up; phrases pages stand alone, one group each.
 */
export function pagesPerGroup(kind: ScanKind): number {
  return kind === 'phrases' ? 1 : 2;
}

export interface PhotoGroup {
  /** 0-based position of the group in the scan. */
  index: number;
  /** Position of this group's first photo in the flat photo list. */
  startIndex: number;
  photos: ScanPhoto[];
}

/** Splits the flat photo list into the groups the parser will read together. */
export function groupPhotos(photos: readonly ScanPhoto[], perGroup: number): PhotoGroup[] {
  const size = Math.max(1, perGroup);
  const groups: PhotoGroup[] = [];
  for (let start = 0; start < photos.length; start += size) {
    groups.push({
      index: groups.length,
      startIndex: start,
      photos: photos.slice(start, start + size),
    });
  }
  return groups;
}

/**
 * Heading above a group, or null when it would say nothing: a single group, or
 * standalone pages, which carry their own number on the photo card instead.
 */
export function groupHeading(
  kind: ScanKind,
  groupIndex: number,
  groupCount: number,
): string | null {
  if (groupCount <= 1 || pagesPerGroup(kind) === 1) {
    return null;
  }
  return `Spread ${groupIndex + 1}`;
}

const PAGE_ORDER_LABELS = ['Right page', 'Left page'] as const;

/** Label for a photo by its position WITHIN its group, e.g. right page then left. */
export function pageLabelForIndex(
  indexInGroup: number,
  labels: readonly string[] = PAGE_ORDER_LABELS,
): string {
  const label = labels[indexInGroup];
  if (label !== undefined) {
    return label;
  }
  return `Page ${indexInGroup + 1}`;
}

/** What a photo card is called: its side of the spread, or its page number. */
export function photoLabel(
  kind: ScanKind,
  groupIndex: number,
  indexInGroup: number,
  groupCount: number,
  labels: readonly string[] = PAGE_ORDER_LABELS,
): string {
  if (pagesPerGroup(kind) === 1) {
    return groupCount > 1 ? `Page ${groupIndex + 1}` : pageLabelForIndex(0, labels);
  }
  return pageLabelForIndex(indexInGroup, labels);
}

export function addPhotos(
  current: readonly ScanPhoto[],
  incoming: readonly ScanPhoto[],
): ScanPhoto[] {
  return [...current, ...incoming].slice(0, MAX_SCAN_PAGES);
}

export function removePhotoAt(current: readonly ScanPhoto[], index: number): ScanPhoto[] {
  return current.filter((_, i) => i !== index);
}

export function replacePhotoAt(
  current: readonly ScanPhoto[],
  index: number,
  photo: ScanPhoto,
): ScanPhoto[] {
  return current.map((existing, i) => (i === index ? photo : existing));
}

/** Reverses the right/left order inside one group; only meaningful for a full pair. */
export function swapGroupPages(current: readonly ScanPhoto[], startIndex: number): ScanPhoto[] {
  const next = [...current];
  if (startIndex < 0 || startIndex + 1 >= next.length) {
    return next;
  }
  next[startIndex] = current[startIndex + 1];
  next[startIndex + 1] = current[startIndex];
  return next;
}

export function remainingPhotoSlots(current: readonly ScanPhoto[]): number {
  return Math.max(0, MAX_SCAN_PAGES - current.length);
}
