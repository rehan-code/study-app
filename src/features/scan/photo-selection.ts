export const MAX_SCAN_PAGES = 2;

export interface ScanPhoto {
  uri: string;
  /** Decoded dimensions from the picker; missing or zero when unreported. */
  width?: number;
  height?: number;
}

const PAGE_ORDER_LABELS = ['Right page', 'Left page'] as const;

export function pageLabelForIndex(
  index: number,
  labels: readonly string[] = PAGE_ORDER_LABELS,
): string {
  const label = labels[index];
  if (label !== undefined) {
    return label;
  }
  return `Page ${index + 1}`;
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

/** Reverses the right/left page order; only meaningful for a full pair. */
export function swapPhotos(current: readonly ScanPhoto[]): ScanPhoto[] {
  if (current.length < 2) {
    return [...current];
  }
  return [current[1], current[0]];
}

export function remainingPhotoSlots(current: readonly ScanPhoto[]): number {
  return Math.max(0, MAX_SCAN_PAGES - current.length);
}
