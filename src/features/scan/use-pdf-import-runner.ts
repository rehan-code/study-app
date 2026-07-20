import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ImportBatchResult, PdfImport } from '@/domain/pdf-import';
import { importPdfBatch } from '@/lib/api';
import { getLatestPdfImport, queryKeys } from '@/lib/queries';

export interface PdfImportRunner {
  /** Latest known import, live-updated while batches run. */
  importRecord: PdfImport | null;
  loading: boolean;
  loadError: string | null;
  running: boolean;
  runError: string | null;
  lastWarnings: string[];
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
  const activeImportIdRef = useRef<string | null>(null);
  const loopingRef = useRef(false);

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
        setLastWarnings(result.batch?.warnings ?? []);
        if (result.status === 'done') {
          setRunning(false);
          loopingRef.current = false;
          return;
        }
      }
    },
    [applyResult, queryClient],
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
    start,
    pause,
    reload,
  };
}
