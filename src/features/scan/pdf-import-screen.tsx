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
  describeImportProgress,
  describeImportResult,
  importProgressFraction,
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
  busy: boolean;
  errorMessage: string | null;
  onPicked: (uri: string) => void;
}

function PickStep({ busy, errorMessage, onPicked }: PickStepProps) {
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
      <Text style={[styles.title, { color: theme.text }]}>Import the whole book</Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>
        {
          "Pick the curriculum PDF and Mufradat reads every lesson's printed vocabulary tables into cards, a few pages at a time. Pause and resume whenever you like."
        }
      </Text>
      <Button
        label={busy ? 'Uploading' : 'Choose PDF'}
        icon="doc.badge.plus"
        size="lg"
        loading={busy}
        onPress={() => {
          void pick();
        }}
      />
      {errorMessage !== null && (
        <Text style={[styles.statusText, { color: theme.danger }]}>{errorMessage}</Text>
      )}
    </View>
  );
}

interface ProgressStepProps {
  importRecord: PdfImport;
  running: boolean;
  runError: string | null;
  warnings: string[];
  onResume: () => void;
  onPause: () => void;
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
  onImportAnother,
  onOpenLibrary,
}: ProgressStepProps) {
  const theme = useTheme();
  const done = importRecord.status === 'done';
  const fraction = importProgressFraction(importRecord.totalPages, importRecord.nextPage);
  const errorText = runError ?? importRecord.lastError;
  const summary = describeImportResult(importRecord.lessonsCreated, importRecord.cardsCreated);

  return (
    <View style={styles.progressColumn}>
      {running && <KeepAwakeWhileRunning />}
      <Surface style={styles.progressCard}>
        <Text style={[styles.title, { color: theme.text }]}>
          {done ? 'Import finished' : 'Importing the book'}
        </Text>
        <ProgressBar progress={done ? 1 : (fraction ?? 0)} />
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          {done
            ? `Added ${summary}.`
            : `${describeImportProgress(importRecord.totalPages, importRecord.nextPage)} · ${summary} so far`}
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

export function PdfImportScreen() {
  const router = useRouter();
  const runner = usePdfImportRunner();
  const [pickingAnother, setPickingAnother] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (uri: string) => {
      const path = await uploadPdf(uri);
      return createPdfImport(path);
    },
    onSuccess: (created) => {
      setPickingAnother(false);
      runner.reload();
      runner.start(created.id);
    },
  });

  const record = runner.importRecord;
  const showPicker = record === null || (record.status === 'done' && pickingAnother);

  let body;
  if (runner.loading) {
    body = <LoadingState label="Checking your imports" />;
  } else if (runner.loadError !== null) {
    body = <ErrorState message={runner.loadError} onRetry={runner.reload} />;
  } else if (showPicker || record === null) {
    body = (
      <PickStep
        busy={uploadMutation.isPending}
        errorMessage={uploadMutation.isError ? uploadMutation.error.message : null}
        onPicked={(uri) => {
          uploadMutation.mutate(uri);
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
  progressColumn: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  progressCard: {
    gap: Spacing.three,
  },
  actions: {
    gap: Spacing.two,
    alignItems: 'center',
  },
});
