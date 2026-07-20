import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { compareLessons, lessonFromRow, type Lesson } from '@/domain/lessons';

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
