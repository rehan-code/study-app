import { useLocalSearchParams, useRouter } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ScanReviewScreen } from '@/features/scan/scan-review-screen';

export default function ScanReviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  if (typeof id !== 'string' || id.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="doc.text.viewfinder"
          title="Scan not found"
          message="This scan link is broken."
          action={{
            label: 'Back to scans',
            onPress: () => {
              router.back();
            },
          }}
        />
      </Screen>
    );
  }

  return <ScanReviewScreen id={id} />;
}
