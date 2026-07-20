import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen>
      <EmptyState
        icon="questionmark.circle"
        title={"This screen doesn't exist"}
        message={"The link may be old or mistyped. Let's get you back to your cards."}
        action={{ label: 'Go home', onPress: () => router.replace('/') }}
      />
    </Screen>
  );
}
