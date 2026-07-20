import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Screen } from '@/components/screen';
import { listCards, queryKeys } from '@/lib/queries';
import { useStudyFilter } from '@/lib/stores';

import type { QuizConfig } from '@/features/quiz/quiz-config';
import { QuizRunner } from '@/features/quiz/quiz-runner';

export interface QuizSessionScreenProps {
  config: QuizConfig | null;
}

function goBackHome() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

export function QuizSessionScreen({ config }: QuizSessionScreenProps) {
  const selectedLessonIds = useStudyFilter((state) => state.selectedLessonIds);
  const cardsQuery = useQuery({
    queryKey: queryKeys.cards(selectedLessonIds),
    queryFn: () => listCards(selectedLessonIds),
  });

  if (config === null) {
    return (
      <Screen>
        <EmptyState
          icon="questionmark.circle"
          title="Couldn't start the quiz"
          message="The quiz settings look off. Head back and start it again."
          action={{ label: 'Go back', onPress: goBackHome }}
        />
      </Screen>
    );
  }

  if (cardsQuery.isPending) {
    return (
      <Screen>
        <LoadingState label="Preparing your quiz" />
      </Screen>
    );
  }

  if (cardsQuery.isError) {
    return (
      <Screen>
        <ErrorState
          message={cardsQuery.error.message}
          onRetry={() => {
            void cardsQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  return <QuizRunner cards={cardsQuery.data} config={config} />;
}
