import { useQuery } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listLessons, queryKeys } from '@/lib/queries';

import { ErrorState } from '@/components/error-state';
import { ListRow } from '@/components/list-row';
import { LoadingState } from '@/components/loading-state';
import { NO_LESSON_NAME } from '@/features/library/lesson-summaries';
import { ListDivider } from '@/features/library/list-divider';
import { ModalScaffold } from '@/features/library/modal-scaffold';

export interface LessonPickerModalProps {
  visible: boolean;
  currentLessonId: string | null;
  submitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSelect: (lessonId: string | null) => void;
}

/** Bottom sheet listing "No lesson" plus every lesson, with the current one checked. */
export function LessonPickerModal({
  visible,
  currentLessonId,
  submitting,
  errorMessage,
  onClose,
  onSelect,
}: LessonPickerModalProps) {
  const theme = useTheme();
  const lessonsQuery = useQuery({
    queryKey: queryKeys.lessons,
    queryFn: listLessons,
    enabled: visible,
  });

  const check = <SymbolView name="checkmark" size={16} tintColor={theme.primary} />;
  const options: { id: string | null; name: string }[] = [
    { id: null, name: NO_LESSON_NAME },
    ...(lessonsQuery.data ?? []).map((lesson) => ({ id: lesson.id, name: lesson.name })),
  ];

  return (
    <ModalScaffold visible={visible} onClose={onClose} dismissable={!submitting} position="bottom">
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Move to lesson</Text>
        {submitting && <ActivityIndicator color={theme.primary} />}
      </View>
      {errorMessage !== null && (
        <Text style={[styles.error, { color: theme.danger }]}>{errorMessage}</Text>
      )}
      {lessonsQuery.isPending ? (
        <View style={styles.stateBox}>
          <LoadingState label="Loading lessons" />
        </View>
      ) : lessonsQuery.isError ? (
        <View style={styles.stateBox}>
          <ErrorState
            message={lessonsQuery.error.message}
            onRetry={() => {
              void lessonsQuery.refetch();
            }}
          />
        </View>
      ) : (
        <ScrollView style={styles.list}>
          {options.map((option, index) => (
            <View key={option.id ?? 'none'}>
              {index > 0 && <ListDivider />}
              <ListRow
                title={option.name}
                onPress={
                  submitting
                    ? undefined
                    : () => {
                        onSelect(option.id);
                      }
                }
                right={option.id === currentLessonId ? check : null}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 600,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  stateBox: {
    minHeight: 200,
  },
  list: {
    flexShrink: 1,
  },
});
