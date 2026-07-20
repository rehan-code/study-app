import { z } from 'zod';

export interface Lesson {
  id: string;
  name: string;
  position: number;
  createdAt: Date;
}

export const lessonRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: z.number().int(),
  created_at: z.coerce.date(),
});

export function lessonFromRow(raw: unknown): Lesson {
  const row = lessonRowSchema.parse(raw);
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
  };
}

/** Orders by explicit position first, then numerically aware name ("Lesson 9" before "Lesson 10"). */
export function compareLessons(a: Lesson, b: Lesson): number {
  if (a.position !== b.position) {
    return a.position - b.position;
  }
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

/** Lookup key so "lesson 7" and " Lesson 7" resolve to the same lesson across scans. */
export function lessonNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Names from `referencedNames` with no lesson in `existingNames` yet, deduped
 * by lessonNameKey, trimmed, in first-appearance order.
 */
export function missingLessonNames(
  referencedNames: readonly (string | null)[],
  existingNames: readonly string[],
): string[] {
  const seen = new Set(existingNames.map(lessonNameKey));
  const missing: string[] = [];
  for (const name of referencedNames) {
    const trimmed = name?.trim() ?? '';
    if (trimmed === '') {
      continue;
    }
    const key = lessonNameKey(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    missing.push(trimmed);
  }
  return missing;
}
