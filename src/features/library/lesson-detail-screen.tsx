import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { isDue } from '@/domain/srs';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteLesson,
  listCards,
  listLessons,
  NO_LESSON_ID,
  queryKeys,
  renameLesson,
} from '@/lib/queries';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { IconButton } from '@/components/icon-button';
import { LoadingState } from '@/components/loading-state';
import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { CardListRow } from '@/features/library/card-list-row';
import { DetailHeader } from '@/features/library/detail-header';
import { NO_LESSON_NAME } from '@/features/library/lesson-summaries';
import { ListDivider } from '@/features/library/list-divider';
import {
  invalidateAllCardQueries,
  invalidateLessonQueries,
} from '@/features/library/query-invalidation';
import { RenameLessonModal } from '@/features/library/rename-lesson-modal';

export interface LessonDetailScreenProps {
  /** A real lesson id or NO_LESSON_ID for the virtual "No lesson" group. */
  lessonId: string;
}

export function LessonDetailScreen({ lessonId }: LessonDetailScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const isNoLesson = lessonId === NO_LESSON_ID;

  const lessonsQuery = useQuery({
    queryKey: queryKeys.lessons,
    queryFn: listLessons,
    enabled: !isNoLesson,
  });
  const cardsQuery = useQuery({
    queryKey: queryKeys.cards([lessonId]),
    queryFn: () => listCards([lessonId]),
  });

  const [renameVisible, setRenameVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const lesson = lessonsQuery.data?.find((entry) => entry.id === lessonId) ?? null;
  const title = isNoLesson ? NO_LESSON_NAME : (lesson?.name ?? 'Lesson');

  const rows = useMemo(() => {
    const now = new Date();
    return (cardsQuery.data ?? []).map((card) => ({ card, due: isDue(card.srs, now) }));
  }, [cardsQuery.data]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const renameMutation = useMutation({
    mutationFn: (name: string) => renameLesson(lessonId, name),
    onSuccess: async () => {
      await invalidateLessonQueries(queryClient);
      setRenameVisible(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLesson(lessonId),
    onSuccess: () => {
      goBack();
      void invalidateLessonQueries(queryClient);
      void invalidateAllCardQueries(queryClient);
    },
    onError: (error) => {
      Alert.alert("Couldn't delete the lesson", error.message);
    },
  });

  const confirmDelete = () => {
    Alert.alert('Delete this lesson?', 'Your cards are kept. They move to No lesson.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteMutation.mutate();
        },
      },
    ]);
  };

  const openMenu = () => {
    Alert.alert(title, undefined, [
      {
        text: 'Rename lesson',
        onPress: () => {
          renameMutation.reset();
          setRenameVisible(true);
        },
      },
      { text: 'Delete lesson', style: 'destructive', onPress: confirmDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onRefresh = () => {
    setRefreshing(true);
    const refetches = [cardsQuery.refetch(), ...(isNoLesson ? [] : [lessonsQuery.refetch()])];
    void Promise.all(refetches).finally(() => {
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
        <DetailHeader
          title={title}
          onBack={goBack}
          right={
            isNoLesson ? undefined : (
              <IconButton
                icon="ellipsis.circle"
                accessibilityLabel="Lesson options"
                onPress={openMenu}
              />
            )
          }
        />
        {cardsQuery.isPending ? (
          <LoadingState label="Loading cards" />
        ) : cardsQuery.isError ? (
          <ErrorState
            message={cardsQuery.error.message}
            onRetry={() => {
              void cardsQuery.refetch();
            }}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="rectangle.stack"
            title="No cards here"
            message={
              isNoLesson
                ? 'Cards without a lesson will show up here.'
                : 'Cards you move into this lesson will show up here.'
            }
          />
        ) : (
          <Surface padded={false}>
            {rows.map(({ card, due }, index) => (
              <Fragment key={card.id}>
                {index > 0 && <ListDivider />}
                <CardListRow
                  card={card}
                  due={due}
                  onPress={() => {
                    router.push(`/card/${card.id}`);
                  }}
                />
              </Fragment>
            ))}
          </Surface>
        )}
      </ScrollView>
      <RenameLessonModal
        visible={renameVisible}
        initialName={lesson?.name ?? ''}
        submitting={renameMutation.isPending}
        errorMessage={renameMutation.error?.message ?? null}
        onClose={() => {
          setRenameVisible(false);
        }}
        onSubmit={(name) => {
          renameMutation.mutate(name);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: Spacing.three,
    paddingTop: 0,
    gap: Spacing.three,
  },
});
