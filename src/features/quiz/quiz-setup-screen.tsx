import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ErrorState } from '@/components/error-state';
import { IconButton } from '@/components/icon-button';
import { LoadingState } from '@/components/loading-state';
import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { QuizKind } from '@/domain/quiz';
import { listCards, listLessons, NO_LESSON_ID, queryKeys } from '@/lib/queries';
import { useStudyFilter } from '@/lib/stores';

import {
  countEligibleQuestions,
  DEFAULT_QUIZ_COUNT,
  DEFAULT_QUIZ_KINDS,
  describeLessonSelection,
  QUIZ_COUNT_OPTIONS,
  QUIZ_KIND_OPTIONS,
  serializeQuizParams,
  startBlockedReason,
  toggleQuizKind,
} from '@/features/quiz/quiz-config';
import { SegmentedOptions } from '@/features/quiz/segmented-options';

export function QuizSetupScreen() {
  const selectedLessonIds = useStudyFilter((state) => state.selectedLessonIds);
  const [count, setCount] = useState(DEFAULT_QUIZ_COUNT);
  const [kinds, setKinds] = useState<QuizKind[]>([...DEFAULT_QUIZ_KINDS]);

  const cardsQuery = useQuery({
    queryKey: queryKeys.cards(selectedLessonIds),
    queryFn: () => listCards(selectedLessonIds),
  });
  const lessonsQuery = useQuery({
    queryKey: queryKeys.lessons,
    queryFn: listLessons,
  });

  const cards = cardsQuery.data;
  const eligible = useMemo(
    () => (cards === undefined ? 0 : countEligibleQuestions(cards, kinds)),
    [cards, kinds],
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleStart = () => {
    router.push({
      pathname: '/quiz/session',
      params: serializeQuizParams({ count, kinds }),
    });
  };

  if (cardsQuery.isPending) {
    return (
      <Screen>
        <LoadingState label="Getting your cards ready" />
      </Screen>
    );
  }

  if (cardsQuery.isError || cards === undefined) {
    return (
      <Screen>
        <ErrorState
          message={cardsQuery.error?.message ?? "Couldn't load your cards. Please try again."}
          onRetry={() => {
            void cardsQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const blockedReason = startBlockedReason(eligible, kinds, cards.length);
  const availability = eligible === 1 ? '1 question available' : `${eligible} questions available`;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <IconButton icon="chevron.left" accessibilityLabel="Back" onPress={handleBack} />
        <ThemedText type="subtitle">Quiz</ThemedText>
      </View>

      <View style={styles.sections}>
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Lessons
          </ThemedText>
          <Surface>
            <ThemedText>
              {describeLessonSelection(selectedLessonIds, lessonsQuery.data, NO_LESSON_ID)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Change which lessons count on the Home tab.
            </ThemedText>
          </Surface>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            How many questions
          </ThemedText>
          <SegmentedOptions options={QUIZ_COUNT_OPTIONS} value={count} onChange={setCount} />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Question types
          </ThemedText>
          <View style={styles.chips}>
            {QUIZ_KIND_OPTIONS.map((option) => (
              <Chip
                key={option.kind}
                label={option.label}
                selected={kinds.includes(option.kind)}
                onPress={() => setKinds((previous) => toggleQuizKind(previous, option.kind))}
              />
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {availability}
          </ThemedText>
          <Button
            label="Start quiz"
            icon="play.fill"
            size="lg"
            fullWidth
            disabled={blockedReason !== null}
            onPress={handleStart}
          />
          {blockedReason !== null && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              {blockedReason}
            </ThemedText>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  sections: {
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  footer: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
});
