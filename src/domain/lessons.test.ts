import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  compareLessons,
  lessonFromRow,
  lessonNameKey,
  missingLessonNames,
  type Lesson,
} from '@/domain/lessons';

function lesson(name: string, position: number): Lesson {
  return { id: `lesson-${name}`, name, position, createdAt: new Date('2026-07-06T10:00:00.000Z') };
}

describe('lessonFromRow', () => {
  it('maps a database row', () => {
    const parsed = lessonFromRow({
      id: 'lesson-1',
      name: 'Lesson 9',
      position: 3,
      created_at: '2026-07-06T10:00:00.000Z',
    });
    expect(parsed).toEqual({
      id: 'lesson-1',
      name: 'Lesson 9',
      position: 3,
      createdAt: new Date('2026-07-06T10:00:00.000Z'),
    });
  });

  it('rejects an empty name', () => {
    expect(() =>
      lessonFromRow({ id: 'lesson-1', name: '', position: 0, created_at: '2026-07-06' }),
    ).toThrow(ZodError);
  });

  it('rejects a fractional position', () => {
    expect(() =>
      lessonFromRow({ id: 'lesson-1', name: 'Lesson 9', position: 1.5, created_at: '2026-07-06' }),
    ).toThrow(ZodError);
  });

  it('rejects a missing id', () => {
    expect(() =>
      lessonFromRow({ name: 'Lesson 9', position: 0, created_at: '2026-07-06' }),
    ).toThrow(ZodError);
  });
});

describe('compareLessons', () => {
  it('orders by explicit position first', () => {
    expect(compareLessons(lesson('Lesson 20', 0), lesson('Lesson 1', 1))).toBeLessThan(0);
    expect(compareLessons(lesson('Lesson 1', 2), lesson('Lesson 20', 1))).toBeGreaterThan(0);
  });

  it('orders numerically aware names within the same position', () => {
    expect(compareLessons(lesson('Lesson 9', 0), lesson('Lesson 10', 0))).toBeLessThan(0);
    expect(compareLessons(lesson('Lesson 10', 0), lesson('Lesson 9', 0))).toBeGreaterThan(0);
  });

  it('treats names case-insensitively', () => {
    expect(compareLessons(lesson('lesson 2', 0), lesson('Lesson 2', 0))).toBe(0);
  });

  it('sorts a mixed list into reading order', () => {
    const sorted = [lesson('Lesson 10', 1), lesson('Basics', 0), lesson('Lesson 9', 1)]
      .sort(compareLessons)
      .map((entry) => entry.name);
    expect(sorted).toEqual(['Basics', 'Lesson 9', 'Lesson 10']);
  });
});

describe('lessonNameKey', () => {
  it('trims and lowercases', () => {
    expect(lessonNameKey('  Lesson 7 ')).toBe('lesson 7');
  });

  it('matches names that differ only in case', () => {
    expect(lessonNameKey('LESSON 7')).toBe(lessonNameKey('lesson 7'));
  });
});

describe('missingLessonNames', () => {
  it('returns names with no existing lesson, in first-appearance order', () => {
    expect(missingLessonNames(['Lesson 2', 'Lesson 1'], [])).toEqual(['Lesson 2', 'Lesson 1']);
  });

  it('skips names that already exist, ignoring case and whitespace', () => {
    expect(missingLessonNames([' lesson 7', 'Lesson 8'], ['Lesson 7'])).toEqual(['Lesson 8']);
  });

  it('dedupes repeated references case-insensitively, keeping the first spelling', () => {
    expect(missingLessonNames(['Lesson 3', 'lesson 3', 'LESSON 3'], [])).toEqual(['Lesson 3']);
  });

  it('ignores null and blank references', () => {
    expect(missingLessonNames([null, '', '   ', 'Lesson 4'], [])).toEqual(['Lesson 4']);
  });

  it('returns an empty list when every reference is covered', () => {
    expect(missingLessonNames(['Lesson 1', null], ['lesson 1'])).toEqual([]);
  });
});
