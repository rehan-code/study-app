import { describe, expect, it } from 'vitest';

import { SCAN_STATUSES, type Scan } from '@/domain/scans';
import {
  formatRelativeTime,
  hasParsingScan,
  pageCountLabel,
  SCAN_STATUS_PRESENTATION,
} from '@/features/scan/scan-status';

function makeScan(status: Scan['status']): Scan {
  return {
    id: `scan-${status}`,
    kind: 'nouns',
    pagePaths: ['user/page.jpg'],
    status,
    parsed: null,
    parseError: null,
    createdAt: new Date('2026-07-01T10:00:00Z'),
  };
}

describe('SCAN_STATUS_PRESENTATION', () => {
  it('covers every scan status', () => {
    for (const status of SCAN_STATUSES) {
      expect(SCAN_STATUS_PRESENTATION[status].label.length).toBeGreaterThan(0);
    }
  });

  it('uses the required labels and tones', () => {
    expect(SCAN_STATUS_PRESENTATION.parsed).toEqual({ label: 'Ready to review', tone: 'accent' });
    expect(SCAN_STATUS_PRESENTATION.reviewed.tone).toBe('success');
    expect(SCAN_STATUS_PRESENTATION.failed.tone).toBe('danger');
    expect(SCAN_STATUS_PRESENTATION.parsing.tone).toBe('warning');
    expect(SCAN_STATUS_PRESENTATION.uploaded.tone).toBe('warning');
  });
});

describe('hasParsingScan', () => {
  it('is false for undefined and empty lists', () => {
    expect(hasParsingScan(undefined)).toBe(false);
    expect(hasParsingScan([])).toBe(false);
  });

  it('is true only when some scan is parsing', () => {
    expect(hasParsingScan([makeScan('parsed'), makeScan('failed')])).toBe(false);
    expect(hasParsingScan([makeScan('parsed'), makeScan('parsing')])).toBe(true);
  });
});

describe('pageCountLabel', () => {
  it('pluralizes', () => {
    expect(pageCountLabel(1)).toBe('1 page');
    expect(pageCountLabel(2)).toBe('2 pages');
    expect(pageCountLabel(0)).toBe('0 pages');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-07T12:00:00Z');

  it('handles the recent buckets', () => {
    expect(formatRelativeTime(new Date('2026-07-07T11:59:30Z'), now)).toBe('just now');
    expect(formatRelativeTime(new Date('2026-07-07T11:45:00Z'), now)).toBe('15m ago');
    expect(formatRelativeTime(new Date('2026-07-07T09:00:00Z'), now)).toBe('3h ago');
  });

  it('handles days', () => {
    expect(formatRelativeTime(new Date('2026-07-06T10:00:00Z'), now)).toBe('yesterday');
    expect(formatRelativeTime(new Date('2026-07-03T12:00:00Z'), now)).toBe('4d ago');
  });

  it('falls back to dates beyond a week', () => {
    expect(formatRelativeTime(new Date('2026-06-01T12:00:00Z'), now)).toBe('Jun 1');
    expect(formatRelativeTime(new Date('2025-12-20T12:00:00Z'), now)).toBe('Dec 20, 2025');
  });

  it('clamps future timestamps to just now', () => {
    expect(formatRelativeTime(new Date('2026-07-07T12:05:00Z'), now)).toBe('just now');
  });
});
