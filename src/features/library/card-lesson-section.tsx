import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Card } from '@/domain/cards';

import { listLessons, queryKeys, setCardLesson } from '@/lib/queries';

import { ListRow } from '@/components/list-row';
import { LessonPickerModal } from '@/features/library/lesson-picker-modal';
import { NO_LESSON_NAME } from '@/features/library/lesson-summaries';
import { invalidateAllCardQueries } from '@/features/library/query-invalidation';
import { Section } from '@/features/library/section';

export function CardLessonSection({ card }: { card: Card }) {
  const queryClient = useQueryClient();
  const [pickerVisible, setPickerVisible] = useState(false);
  const lessonsQuery = useQuery({ queryKey: queryKeys.lessons, queryFn: listLessons });

  const moveMutation = useMutation({
    mutationFn: (lessonId: string | null) => setCardLesson(card.id, lessonId),
    onSuccess: async () => {
      await invalidateAllCardQueries(queryClient);
      setPickerVisible(false);
    },
  });

  const currentName =
    card.lessonId === null
      ? NO_LESSON_NAME
      : (lessonsQuery.data?.find((lesson) => lesson.id === card.lessonId)?.name ??
        (lessonsQuery.isPending ? 'Loading' : 'Unknown lesson'));

  return (
    <Section title="Lesson" padded={false}>
      <ListRow
        title={currentName}
        onPress={() => {
          moveMutation.reset();
          setPickerVisible(true);
        }}
      />
      <LessonPickerModal
        visible={pickerVisible}
        currentLessonId={card.lessonId}
        submitting={moveMutation.isPending}
        errorMessage={moveMutation.error?.message ?? null}
        onClose={() => {
          setPickerVisible(false);
        }}
        onSelect={(lessonId) => {
          if (lessonId === card.lessonId) {
            setPickerVisible(false);
            return;
          }
          moveMutation.mutate(lessonId);
        }}
      />
    </Section>
  );
}
