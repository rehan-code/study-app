import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import type { ScanKind } from '@/domain/cards';
import type { ScanPhoto } from '@/features/scan/photo-selection';
import { preparePhotoForUpload } from '@/features/scan/prepare-photo';
import { parseScan } from '@/lib/api';
import { createScan, queryKeys, uploadScanPage } from '@/lib/queries';

export type SubmitStage = 'uploading' | 'reading' | 'building';

export type SubmitScanState =
  | { phase: 'idle' }
  | { phase: 'running'; stage: SubmitStage }
  | { phase: 'failed'; message: string; scanId: string | null };

export interface UseSubmitScanResult {
  state: SubmitScanState;
  submit: (kind: ScanKind, photos: readonly ScanPhoto[]) => void;
  retryParse: () => void;
  reset: () => void;
}

const FALLBACK_MESSAGE = "Couldn't finish the scan. Please try again.";

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return FALLBACK_MESSAGE;
}

/**
 * Runs the whole new-scan pipeline: downscale + upload each photo, create the
 * scan row, parse it, then replace the route with the review screen. On parse
 * failure the scan stays in the list as failed (the edge function persists it).
 */
export function useSubmitScan(): UseSubmitScanResult {
  const [state, setState] = useState<SubmitScanState>({ phase: 'idle' });
  const queryClient = useQueryClient();
  const router = useRouter();
  const busyRef = useRef(false);

  const parseAndOpenReview = useCallback(
    async (scanId: string) => {
      await parseScan(scanId);
      setState({ phase: 'running', stage: 'building' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.scans });
      router.replace(`/scan/${scanId}/review`);
    },
    [queryClient, router],
  );

  const submit = useCallback(
    (kind: ScanKind, photos: readonly ScanPhoto[]) => {
      if (busyRef.current || photos.length === 0) {
        return;
      }
      busyRef.current = true;
      setState({ phase: 'running', stage: 'uploading' });
      void (async () => {
        let scanId: string | null = null;
        try {
          const paths: string[] = [];
          for (const photo of photos) {
            const prepared = await preparePhotoForUpload(photo.uri);
            paths.push(await uploadScanPage(prepared));
          }
          const scan = await createScan(kind, paths);
          scanId = scan.id;
          setState({ phase: 'running', stage: 'reading' });
          await queryClient.invalidateQueries({ queryKey: queryKeys.scans });
          await parseAndOpenReview(scan.id);
        } catch (error) {
          await queryClient.invalidateQueries({ queryKey: queryKeys.scans });
          setState({ phase: 'failed', message: messageFrom(error), scanId });
        } finally {
          busyRef.current = false;
        }
      })();
    },
    [parseAndOpenReview, queryClient],
  );

  const retryParse = useCallback(() => {
    if (busyRef.current || state.phase !== 'failed' || state.scanId === null) {
      return;
    }
    const scanId = state.scanId;
    busyRef.current = true;
    setState({ phase: 'running', stage: 'reading' });
    void (async () => {
      try {
        await parseAndOpenReview(scanId);
      } catch (error) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.scans });
        setState({ phase: 'failed', message: messageFrom(error), scanId });
      } finally {
        busyRef.current = false;
      }
    })();
  }, [parseAndOpenReview, queryClient, state]);

  const reset = useCallback(() => {
    if (busyRef.current) {
      return;
    }
    setState({ phase: 'idle' });
  }, []);

  return { state, submit, retryParse, reset };
}
