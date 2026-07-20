const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function count(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/** Human next-review time, e.g. "Due now", "In 10 minutes", "In 3 days". */
export function describeNextReview(dueAt: Date, now: Date): string {
  const diffMs = dueAt.getTime() - now.getTime();
  if (diffMs <= 0) {
    return 'Due now';
  }
  const minutes = Math.round(diffMs / MINUTE_MS);
  if (minutes < 1) {
    return 'In less than a minute';
  }
  if (minutes < 60) {
    return `In ${count(minutes, 'minute')}`;
  }
  const hours = Math.round(diffMs / HOUR_MS);
  if (hours < 24) {
    return `In ${count(hours, 'hour')}`;
  }
  const days = Math.round(diffMs / DAY_MS);
  return `In ${count(days, 'day')}`;
}
