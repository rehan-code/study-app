import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Screen } from '@/components/screen';
import { parsedToDrafts } from '@/domain/scan-review';
import type { Scan } from '@/domain/scans';
import { ReviewEditor } from '@/features/scan/review-editor';
import { ScanScreenHeader } from '@/features/scan/scan-screen-header';
import { SCAN_KIND_INFO } from '@/features/scan/scan-kind-info';
import { SCAN_POLL_INTERVAL_MS } from '@/features/scan/scan-status';
import { StagedProgress } from '@/features/scan/staged-progress';
import { parseScan } from '@/lib/api';
import { getScan, queryKeys } from '@/lib/queries';

const PARSE_FALLBACK_MESSAGE = "Couldn't read that page. Please try again.";

function reviewedSummaryMessage(scan: Scan): string {
  if (scan.parsed === null) {
    return 'Its cards are already in your library.';
  }
  const rowCount = parsedToDrafts(scan.kind, scan.parsed, null).length;
  if (rowCount === 0) {
    return 'It had no readable rows, so no cards were created.';
  }
  if (rowCount === 1) {
    return 'Its 1 row went through review. Saved cards live in your library.';
  }
  return `Its ${rowCount} rows went through review. Saved cards live in your library.`;
}

export interface ScanReviewScreenProps {
  id: string;
}

export function ScanReviewScreen({ id }: ScanReviewScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const scanQuery = useQuery({
    queryKey: queryKeys.scan(id),
    queryFn: () => getScan(id),
    refetchInterval: (query) =>
      query.state.data?.status === 'parsing' ? SCAN_POLL_INTERVAL_MS : false,
  });

  const parseMutation = useMutation({
    mutationFn: () => parseScan(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.scans });
    },
    onError: async () => {
      // The edge function persists failed status + parse_error; refetch shows it.
      await queryClient.invalidateQueries({ queryKey: queryKeys.scans });
    },
  });

  const title =
    scanQuery.data === undefined ? 'Review scan' : SCAN_KIND_INFO[scanQuery.data.kind].label;

  const renderLoadedBody = (scan: Scan) => {
    if (scan.status === 'parsing' || parseMutation.isPending) {
      return <StagedProgress stage="reading" />;
    }
    if (scan.status === 'uploaded') {
      return (
        <EmptyState
          icon="doc.text.viewfinder"
          title="Not read yet"
          message="The pages were uploaded but never read. Start reading to turn them into cards."
          action={{
            label: 'Start reading',
            onPress: () => {
              parseMutation.mutate();
            },
          }}
        />
      );
    }
    if (scan.status === 'failed') {
      return (
        <ErrorState
          message={scan.parseError ?? PARSE_FALLBACK_MESSAGE}
          onRetry={() => {
            parseMutation.mutate();
          }}
        />
      );
    }
    if (scan.status === 'reviewed') {
      return (
        <EmptyState
          icon="checkmark.seal"
          title="Already reviewed"
          message={reviewedSummaryMessage(scan)}
          action={{
            label: 'Go to Library',
            onPress: () => {
              router.replace('/library');
            },
          }}
        />
      );
    }
    if (scan.parsed === null) {
      // Status says parsed but the rows are missing; re-parsing repairs it.
      return (
        <ErrorState
          message="The parsed rows are missing. Try reading the page again."
          onRetry={() => {
            parseMutation.mutate();
          }}
        />
      );
    }
    return <ReviewEditor key={scan.id} scan={scan} parsed={scan.parsed} />;
  };

  let body;
  if (scanQuery.isPending) {
    body = <LoadingState label="Loading the scan" />;
  } else if (scanQuery.isError) {
    body = (
      <ErrorState
        message={scanQuery.error.message}
        onRetry={() => {
          void scanQuery.refetch();
        }}
      />
    );
  } else {
    body = renderLoadedBody(scanQuery.data);
  }

  return (
    <Screen padded={false}>
      <ScanScreenHeader
        title={title}
        onBack={() => {
          router.back();
        }}
      />
      {body}
    </Screen>
  );
}
