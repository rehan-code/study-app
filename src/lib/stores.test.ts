import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clampNewCardsPerSession,
  DEFAULT_NEW_CARDS_PER_SESSION,
  isAllSelection,
  toggleLessonSelection,
  useSettings,
  useStudyFilter,
} from '@/lib/stores';

// Hoisted above the imports by vitest; replaces the React Native only module.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

describe('toggleLessonSelection', () => {
  it('adds a lesson that is not selected', () => {
    expect(toggleLessonSelection([], 'a')).toEqual(['a']);
    expect(toggleLessonSelection(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('removes a lesson that is already selected', () => {
    expect(toggleLessonSelection(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleLessonSelection(['a'], 'a')).toEqual([]);
  });

  it('does not mutate the input selection', () => {
    const selection = ['a'];
    toggleLessonSelection(selection, 'b');
    expect(selection).toEqual(['a']);
  });
});

describe('isAllSelection', () => {
  it('treats an empty selection as all lessons', () => {
    expect(isAllSelection([])).toBe(true);
    expect(isAllSelection(['a'])).toBe(false);
  });
});

describe('clampNewCardsPerSession', () => {
  it('keeps sane values as integers', () => {
    expect(clampNewCardsPerSession(20)).toBe(20);
    expect(clampNewCardsPerSession(7.6)).toBe(8);
  });

  it('clamps out-of-range values', () => {
    expect(clampNewCardsPerSession(0)).toBe(1);
    expect(clampNewCardsPerSession(-5)).toBe(1);
    expect(clampNewCardsPerSession(10_000)).toBe(100);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampNewCardsPerSession(Number.NaN)).toBe(DEFAULT_NEW_CARDS_PER_SESSION);
    expect(clampNewCardsPerSession(Number.POSITIVE_INFINITY)).toBe(DEFAULT_NEW_CARDS_PER_SESSION);
  });
});

describe('useStudyFilter store', () => {
  beforeEach(() => {
    useStudyFilter.setState({ selectedLessonIds: [], isAll: true });
  });

  it('defaults to all lessons', () => {
    expect(useStudyFilter.getState().selectedLessonIds).toEqual([]);
    expect(useStudyFilter.getState().isAll).toBe(true);
  });

  it('toggles lessons in and out and keeps isAll in sync', () => {
    useStudyFilter.getState().toggleLesson('lesson-1');
    expect(useStudyFilter.getState().selectedLessonIds).toEqual(['lesson-1']);
    expect(useStudyFilter.getState().isAll).toBe(false);

    useStudyFilter.getState().toggleLesson('no-lesson');
    expect(useStudyFilter.getState().selectedLessonIds).toEqual(['lesson-1', 'no-lesson']);

    useStudyFilter.getState().toggleLesson('lesson-1');
    useStudyFilter.getState().toggleLesson('no-lesson');
    expect(useStudyFilter.getState().selectedLessonIds).toEqual([]);
    expect(useStudyFilter.getState().isAll).toBe(true);
  });

  it('selectAll clears the selection', () => {
    useStudyFilter.getState().toggleLesson('lesson-1');
    useStudyFilter.getState().selectAll();
    expect(useStudyFilter.getState().selectedLessonIds).toEqual([]);
    expect(useStudyFilter.getState().isAll).toBe(true);
  });
});

describe('useSettings store', () => {
  beforeEach(() => {
    useSettings.setState({
      aiImagesEnabled: true,
      newCardsPerSession: DEFAULT_NEW_CARDS_PER_SESSION,
    });
  });

  it('has the documented defaults', () => {
    expect(useSettings.getState().aiImagesEnabled).toBe(true);
    expect(useSettings.getState().newCardsPerSession).toBe(20);
  });

  it('updates settings through the setters', () => {
    useSettings.getState().setAiImagesEnabled(false);
    useSettings.getState().setNewCardsPerSession(35);
    expect(useSettings.getState().aiImagesEnabled).toBe(false);
    expect(useSettings.getState().newCardsPerSession).toBe(35);
  });

  it('sanitizes nonsense stepper values', () => {
    useSettings.getState().setNewCardsPerSession(-3);
    expect(useSettings.getState().newCardsPerSession).toBe(1);
    useSettings.getState().setNewCardsPerSession(Number.NaN);
    expect(useSettings.getState().newCardsPerSession).toBe(DEFAULT_NEW_CARDS_PER_SESSION);
  });
});
