import { Redirect, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';

import { LessonDetailScreen } from '@/features/library/lesson-detail-screen';

const paramsSchema = z.object({ id: z.string().min(1) });

export default function LessonRoute() {
  const params = useLocalSearchParams();
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return <Redirect href="/" />;
  }
  return <LessonDetailScreen lessonId={parsed.data.id} />;
}
