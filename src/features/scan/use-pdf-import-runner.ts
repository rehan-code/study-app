import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { visibleWarnings } from '@/domain/parsed-scan';
import type { ImportBatchResult, PdfImport } from '@/domain/pdf-import';
import { generateImagesForCards } from '@/features/scan/generate-card-images';
import { missingImagesKey } from '@/features/settings/use-missing-card-images';
import { generateCardImage, importPdfBatch } from '@/lib/api';
import { getLatestPdfImport, listImportedCardIdsWithoutImages, queryKeys } from '@/lib/queries';
import { useSettings } from '@/lib/stores';

export interface PdfImportRunner {
  /** Latest known import, live-updated while batches run. */
  importRecord: PdfImport | null;
  loading: boolean;
  loadError: string | null;
  running: boolean;
  runError: string | null;
  lastWarnings: string[];
  /** Line about card pictures being made, or null when none are in flight. */
  imageStatus: string | null;
  start: (importId: string) => void;
  pause: () => void;
  reload: () => void;
}

function mergeBatchResult(record: PdfImport, result: ImportBatchResult): PdfImport {
  return {
    ...record,
    status: result.status,
    totalPages: result.totalPages,
    nextPage: result.nextPage,
    lessonsCreated: result.lessonsCreated,
    cardsCreated: result.cardsCreated,
    lastError: null,
  };
}

/**
 * Drives an import one batch at a time while the screen stays open. Pausing
 * lets the in-flight batch finish server side; the cursor in pdf_imports makes
 * resuming safe at any point, including after the app was killed.
 */
export function usePdfImportRunner(): PdfImportRunner {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const activeImportIdRef = useRef<string | null>(null);
  const loopingRef = useRef(false);
  // A resume that finishes a second time must not restart pictures already
  // being made for the same import.
  const makingImagesRef = useRef(false);

  const latestQuery = useQuery({
    queryKey: queryKeys.pdfImports,
    queryFn: getLatestPdfImport,
  });

  useEffect(() => {
    return () => {
      loopingRef.current = false;
    };
  }, []);

  const applyResult = useCallback(
    (importId: string, result: ImportBatchResult) => {
      queryClient.setQueryData<PdfImport | null>(queryKeys.pdfImports, (previous) =>
        previous !== null && previous !== undefined && previous.id === importId
          ? mergeBatchResult(previous, result)
          : previous,
      );
      // New cards land every batch; the library should fill up live.
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons });
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
    },
    [queryClient],
  );

  /**
   * Imported cards arrive straight from the edge function, which never calls
   * fal.ai, so nothing has a picture until this runs. Best effort: a card that
   * fails just stays imageless and can be generated from the card screen.
   */
  const makeCardImages = useCallback(
    async (importId: string) => {
      if (!useSettings.getState().aiImagesEnabled || makingImagesRef.current) {
        return;
      }
      let cardIds: string[];
      try {
        cardIds = await listImportedCardIdsWithoutImages(importId);
      } catch (error) {
        console.warn('[pdf-import] could not list cards for images:', error);
        return;
      }
      if (cardIds.length === 0) {
        return;
      }
      makingImagesRef.current = true;
      let made = 0;
      setImageStatus(`Making card pictures, 0 of ${cardIds.length}`);
      const result = await generateImagesForCards(cardIds, {
        generate: generateCardImage,
        onImageReady: (cardId) => {
          made += 1;
          setImageStatus(`Making card pictures, ${made} of ${cardIds.length}`);
          void queryClient.invalidateQueries({ queryKey: queryKeys.cards([]) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.card(cardId) });
        },
      });
      makingImagesRef.current = false;
      setImageStatus(
        result.failed === 0
          ? `Added ${result.succeeded} card pictures.`
          : `Added ${result.succeeded} card pictures; ${result.failed} could not be made.`,
      );
      // Settings counts what is still missing, so it must not go stale here.
      void queryClient.invalidateQueries({ queryKey: missingImagesKey });
    },
    [queryClient],
  );

  const runLoop = useCallback(
    async (importId: string) => {
      while (loopingRef.current && activeImportIdRef.current === importId) {
        let result: ImportBatchResult;
        try {
          result = await importPdfBatch(importId);
        } catch (error) {
          if (loopingRef.current) {
            setRunError(
              error instanceof Error ? error.message : 'Something went wrong. Try resuming.',
            );
            setRunning(false);
            loopingRef.current = false;
            void queryClient.invalidateQueries({ queryKey: queryKeys.pdfImports });
          }
          return;
        }
        applyResult(importId, result);
        setLastWarnings(visibleWarnings(result.batch?.warnings ?? []));
        if (result.status === 'done') {
          setRunning(false);
          loopingRef.current = false;
          // Pictures keep arriving after the pages are read; the screen stays
          // usable and the library fills in behind it.
          void makeCardImages(importId);
          return;
        }
      }
    },
    [applyResult, makeCardImages, queryClient],
  );

  const start = useCallback(
    (importId: string) => {
      if (loopingRef.current) {
        return;
      }
      activeImportIdRef.current = importId;
      loopingRef.current = true;
      setRunning(true);
      setRunError(null);
      setImageStatus(null);
      void runLoop(importId);
    },
    [runLoop],
  );

  const pause = useCallback(() => {
    loopingRef.current = false;
    setRunning(false);
  }, []);

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.pdfImports });
  }, [queryClient]);

  return {
    importRecord: latestQuery.data ?? null,
    loading: latestQuery.isPending,
    loadError: latestQuery.isError ? latestQuery.error.message : null,
    running,
    runError,
    lastWarnings,
    imageStatus,
    start,
    pause,
    reload,
  };
}
