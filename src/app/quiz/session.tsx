import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { parseQuizParams } from '@/features/quiz/quiz-config';
import { QuizSessionScreen } from '@/features/quiz/quiz-session-screen';

export default function QuizSessionRoute() {
  const params = useLocalSearchParams();
  const config = useMemo(() => parseQuizParams(params), [params]);

  return <QuizSessionScreen config={config} />;
}
