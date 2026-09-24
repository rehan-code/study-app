import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Card } from '@/domain/cards';
import {
  answerQuizQuestion,
  buildQuiz,
  mulberry32,
  nextEndlessQuestion,
  type QuizQuestion,
} from '@/domain/quiz';
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

interface QuizStart {
  questions: QuizQuestion[];
  lap: string[];
}

// Endless mode starts with a single question and builds each next one as it
// is needed; `lap` is what remains of the current pass over the deck.
function startQuiz(cards: Card[], config: QuizConfig): QuizStart {
  const rng = mulberry32(Date.now());
  if (config.count === 'infinite') {
    const first = nextEndlessQuestion(cards, [], config.kinds, rng);
    return first === null
      ? { questions: [], lap: [] }
      : { questions: [first.question], lap: first.lap };
  }
  return {
    questions: buildQuiz(cards, { count: config.count, kinds: [...config.kinds], rng }),
    lap: [],
  };
}

export function QuizRunner({ cards, config }: QuizRunnerProps) {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const theme = useTheme();
  // Answers move levels, so the deck carries its own copy of the cards; a
  // "Try again" then reflects what this quiz just taught, and refetches of the
  // cards query never reshuffle a quiz mid-run.
  const deckRef = useRef<Card[]>(cards);
  const [start] = useState(() => startQuiz(cards, config));
  const lapRef = useRef<string[]>(start.lap);
  const [quiz, setQuiz] = useState<QuizQuestion[]>(start.questions);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wroteRef = useRef(false);
  const endless = config.count === 'infinite';

  // Lock, show the outcome, then move on. Endless mode never runs out: it
  // appends the next question, drawing a fresh lap from the updated deck when
  // the current one is used up.
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
        return;
      }
      if (endless) {
        const next = nextEndlessQuestion(
          deckRef.current,
          lapRef.current,
          config.kinds,
          mulberry32(Date.now()),
        );
        if (next !== null) {
          lapRef.current = next.lap;
          setQuiz((previous) => [...previous, next.question]);
          setIndex(index + 1);
          return;
        }
      }
      setShowResults(true);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [picked, quiz, index, endless, config]);

  const inProgress = quiz.length > 0 && !showResults;

  // Back gesture or close mid-quiz asks before discarding the rest of the run.
  useEffect(() => {
    if (!inProgress) {
      return;
    }
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      const message = endless
        ? 'Answers so far are saved. Finish instead to see your results.'
        : 'Answers so far are saved; the rest of the quiz is not.';
      Alert.alert('Leave the quiz?', message, [
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
  }, [navigation, inProgress, endless]);

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
    const next = startQuiz(deckRef.current, config);
    lapRef.current = next.lap;
    setQuiz(next.questions);
    setIndex(0);
    setPicked(null);
    setAnswers([]);
    setShowResults(false);
  };

  // Ending an endless run mid-question drops the unanswered tail from scoring.
  const handleFinish = () => {
    setPicked(null);
    setShowResults(true);
  };

  if (showResults) {
    return (
      <Screen padded={false}>
        <ResultsView
          questions={endless ? quiz.slice(0, answers.length) : quiz}
          answers={answers}
          onSelectCard={(cardId) => {
            router.push(`/card/${cardId}`);
          }}
          onTryAgain={handleTryAgain}
          onDone={goBackHome}
        />
      </Screen>
    );
  }

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

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="xmark" accessibilityLabel="Close quiz" onPress={goBackHome} />
        <ThemedText type="smallBold" themeColor="textSecondary">
          {endless ? `Question ${index + 1}` : `${index + 1} of ${quiz.length}`}
        </ThemedText>
        {endless ? (
          <Button label="Finish" variant="ghost" onPress={handleFinish} />
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      {!endless && <ProgressBar progress={answers.length / quiz.length} />}
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
