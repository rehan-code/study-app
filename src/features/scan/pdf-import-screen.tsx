import { useMutation } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { Radius, Spacing } from '@/constants/theme';
import {
  bookPageRange,
  describeImportProgress,
  describeImportRange,
  describeImportResult,
  describeReadingNow,
  importProgressFraction,
  inFlightBatchFraction,
  type ImportPageRange,
  type PdfImport,
} from '@/domain/pdf-import';
import { PdfRangeStep } from '@/features/scan/pdf-range-step';
import { ScanScreenHeader } from '@/features/scan/scan-screen-header';
import { usePdfImportRunner } from '@/features/scan/use-pdf-import-runner';
import { useTheme } from '@/hooks/use-theme';
import { existingBookFile, keepBookFile } from '@/lib/book-file';
import { extractPdfPages, isPdfPreviewAvailable } from '@/lib/pdf-preview';
import { createPdfImport, uploadPdf } from '@/lib/queries';
import { useBookFile } from '@/lib/stores';

function KeepAwakeWhileRunning() {
  useKeepAwake();
  return null;
}

interface PickStepProps {
  busy: boolean;
  errorMessage: string | null;
  onPicked: (uri: string) => void;
}

function PickStep({ busy, errorMessage, onPicked }: PickStepProps) {
  const theme = useTheme();
  const [pickError, setPickError] = useState<string | null>(null);
  const problem = pickError ?? errorMessage;

  const pick = async () => {
    setPickError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      onPicked(result.assets[0].uri);
    } catch (error) {
      console.warn('[pdf-import] document picker failed:', error);
      setPickError("Couldn't open the file picker. Please try again.");
    }
  };

  return (
    <View style={styles.pickColumn}>
      <View style={[styles.heroIcon, { backgroundColor: theme.primarySoft }]}>
        <SymbolView name="book.closed" size={26} tintColor={theme.primary} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>Import from the book</Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>
        {
          "Pick the curriculum PDF, page through it to find the lesson you are on, and Mufradat turns those pages' printed vocabulary tables into cards. Pause and resume whenever you like."
        }
      </Text>
      <Button
        label={busy ? 'Opening' : 'Choose PDF'}
        icon="doc.badge.plus"
        size="lg"
        loading={busy}
        onPress={() => {
          void pick();
        }}
      />
      {problem !== null && (
        <Text style={[styles.statusText, { color: theme.danger }]}>{problem}</Text>
      )}
    </View>
  );
}

interface ProgressStepProps {
  importRecord: PdfImport;
  running: boolean;
  runError: string | null;
  warnings: string[];
  /** Line about card pictures being made, or null when none are in flight. */
  imageStatus: string | null;
  onResume: () => void;
  onPause: () => void;
  onImportMorePages: () => void;
  onImportAnother: () => void;
  onOpenLibrary: () => void;
}

function ProgressStep({
  importRecord,
  running,
  runError,
  warnings,
  imageStatus,
  onResume,
  onPause,
  onImportMorePages,
  onImportAnother,
  onOpenLibrary,
}: ProgressStepProps) {
  const theme = useTheme();
  const done = importRecord.status === 'done';
  const fraction = importProgressFraction(importRecord);
  const errorText = runError ?? importRecord.lastError;
  const summary = describeImportResult(importRecord.lessonsCreated, importRecord.cardsCreated);
  // A batch is one Claude call over six pages, so the cursor stands still for
  // minutes at a time. Naming the pages in flight, and letting the bar ease
  // across them, is what stops that looking like a stall.
  const readingNow = running ? describeReadingNow(importRecord) : null;
  const batchEnd = running ? inFlightBatchFraction(importRecord) : null;

  return (
    <View style={styles.progressColumn}>
      {running && <KeepAwakeWhileRunning />}
      <Surface style={styles.progressCard}>
        <View style={styles.progressHeading}>
          <Text style={[styles.title, { color: theme.text }]}>
            {done ? 'Import finished' : 'Importing the book'}
          </Text>
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {describeImportRange(bookPageRange(importRecord))}
          </Text>
        </View>
        <ProgressBar progress={done ? 1 : (fraction ?? 0)} advancingTo={batchEnd ?? undefined} />
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          {done
            ? `Added ${summary}.`
            : `${readingNow ?? describeImportProgress(importRecord)} · ${summary} so far`}
        </Text>
        {running && (
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {`${describeImportProgress(importRecord)} done. Keep the app open; the screen stays awake while pages are read.`}
          </Text>
        )}
        {imageStatus !== null && (
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>{imageStatus}</Text>
        )}
        {!running && !done && errorText !== null && (
          <Text style={[styles.statusText, { color: theme.danger }]}>{errorText}</Text>
        )}
        {warnings.length > 0 && (
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            Last batch notes: {warnings.join(' · ')}
          </Text>
        )}
      </Surface>
      {done ? (
        <View style={styles.actions}>
          <Button label="See your library" icon="books.vertical" onPress={onOpenLibrary} />
          <Button
            label="Import more pages"
            icon="plus"
            variant="secondary"
            onPress={onImportMorePages}
          />
          <Button label="Import another PDF" variant="ghost" onPress={onImportAnother} />
        </View>
      ) : running ? (
        <Button label="Pause" icon="pause.fill" variant="secondary" onPress={onPause} />
      ) : (
        <Button
          label={importRecord.status === 'created' ? 'Start import' : 'Resume import'}
          icon="play.fill"
          onPress={onResume}
        />
      )}
    </View>
  );
}

/**
 * A book waiting for its page range: freshly picked and still local, or one
 * already in storage when more pages of the same PDF are being imported.
 */
type PendingBook =
  | { kind: 'picked'; localUri: string }
  | { kind: 'uploaded'; storagePath: string; localUri: string | null };

export function PdfImportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const runner = usePdfImportRunner();
  const bookFile = useBookFile();
  const [pendingBook, setPendingBook] = useState<PendingBook | null>(null);
  const [pickingAnother, setPickingAnother] = useState(false);
  const [uploadFraction, setUploadFraction] = useState<number | null>(null);

  // Moving the picked file out of the picker's cache is quick but not instant
  // for a book, so the pick button stays busy until the copy is in place.
  const pickMutation = useMutation({
    mutationFn: (pickedUri: string) => keepBookFile(pickedUri),
    onSuccess: (localUri) => {
      setPendingBook({ kind: 'picked', localUri });
    },
  });

  const startMutation = useMutation({
    mutationFn: async ({
      book,
      range,
      totalPages,
    }: {
      book: PendingBook;
      range: ImportPageRange;
      totalPages: number | null;
    }) => {
      if (book.kind === 'uploaded') {
        return createPdfImport(book.storagePath, range, totalPages, 0);
      }
      // A whole curriculum is far past what storage accepts, and the importer
      // only reads the chosen lesson, so only those pages are cut out and sent.
      // The upload then starts at its own page 1, and page_offset is what puts
      // the book's numbering back on the progress screen.
      const sliceable = range.toPage !== null && isPdfPreviewAvailable();
      if (!sliceable) {
        setUploadFraction(0);
        const wholePath = await uploadPdf(book.localUri, setUploadFraction);
        bookFile.rememberBook(wholePath, book.localUri);
        return createPdfImport(wholePath, range, totalPages, 0);
      }
      const lastPage = range.toPage ?? range.fromPage;
      const slice = await extractPdfPages(book.localUri, range.fromPage, lastPage);
      setUploadFraction(0);
      const path = await uploadPdf(slice, setUploadFraction);
      bookFile.rememberBook(path, book.localUri);
      const pageCount = lastPage - range.fromPage + 1;
      return createPdfImport(
        path,
        { fromPage: 1, toPage: pageCount },
        pageCount,
        range.fromPage - 1,
      );
    },
    onSettled: () => {
      setUploadFraction(null);
    },
    onSuccess: (created) => {
      setPendingBook(null);
      setPickingAnother(false);
      runner.reload();
      runner.start(created.id);
    },
  });

  const record = runner.importRecord;
  const uploading = uploadFraction !== null;

  let body;
  if (runner.loading) {
    body = <LoadingState label="Checking your imports" />;
  } else if (runner.loadError !== null) {
    body = <ErrorState message={runner.loadError} onRetry={runner.reload} />;
  } else if (pendingBook !== null) {
    const sameBook = pendingBook.kind === 'uploaded';
    body = (
      <>
        <PdfRangeStep
          localUri={pendingBook.localUri}
          knownTotalPages={sameBook ? (record?.totalPages ?? null) : null}
          // Importing the next lesson normally carries on from where the last
          // one stopped, so the browser opens there instead of at page one.
          startAtPage={sameBook ? (record?.nextPage ?? 1) : 1}
          sameBook={sameBook}
          busy={startMutation.isPending}
          busyLabel={uploading ? 'Uploading' : 'Starting'}
          errorMessage={startMutation.isError ? startMutation.error.message : null}
          onCancel={() => {
            setPendingBook(null);
            setPickingAnother(false);
            startMutation.reset();
          }}
          onStart={(range, totalPages) => {
            startMutation.mutate({ book: pendingBook, range, totalPages });
          }}
        />
        {uploading && (
          <View style={styles.uploadBar}>
            <ProgressBar progress={uploadFraction} />
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>
              {`Uploading the book ${Math.round(uploadFraction * 100)}%`}
            </Text>
          </View>
        )}
      </>
    );
  } else if (record === null || pickingAnother) {
    body = (
      <PickStep
        busy={pickMutation.isPending}
        errorMessage={pickMutation.isError ? pickMutation.error.message : null}
        onPicked={(uri) => {
          startMutation.reset();
          pickMutation.mutate(uri);
        }}
      />
    );
  } else {
    body = (
      <ProgressStep
        importRecord={record}
        running={runner.running}
        runError={runner.runError}
        warnings={runner.lastWarnings}
        imageStatus={runner.imageStatus}
        onResume={() => {
          runner.start(record.id);
        }}
        onPause={runner.pause}
        onImportMorePages={() => {
          startMutation.reset();
          setPendingBook({
            kind: 'uploaded',
            storagePath: record.storagePath,
            localUri:
              bookFile.storagePath === record.storagePath
                ? existingBookFile(bookFile.localUri)
                : null,
          });
        }}
        onImportAnother={() => {
          setPickingAnother(true);
        }}
        onOpenLibrary={() => {
          router.push('/library');
        }}
      />
    );
  }

  return (
    <Screen padded={false}>
      <ScanScreenHeader
        title="Import book"
        onBack={() => {
          router.back();
        }}
      />
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pickColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.two,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  title: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 600,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 500,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
    textAlign: 'center',
  },
  uploadBar: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  progressColumn: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  progressCard: {
    gap: Spacing.three,
  },
  progressHeading: {
    gap: Spacing.one,
  },
  actions: {
    gap: Spacing.two,
    alignItems: 'center',
  },
});
