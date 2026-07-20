import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listCards, listLessons, queryKeys } from '@/lib/queries';

import { Badge } from '@/components/badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ListRow } from '@/components/list-row';
import { LoadingState } from '@/components/loading-state';
import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { buildLessonSummaries, cardCountLabel } from '@/features/library/lesson-summaries';
import { ListDivider } from '@/features/library/list-divider';

export function LibraryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const lessonsQuery = useQuery({ queryKey: queryKeys.lessons, queryFn: listLessons });
  const cardsQuery = useQuery({ queryKey: queryKeys.cards([]), queryFn: () => listCards([]) });
  const [refreshing, setRefreshing] = useState(false);

  // TanStack's refetch has a stable identity, keeping the focus effect from looping.
  const { refetch: refetchLessons } = lessonsQuery;
  const { refetch: refetchCards } = cardsQuery;
  const refetchBoth = useCallback(async () => {
    await Promise.all([refetchLessons(), refetchCards()]);
  }, [refetchLessons, refetchCards]);

  // Cards created by the scan flow should appear as soon as the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      void refetchBoth();
    }, [refetchBoth]),
  );

  const summaries = useMemo(() => {
    if (lessonsQuery.data === undefined || cardsQuery.data === undefined) {
      return [];
    }
    return buildLessonSummaries(lessonsQuery.data, cardsQuery.data, new Date());
  }, [lessonsQuery.data, cardsQuery.data]);

  if (lessonsQuery.isPending || cardsQuery.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading your library" />
      </Screen>
    );
  }

  const loadError = lessonsQuery.error ?? cardsQuery.error;
  if (loadError !== null) {
    return (
      <Screen>
        <ErrorState
          message={loadError.message}
          onRetry={() => {
            void refetchBoth();
          }}
        />
      </Screen>
    );
  }

  if (summaries.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="books.vertical"
          title="No lessons yet"
          message="Scan a workbook page and your lessons will show up here."
          action={{
            label: 'Go to Scan',
            onPress: () => {
              router.push('/scans');
            },
          }}
        />
      </Screen>
    );
  }

  const totalCards = cardsQuery.data?.length ?? 0;
  const onRefresh = () => {
    setRefreshing(true);
    void refetchBoth().finally(() => {
      setRefreshing(false);
    });
  };

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        <View style={styles.headerRow}>
          <ThemedText type="subtitle">Library</ThemedText>
          <Text style={[styles.totalStat, { color: theme.textSecondary }]}>
            {cardCountLabel(totalCards)}
          </Text>
        </View>
        <Surface padded={false}>
          {summaries.map((summary, index) => (
            <Fragment key={summary.lessonId}>
              {index > 0 && <ListDivider />}
              <ListRow
                title={summary.name}
                subtitle={cardCountLabel(summary.total)}
                onPress={() => {
                  router.push(`/lesson/${summary.lessonId}`);
                }}
                right={
                  <View style={styles.rowRight}>
                    {summary.due > 0 && <Badge label={`${summary.due} due`} tone="accent" />}
                    <SymbolView
                      name="chevron.right"
                      size={14}
                      weight="semibold"
                      tintColor={theme.textSecondary}
                    />
                  </View>
                }
              />
            </Fragment>
          ))}
        </Surface>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  totalStat: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
