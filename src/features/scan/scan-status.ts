import type { BadgeTone } from '@/components/badge';
import type { Scan, ScanStatus } from '@/domain/scans';

export interface ScanStatusPresentation {
  label: string;
  tone: BadgeTone;
}

/** Badge's 'warning' tone renders the orange accent hue; its 'accent' tone renders the teal primary. */
export const SCAN_STATUS_PRESENTATION: Record<ScanStatus, ScanStatusPresentation> = {
  uploaded: { label: 'Waiting to read', tone: 'warning' },
  parsing: { label: 'Reading pages', tone: 'warning' },
  parsed: { label: 'Ready to review', tone: 'accent' },
  reviewed: { label: 'Reviewed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

/** Poll cadence for lists and detail views while a scan is still being read. */
export const SCAN_POLL_INTERVAL_MS = 4000;

export function hasParsingScan(scans: readonly Scan[] | undefined): boolean {
  if (scans === undefined) {
    return false;
  }
  return scans.some((scan) => scan.status === 'parsing');
}

export function pageCountLabel(count: number): string {
  if (count === 1) {
    return '1 page';
  }
  return `${count} pages`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatRelativeTime(date: Date, now: Date): string {
  const elapsedMs = now.getTime() - date.getTime();
  if (elapsedMs < MINUTE_MS) {
    return 'just now';
  }
  if (elapsedMs < HOUR_MS) {
    return `${Math.floor(elapsedMs / MINUTE_MS)}m ago`;
  }
  if (elapsedMs < DAY_MS) {
    return `${Math.floor(elapsedMs / HOUR_MS)}h ago`;
  }
  const days = Math.floor(elapsedMs / DAY_MS);
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  // Fixed locale keeps output deterministic; the app ships to one user.
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
