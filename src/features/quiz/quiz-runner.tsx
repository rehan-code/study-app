import * as Haptics from 'expo-haptics';
import { router, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Card } from '@/domain/cards';
import { buildQuiz, mulberry32, type QuizQuestion } from '@/domain/quiz';

import { QuestionView } from '@/features/quiz/question-view';
import type { QuizConfig } from '@/features/quiz/quiz-config';
import { ResultsView } from '@/features/quiz/results-view';

const ADVANCE_DELAY_MS = 900;

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
  // Built once on mount from the cards snapshot so refetches never reshuffle mid-quiz.
  const [quiz, setQuiz] = useState<QuizQuestion[]>(() => buildSeededQuiz(cards, config));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Lock, show the outcome, then move on.
  useEffect(() => {
    if (picked === null) {
      return;
    }
    const timer = setTimeout(() => {
      setPicked(null);
      if (index + 1 < quiz.length) {
        setIndex(index + 1);
      } else {
        setShowResults(true);
      }
    }, ADVANCE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [picked, quiz, index]);

  const inProgress = quiz.length > 0 && !showResults;

  // Back gesture or close mid-quiz asks before discarding progress.
  useEffect(() => {
    if (!inProgress) {
      return;
    }
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      Alert.alert('Leave the quiz?', "Your progress won't be saved.", [
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

  const handlePick = (choiceIndex: number) => {
    if (picked !== null) {
      return;
    }
    const question = quiz[index];
    setPicked(choiceIndex);
    setAnswers((previous) => [...previous, choiceIndex]);
    if (choiceIndex === question.correctIndex) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleTryAgain = () => {
    setQuiz(buildSeededQuiz(cards, config));
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
          message="Scan more pages or turn on more question types, then try again."
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
});
