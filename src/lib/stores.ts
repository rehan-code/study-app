import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const DEFAULT_NEW_CARDS_PER_SESSION = 20;

/** Empty selection means "all lessons". */
export function isAllSelection(selection: readonly string[]): boolean {
  return selection.length === 0;
}

export function toggleLessonSelection(selection: readonly string[], lessonId: string): string[] {
  if (selection.includes(lessonId)) {
    return selection.filter((id) => id !== lessonId);
  }
  return [...selection, lessonId];
}

/** Keeps the stepper value a sane positive integer even if storage is corrupted. */
export function clampNewCardsPerSession(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_NEW_CARDS_PER_SESSION;
  }
  return Math.min(Math.max(Math.round(value), 1), 100);
}

interface StudyFilterState {
  selectedLessonIds: string[];
  isAll: boolean;
  toggleLesson: (id: string) => void;
  selectAll: () => void;
}

const persistedStudyFilterSchema = z.object({
  selectedLessonIds: z.array(z.string()),
});

export const useStudyFilter = create<StudyFilterState>()(
  persist(
    (set) => ({
      selectedLessonIds: [],
      isAll: true,
      toggleLesson: (id) => {
        set((state) => {
          const selectedLessonIds = toggleLessonSelection(state.selectedLessonIds, id);
          return { selectedLessonIds, isAll: isAllSelection(selectedLessonIds) };
        });
      },
      selectAll: () => {
        set({ selectedLessonIds: [], isAll: true });
      },
    }),
    {
      name: 'mufradat-study-filter',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ selectedLessonIds: state.selectedLessonIds }),
      merge: (persistedState, currentState) => {
        const parsed = persistedStudyFilterSchema.safeParse(persistedState);
        if (!parsed.success) {
          return currentState;
        }
        return {
          ...currentState,
          selectedLessonIds: parsed.data.selectedLessonIds,
          isAll: isAllSelection(parsed.data.selectedLessonIds),
        };
      },
    },
  ),
);

interface SettingsState {
  aiImagesEnabled: boolean;
  newCardsPerSession: number;
  setAiImagesEnabled: (value: boolean) => void;
  setNewCardsPerSession: (value: number) => void;
}

const persistedSettingsSchema = z.object({
  aiImagesEnabled: z.boolean(),
  newCardsPerSession: z.number(),
});

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      aiImagesEnabled: true,
      newCardsPerSession: DEFAULT_NEW_CARDS_PER_SESSION,
      setAiImagesEnabled: (value) => {
        set({ aiImagesEnabled: value });
      },
      setNewCardsPerSession: (value) => {
        set({ newCardsPerSession: clampNewCardsPerSession(value) });
      },
    }),
    {
      name: 'mufradat-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        aiImagesEnabled: state.aiImagesEnabled,
        newCardsPerSession: state.newCardsPerSession,
      }),
      merge: (persistedState, currentState) => {
        const parsed = persistedSettingsSchema.safeParse(persistedState);
        if (!parsed.success) {
          return currentState;
        }
        return {
          ...currentState,
          aiImagesEnabled: parsed.data.aiImagesEnabled,
          newCardsPerSession: clampNewCardsPerSession(parsed.data.newCardsPerSession),
        };
      },
    },
  ),
);
