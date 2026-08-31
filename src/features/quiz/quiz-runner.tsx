import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Card } from '@/domain/cards';
import { answerQuizQuestion, buildQuiz, mulberry32, type QuizQuestion } from '@/domain/quiz';
import { useTheme } from '@/hooks/use-theme';
import { applyReview, queryKeys } from '@/lib/queries';

import { QuestionView } from '@/features/quiz/question-view';
import type { QuizConfig } from '@/features/quiz/quiz-config';
import { ResultsView } from '@/features/quiz/results-view';

// A correct tap needs only a flash of confirmation; a miss stays long enough
// to read the right answer.
const ADVANCE_DELAY_CORRECT_MS = 400;
const ADVANCE_DELAY_WRONG_MS = 900;

const SAVE_ERROR_MESSAGE =
  "Couldn't save your last answer. Check your connection; it still counts in this quiz.";

export interface QuizRunnerProps {
  cards: Card[];
  config: QuizConfig;
}

function goBackHome() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

function buildSeededQuiz(cards: Card[], config: QuizConfig): QuizQuestion[] {
  return buildQuiz(cards, {
    count: config.count,
    kinds: [...config.kinds],
    rng: mulberry32(Date.now()),
  });
}

export function QuizRunner({ cards, config }: QuizRunnerProps) {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const theme = useTheme();
  // Answers move levels, so the deck carries its own copy of the cards; a
  // "Try again" then reflects what this quiz just taught, and refetches of the
  // cards query never reshuffle a quiz mid-run.
  const deckRef = useRef<Card[]>(cards);
  const [quiz, setQuiz] = useState<QuizQuestion[]>(() => buildSeededQuiz(cards, config));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wroteRef = useRef(false);

  // Lock, show the outcome, then move on.
  useEffect(() => {
    if (picked === null) {
      return;
    }
    const delay =
      picked === quiz[index].correctIndex ? ADVANCE_DELAY_CORRECT_MS : ADVANCE_DELAY_WRONG_MS;
    const timer = setTimeout(() => {
      setPicked(null);
      if (index + 1 < quiz.length) {
        setIndex(index + 1);
      } else {
        setShowResults(true);
      }
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [picked, quiz, index]);

  const inProgress = quiz.length > 0 && !showResults;

  // Back gesture or close mid-quiz asks before discarding the rest of the run.
  useEffect(() => {
    if (!inProgress) {
      return;
    }
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      Alert.alert('Leave the quiz?', 'Answers so far are saved; the rest of the quiz is not.', [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, inProgress]);

  // Levels changed here show up wherever else cards are read; refresh on exit.
  useEffect(() => {
    const cardsRootKey = queryKeys.cards([])[0];
    return () => {
      if (wroteRef.current) {
        queryClient.invalidateQueries({ queryKey: [cardsRootKey] }).catch(() => undefined);
      }
    };
  }, [queryClient]);

  const recordAnswer = useCallback((cardId: string, correct: boolean) => {
    const outcome = answerQuizQuestion(deckRef.current, cardId, correct, new Date());
    if (outcome === null) {
      return;
    }
    deckRef.current = outcome.cards;
    wroteRef.current = true;
    applyReview(cardId, outcome.srs).catch(() => {
      setSaveError(SAVE_ERROR_MESSAGE);
    });
  }, []);

  const handlePick = (choiceIndex: number) => {
    if (picked !== null) {
      return;
    }
    const question = quiz[index];
    const correct = choiceIndex === question.correctIndex;
    setPicked(choiceIndex);
    setAnswers((previous) => [...previous, choiceIndex]);
    recordAnswer(question.cardId, correct);
    if (correct) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleTryAgain = () => {
    setQuiz(buildSeededQuiz(deckRef.current, config));
    setIndex(0);
    setPicked(null);
    setAnswers([]);
    setShowResults(false);
  };

  if (quiz.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="questionmark.circle"
          title="Nothing to quiz yet"
          message="Quizzes cover words you have already studied. Study a session first, or turn on more question types."
          action={{ label: 'Go back', onPress: goBackHome }}
        />
      </Screen>
    );
  }

  if (showResults) {
    return (
      <Screen scroll>
        <ResultsView
          questions={quiz}
          answers={answers}
          onTryAgain={handleTryAgain}
          onDone={goBackHome}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="xmark" accessibilityLabel="Close quiz" onPress={goBackHome} />
        <ThemedText type="smallBold" themeColor="textSecondary">
          {`${index + 1} of ${quiz.length}`}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>
      <ProgressBar progress={answers.length / quiz.length} />
      {saveError !== null && (
        <View style={[styles.errorBanner, { backgroundColor: theme.dangerSoft }]}>
          <ThemedText type="small" themeColor="danger" style={styles.errorText}>
            {saveError}
          </ThemedText>
          <IconButton
            icon="xmark"
            accessibilityLabel="Dismiss error"
            onPress={() => setSaveError(null)}
            themeColor="danger"
            size={14}
          />
        </View>
      )}
      <QuestionView question={quiz[index]} picked={picked} onPick={handlePick} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  headerSpacer: {
    width: 40,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    paddingLeft: Spacing.three,
    marginTop: Spacing.two,
  },
  errorText: {
    flex: 1,
    paddingVertical: Spacing.two,
  },
});
