import { describe, expect, it } from 'vitest';

import { describeNextReview } from '@/features/library/relative-time';

const NOW = new Date('2026-07-07T12:00:00Z');

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('describeNextReview', () => {
  it('says due now for the exact current time', () => {
    expect(describeNextReview(at(0), NOW)).toBe('Due now');
  });

  it('says due now for past times', () => {
    expect(describeNextReview(at(-3 * DAY), NOW)).toBe('Due now');
  });

  it('handles sub-minute gaps', () => {
    expect(describeNextReview(at(20_000), NOW)).toBe('In less than a minute');
  });

  it('uses singular minute', () => {
    expect(describeNextReview(at(MINUTE), NOW)).toBe('In 1 minute');
  });

  it('uses minutes below an hour', () => {
    expect(describeNextReview(at(10 * MINUTE), NOW)).toBe('In 10 minutes');
  });

  it('rolls nearly-an-hour gaps into hours instead of "60 minutes"', () => {
    expect(describeNextReview(at(59 * MINUTE + 45_000), NOW)).toBe('In 1 hour');
  });

  it('uses hours below a day', () => {
    expect(describeNextReview(at(5 * HOUR), NOW)).toBe('In 5 hours');
  });

  it('rolls nearly-a-day gaps into days instead of "24 hours"', () => {
    expect(describeNextReview(at(23 * HOUR + 45 * MINUTE), NOW)).toBe('In 1 day');
  });

  it('uses days for long gaps', () => {
    expect(describeNextReview(at(3 * DAY), NOW)).toBe('In 3 days');
  });

  it('covers the longest Leitner interval', () => {
    expect(describeNextReview(at(30 * DAY), NOW)).toBe('In 30 days');
  });
});
