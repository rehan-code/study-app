import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing, type ThemeColor } from '@/constants/theme';
import {
  computeStudyStats,
  greetingForHour,
  hasLessonlessCards,
} from '@/features/study/home-logic';
import { useTheme } from '@/hooks/use-theme';
import { listCards, listLessons, NO_LESSON_ID, queryKeys } from '@/lib/queries';
import { useStudyFilter } from '@/lib/stores';

function StatBlock({ value, label, color }: { value: number; label: string; color: ThemeColor }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="subtitle" themeColor={color} style={styles.statValue}>
        {String(value)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { selectedLessonIds, isAll, toggleLesson, selectAll } = useStudyFilter();

  const lessonsQuery = useQuery({ queryKey: queryKeys.lessons, queryFn: listLessons });
  const allCardsQuery = useQuery({
    queryKey: queryKeys.cards([]),
    queryFn: () => listCards([]),
  });
  const filteredCardsQuery = useQuery({
    queryKey: queryKeys.cards(selectedLessonIds),
    queryFn: () => listCards(selectedLessonIds),
  });

  const refreshing =
    lessonsQuery.isRefetching || allCardsQuery.isRefetching || filteredCardsQuery.isRefetching;
  const refetchLessons = lessonsQuery.refetch;
  const refetchAllCards = allCardsQuery.refetch;
  const refetchFilteredCards = filteredCardsQuery.refetch;
  const refresh = useCallback(() => {
    // Refetch failures land in each query's error state; the screen renders them.
    refetchLessons().catch(() => undefined);
    refetchAllCards().catch(() => undefined);
    refetchFilteredCards().catch(() => undefined);
  }, [refetchAllCards, refetchFilteredCards, refetchLessons]);

  if (lessonsQuery.isPending || allCardsQuery.isPending || filteredCardsQuery.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading your cards" />
      </Screen>
    );
  }

  if (lessonsQuery.isError || allCardsQuery.isError || filteredCardsQuery.isError) {
    const message =
      lessonsQuery.error?.message ??
      allCardsQuery.error?.message ??
      filteredCardsQuery.error?.message ??
      'Please try again.';
    return (
      <Screen>
        <ErrorState message={message} onRetry={refresh} />
      </Screen>
    );
  }

  const lessons = lessonsQuery.data;
  const allCards = allCardsQuery.data;
  const filteredCards = filteredCardsQuery.data;

  const now = new Date();
  const greeting = greetingForHour(now.getHours());
  const stats = computeStudyStats(filteredCards, now);
  const showNoLessonChip = hasLessonlessCards(allCards);
  const noCardsAnywhere = allCards.length === 0;

  const startStudying = () => {
    router.push('/study/session');
  };
  const studyAnyway = () => {
    router.push({ pathname: '/study/session', params: { mode: 'all' } });
  };
  const openQuiz = () => {
    router.push('/quiz');
  };
  const openScanTab = () => {
    router.push('/scans');
  };

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />
        }
      >
        <ThemedText type="subtitle">{greeting}</ThemedText>
        {noCardsAnywhere ? (
          <EmptyState
            icon="camera"
            title="No cards yet"
            message="Photograph a workbook page in the Scan tab and Mufradat will turn it into flashcards."
            action={{ label: 'Scan a page', onPress: openScanTab }}
          />
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              <Chip label="All" selected={isAll} onPress={selectAll} />
              {lessons.map((lesson) => (
                <Chip
                  key={lesson.id}
                  label={lesson.name}
                  selected={selectedLessonIds.includes(lesson.id)}
                  onPress={() => toggleLesson(lesson.id)}
                />
              ))}
              {showNoLessonChip && (
                <Chip
                  label="No lesson"
                  selected={selectedLessonIds.includes(NO_LESSON_ID)}
                  onPress={() => toggleLesson(NO_LESSON_ID)}
                />
              )}
            </ScrollView>
            <Surface>
              <View style={styles.statsRow}>
                <StatBlock value={stats.dueReviews} label="Due now" color="primary" />
                <StatBlock value={stats.newCards} label="New" color="accent" />
                <StatBlock value={stats.total} label="Total" color="text" />
              </View>
            </Surface>
            <View style={styles.actions}>
              {stats.readyNow > 0 ? (
                <Button
                  label="Start studying"
                  onPress={startStudying}
                  variant="primary"
                  size="lg"
                  fullWidth
                  icon="play.fill"
                />
              ) : stats.total > 0 ? (
                <>
                  <ThemedText type="default" themeColor="textSecondary" style={styles.caughtUp}>
                    {"Nothing due right now. You're all caught up."}
                  </ThemedText>
                  <Button
                    label="Study anyway"
                    onPress={studyAnyway}
                    variant="secondary"
                    size="lg"
                    fullWidth
                  />
                </>
              ) : (
                <ThemedText type="default" themeColor="textSecondary" style={styles.caughtUp}>
                  No cards in this selection yet. Pick another lesson or scan a new page.
                </ThemedText>
              )}
              {stats.total > 0 && (
                <Button
                  label="Quiz"
                  onPress={openQuiz}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  icon="questionmark.circle"
                />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  statValue: {
    textAlign: 'center',
  },
  statLabel: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.three,
  },
  caughtUp: {
    textAlign: 'center',
  },
});
