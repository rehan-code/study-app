import { useMutation } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { TextField } from '@/components/text-field';
import { Radius, Spacing } from '@/constants/theme';
import {
  describeImportProgress,
  describeImportRange,
  describeImportResult,
  importProgressFraction,
  parsePageRange,
  type ImportPageRange,
  type PdfImport,
} from '@/domain/pdf-import';
import { ScanScreenHeader } from '@/features/scan/scan-screen-header';
import { usePdfImportRunner } from '@/features/scan/use-pdf-import-runner';
import { useTheme } from '@/hooks/use-theme';
import { createPdfImport, uploadPdf } from '@/lib/queries';

function KeepAwakeWhileRunning() {
  useKeepAwake();
  return null;
}

interface PickStepProps {
  onPicked: (uri: string) => void;
}

function PickStep({ onPicked }: PickStepProps) {
  const theme = useTheme();

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    onPicked(result.assets[0].uri);
  };

  return (
    <View style={styles.pickColumn}>
      <View style={[styles.heroIcon, { backgroundColor: theme.primarySoft }]}>
        <SymbolView name="book.closed" size={26} tintColor={theme.primary} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>Import from the book</Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>
        {
          "Pick the curriculum PDF, choose which pages to read, and Mufradat turns those pages' printed vocabulary tables into cards. Pause and resume whenever you like."
        }
      </Text>
      <Button
        label="Choose PDF"
        icon="doc.badge.plus"
        size="lg"
        onPress={() => {
          void pick();
        }}
      />
    </View>
  );
}

interface RangeStepProps {
  /** True when the pages come from a book that is already uploaded. */
  sameBook: boolean;
  busy: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onStart: (range: ImportPageRange) => void;
}

function RangeStep({ sameBook, busy, errorMessage, onCancel, onStart }: RangeStepProps) {
  const theme = useTheme();
  const [firstPage, setFirstPage] = useState('');
  const [lastPage, setLastPage] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);

  const submit = () => {
    const parsed = parsePageRange(firstPage, lastPage);
    if (!parsed.ok) {
      setRangeError(parsed.error);
      return;
    }
    setRangeError(null);
    onStart(parsed.range);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.rangeColumn}>
        <Text style={[styles.title, { color: theme.text }]}>Which pages?</Text>
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          {sameBook
            ? 'Read another stretch of the same PDF, no re-upload needed.'
            : 'Import just the lesson you are on, or leave both blank for the whole book.'}
        </Text>
        <Surface style={styles.rangeCard}>
          <View style={styles.rangeFields}>
            <View style={styles.flex}>
              <TextField
                label="First page"
                value={firstPage}
                onChangeText={(text) => {
                  setFirstPage(text);
                  setRangeError(null);
                }}
                placeholder="1"
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label="Last page"
                value={lastPage}
                onChangeText={(text) => {
                  setLastPage(text);
                  setRangeError(null);
                }}
                placeholder="End"
                keyboardType="number-pad"
              />
            </View>
          </View>
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {
              "Use the PDF's own page numbers, which can differ from the numbers printed on the page. Leave the last page blank to read to the end."
            }
          </Text>
          {rangeError !== null && (
            <Text style={[styles.statusText, { color: theme.danger }]}>{rangeError}</Text>
          )}
          {errorMessage !== null && (
            <Text style={[styles.statusText, { color: theme.danger }]}>{errorMessage}</Text>
          )}
        </Surface>
        <View style={styles.actions}>
          <Button
            label={busy ? 'Starting' : 'Start import'}
            icon="play.fill"
            loading={busy}
            onPress={submit}
          />
          <Button label="Cancel" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

interface ProgressStepProps {
  importRecord: PdfImport;
  running: boolean;
  runError: string | null;
  warnings: string[];
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

  return (
    <View style={styles.progressColumn}>
      {running && <KeepAwakeWhileRunning />}
      <Surface style={styles.progressCard}>
        <View style={styles.progressHeading}>
          <Text style={[styles.title, { color: theme.text }]}>
            {done ? 'Import finished' : 'Importing the book'}
          </Text>
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {describeImportRange(importRecord)}
          </Text>
        </View>
        <ProgressBar progress={done ? 1 : (fraction ?? 0)} />
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          {done
            ? `Added ${summary}.`
            : `${describeImportProgress(importRecord)} · ${summary} so far`}
        </Text>
        {running && (
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            Keep the app open; the screen stays awake while pages are read.
          </Text>
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
  { localUri: string; storagePath: null } | { localUri: null; storagePath: string };

export function PdfImportScreen() {
  const router = useRouter();
  const runner = usePdfImportRunner();
  const [pendingBook, setPendingBook] = useState<PendingBook | null>(null);
  const [pickingAnother, setPickingAnother] = useState(false);

  const startMutation = useMutation({
    mutationFn: async ({ book, range }: { book: PendingBook; range: ImportPageRange }) => {
      const path = book.storagePath === null ? await uploadPdf(book.localUri) : book.storagePath;
      return createPdfImport(path, range);
    },
    onSuccess: (created) => {
      setPendingBook(null);
      setPickingAnother(false);
      runner.reload();
      runner.start(created.id);
    },
  });

  const record = runner.importRecord;

  let body;
  if (runner.loading) {
    body = <LoadingState label="Checking your imports" />;
  } else if (runner.loadError !== null) {
    body = <ErrorState message={runner.loadError} onRetry={runner.reload} />;
  } else if (pendingBook !== null) {
    body = (
      <RangeStep
        sameBook={pendingBook.storagePath !== null}
        busy={startMutation.isPending}
        errorMessage={startMutation.isError ? startMutation.error.message : null}
        onCancel={() => {
          setPendingBook(null);
          setPickingAnother(false);
          startMutation.reset();
        }}
        onStart={(range) => {
          startMutation.mutate({ book: pendingBook, range });
        }}
      />
    );
  } else if (record === null || pickingAnother) {
    body = (
      <PickStep
        onPicked={(uri) => {
          startMutation.reset();
          setPendingBook({ localUri: uri, storagePath: null });
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
        onResume={() => {
          runner.start(record.id);
        }}
        onPause={runner.pause}
        onImportMorePages={() => {
          startMutation.reset();
          setPendingBook({ localUri: null, storagePath: record.storagePath });
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
  flex: {
    flex: 1,
  },
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
  rangeColumn: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  rangeCard: {
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  rangeFields: {
    flexDirection: 'row',
    gap: Spacing.three,
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
