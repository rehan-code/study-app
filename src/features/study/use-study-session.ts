import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Card } from '@/domain/cards';
import {
  answerCurrent,
  currentCard,
  isComplete,
  sessionProgress,
  sessionSummary,
  undoLast,
  type StudySessionState,
} from '@/domain/session';
import type { ReviewResult, SrsState } from '@/domain/srs';
import { buildStudySession, type StudyMode } from '@/features/study/session-logic';
import { applyReview, listCards, queryKeys } from '@/lib/queries';
import { useSettings, useStudyFilter } from '@/lib/stores';

const SAVE_ERROR_MESSAGE =
  "Couldn't save your last answer. Check your connection; it still counts in this session.";
const RELOAD_ERROR_MESSAGE = "Couldn't reload your cards. Check your connection and try again.";

export type StudySessionPhase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'active' }
  | { kind: 'complete' };

export interface StudySessionController {
  phase: StudySessionPhase;
  current: Card | null;
  upcoming: Card | null;
  /** Changes whenever a different card presentation starts; the deck resets flip and drag on it. */
  deckResetKey: string;
  progress: { done: number; total: number };
  summary: { gotIt: number; notYet: number };
  canUndo: boolean;
  canStudyAgain: boolean;
  rebuilding: boolean;
  hasAnswered: boolean;
  inlineError: string | null;
  answer: (result: ReviewResult) => void;
  undo: () => void;
  studyAgain: () => void;
  retryLoad: () => void;
  dismissInlineError: () => void;
}

export function useStudySession(mode: StudyMode): StudySessionController {
  const queryClient = useQueryClient();
  // Freeze the filter and new-card limit at mount so store changes can't reshape a live session.
  const [filter] = useState<string[]>(() => [...useStudyFilter.getState().selectedLessonIds]);
  const [newLimit] = useState<number>(() => useSettings.getState().newCardsPerSession);

  const cardsQuery = useQuery({
    queryKey: queryKeys.cards(filter),
    queryFn: () => listCards(filter),
  });
  const { refetch } = cardsQuery;

  const [session, setSession] = useState<StudySessionState | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const builtRef = useRef(false);
  const sessionRef = useRef<StudySessionState | null>(null);
  const wroteRef = useRef(false);
  const celebratedRef = useRef(false);

  useEffect(() => {
    if (!builtRef.current && cardsQuery.data !== undefined) {
      builtRef.current = true;
      const built = buildStudySession(cardsQuery.data, new Date(), {
        mode,
        newLimit,
        seed: Date.now(),
      });
      sessionRef.current = built;
      setSession(built);
    }
  }, [cardsQuery.data, mode, newLimit]);

  const persist = useCallback((cardId: string, srs: SrsState) => {
    wroteRef.current = true;
    applyReview(cardId, srs).catch(() => {
      setInlineError(SAVE_ERROR_MESSAGE);
    });
  }, []);

  const answer = useCallback(
    (result: ReviewResult) => {
      const state = sessionRef.current;
      if (state === null || currentCard(state) === null) {
        return;
      }
      const next = answerCurrent(state, result, new Date());
      const entry = next.history[next.history.length - 1];
      if (entry !== undefined) {
        persist(entry.cardId, entry.next);
      }
      // Haptics can be unsupported (simulator, silent mode hardware); studying must not care.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      sessionRef.current = next;
      setSession(next);
    },
    [persist],
  );

  const undo = useCallback(() => {
    const state = sessionRef.current;
    if (state === null || state.history.length === 0) {
      return;
    }
    const entry = state.history[state.history.length - 1];
    const next = undoLast(state);
    persist(entry.cardId, entry.previous);
    sessionRef.current = next;
    setSession(next);
  }, [persist]);

  const studyAgain = useCallback(() => {
    setRebuilding(true);
    refetch()
      .then((result) => {
        if (result.data === undefined) {
          setInlineError(RELOAD_ERROR_MESSAGE);
          return;
        }
        const rebuilt = buildStudySession(result.data, new Date(), {
          mode,
          newLimit,
          seed: Date.now(),
        });
        sessionRef.current = rebuilt;
        setSession(rebuilt);
      })
      .finally(() => {
        setRebuilding(false);
      });
  }, [mode, newLimit, refetch]);

  const retryLoad = useCallback(() => {
    refetch().catch(() => {
      // The query object carries the error state; nothing extra to surface here.
    });
  }, [refetch]);

  const dismissInlineError = useCallback(() => {
    setInlineError(null);
  }, []);

  // Anything studied elsewhere in the app reads from the cards root key; refresh it on exit.
  useEffect(() => {
    const cardsRootKey = queryKeys.cards([])[0];
    return () => {
      if (wroteRef.current) {
        queryClient.invalidateQueries({ queryKey: [cardsRootKey] }).catch(() => undefined);
      }
    };
  }, [queryClient]);

  const complete = session !== null && session.totalPlanned > 0 && isComplete(session);
  useEffect(() => {
    if (complete && !celebratedRef.current) {
      celebratedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    if (!complete) {
      celebratedRef.current = false;
    }
  }, [complete]);

  let phase: StudySessionPhase;
  if (session === null) {
    if (cardsQuery.isError) {
      phase = { kind: 'error', message: cardsQuery.error.message };
    } else {
      phase = { kind: 'loading' };
    }
  } else if (session.totalPlanned === 0) {
    phase = { kind: 'empty' };
  } else if (complete) {
    phase = { kind: 'complete' };
  } else {
    phase = { kind: 'active' };
  }

  const current = session === null ? null : currentCard(session);
  const upcoming = session !== null && session.queue.length > 1 ? session.queue[1] : null;
  const progress = session === null ? { done: 0, total: 0 } : sessionProgress(session);
  const summary = session === null ? { gotIt: 0, notYet: 0 } : sessionSummary(session);
  const historyLength = session === null ? 0 : session.history.length;

  return {
    phase,
    current,
    upcoming,
    deckResetKey: current === null ? 'none' : `${current.id}:${historyLength}`,
    progress,
    summary,
    canUndo: historyLength > 0,
    canStudyAgain: mode === 'all' || summary.notYet > 0,
    rebuilding,
    hasAnswered: historyLength > 0,
    inlineError,
    answer,
    undo,
    studyAgain,
    retryLoad,
    dismissInlineError,
  };
}
