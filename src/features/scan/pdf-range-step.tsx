import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { IconButton } from '@/components/icon-button';
import { LoadingState } from '@/components/loading-state';
import { Surface } from '@/components/surface';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import {
  clampPage,
  describePageSelection,
  parsePageRange,
  type ImportPageRange,
} from '@/domain/pdf-import';
import { PdfPagePreview } from '@/features/scan/pdf-page-preview';
import { useTheme } from '@/hooks/use-theme';
import { getPdfPageCount, isPdfPreviewAvailable } from '@/lib/pdf-preview';

export interface PdfRangeStepProps {
  /** The book on disk, when a copy is still there to draw pages from. */
  localUri: string | null;
  /** Pages recorded by an earlier import of the same book, if any. */
  knownTotalPages: number | null;
  /** Page the browser opens on, normally where the last import stopped. */
  startAtPage: number;
  /** True when the pages come from a book that is already uploaded. */
  sameBook: boolean;
  busy: boolean;
  busyLabel: string;
  errorMessage: string | null;
  onCancel: () => void;
  onStart: (range: ImportPageRange, totalPages: number | null) => void;
}

interface PageNumbersFormProps {
  sameBook: boolean;
  totalPages: number | null;
  /** Why there are no page images to look at, when that needs saying. */
  previewNote: string | null;
  busy: boolean;
  busyLabel: string;
  errorMessage: string | null;
  onCancel: () => void;
  onStart: (range: ImportPageRange, totalPages: number | null) => void;
}

/** Typed page numbers, for when the book cannot be drawn on this device. */
function PageNumbersForm({
  sameBook,
  totalPages,
  previewNote,
  busy,
  busyLabel,
  errorMessage,
  onCancel,
  onStart,
}: PageNumbersFormProps) {
  const theme = useTheme();
  const [firstPage, setFirstPage] = useState('');
  const [lastPage, setLastPage] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);

  const submit = () => {
    const parsed = parsePageRange(firstPage, lastPage, totalPages);
    if (!parsed.ok) {
      setRangeError(parsed.error);
      return;
    }
    setRangeError(null);
    onStart(parsed.range, totalPages);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.formColumn}>
        <Text style={[styles.title, { color: theme.text }]}>Which pages?</Text>
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          {sameBook
            ? 'Read another stretch of the same PDF, no re-upload needed.'
            : 'Import just the lesson you are on, or leave both blank for the whole book.'}
        </Text>
        <Surface style={styles.formCard}>
          {previewNote !== null && (
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>{previewNote}</Text>
          )}
          <View style={styles.fieldRow}>
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
                placeholder={totalPages === null ? 'End' : String(totalPages)}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {totalPages === null
              ? "Use the PDF's own page numbers, which can differ from the numbers printed on the page. Leave the last page blank to read to the end."
              : `This book has ${totalPages} pages. Use the PDF's own numbering, which can differ from the numbers printed on the page.`}
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
            label={busy ? busyLabel : 'Start import'}
            icon="play.fill"
            loading={busy}
            onPress={submit}
          />
          <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** A number pad has no return key, so the jump field needs its own Done. */
const PAGE_FIELD_ACCESSORY = 'pdf-page-field';

interface PageBrowserProps {
  localUri: string;
  totalPages: number;
  startAtPage: number;
  busy: boolean;
  busyLabel: string;
  errorMessage: string | null;
  onCancel: () => void;
  onStart: (range: ImportPageRange, totalPages: number | null) => void;
}

/** Flick through the real pages, then mark where the lesson starts and ends. */
function PageBrowser({
  localUri,
  totalPages,
  startAtPage,
  busy,
  busyLabel,
  errorMessage,
  onCancel,
  onStart,
}: PageBrowserProps) {
  const theme = useTheme();
  const opening = clampPage(startAtPage, totalPages);
  const [page, setPage] = useState(opening);
  const [pageText, setPageText] = useState(String(opening));
  // Until an end is marked the selection follows the page on screen, so paging
  // to a lesson and importing straight away takes that page and not page one.
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
  const firstPage = selection?.from ?? page;
  const lastPage = selection?.to ?? page;

  const goTo = (next: number) => {
    const clamped = clampPage(next, totalPages);
    setPage(clamped);
    setPageText(String(clamped));
  };

  const onPageTextChange = (text: string) => {
    setPageText(text);
    const typed = Number(text);
    if (text.length > 0 && Number.isInteger(typed) && typed >= 1 && typed <= totalPages) {
      setPage(typed);
    }
  };

  // Marking one end past the other drags that one along, so a selection can
  // never come out backwards.
  const markFirst = () => {
    setSelection({ from: page, to: Math.max(page, lastPage) });
  };

  const markLast = () => {
    setSelection({ from: Math.min(page, firstPage), to: page });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.browserColumn}>
        <Pressable
          style={styles.flex}
          accessibilityLabel="Page preview"
          onPress={() => {
            Keyboard.dismiss();
          }}
        >
          <PdfPagePreview localUri={localUri} page={page} />
        </Pressable>
        <View style={styles.pager}>
          <IconButton
            icon="chevron.left"
            accessibilityLabel="Previous page"
            onPress={() => {
              goTo(page - 1);
            }}
            disabled={page <= 1}
            themeColor="primary"
            background="primarySoft"
          />
          <View style={styles.pageField}>
            <TextField
              value={pageText}
              onChangeText={onPageTextChange}
              onBlur={() => {
                goTo(Number(pageText));
              }}
              keyboardType="number-pad"
              textAlign="center"
              inputAccessoryViewID={Platform.OS === 'ios' ? PAGE_FIELD_ACCESSORY : undefined}
            />
          </View>
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>of {totalPages}</Text>
          <IconButton
            icon="chevron.right"
            accessibilityLabel="Next page"
            onPress={() => {
              goTo(page + 1);
            }}
            disabled={page >= totalPages}
            themeColor="primary"
            background="primarySoft"
          />
        </View>
        <Surface style={styles.selectionCard}>
          <View style={styles.fieldRow}>
            <View style={styles.flex}>
              <Button label="Start here" variant="secondary" onPress={markFirst} />
            </View>
            <View style={styles.flex}>
              <Button label="End here" variant="secondary" onPress={markLast} />
            </View>
          </View>
          <Text style={[styles.statusText, { color: theme.text }]}>
            {describePageSelection(firstPage, lastPage)}
          </Text>
          {errorMessage !== null && (
            <Text style={[styles.statusText, { color: theme.danger }]}>{errorMessage}</Text>
          )}
        </Surface>
        <View style={styles.actions}>
          <Button
            label={busy ? busyLabel : 'Import these pages'}
            icon="play.fill"
            loading={busy}
            onPress={() => {
              onStart({ fromPage: firstPage, toPage: lastPage }, totalPages);
            }}
          />
          <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
        </View>
      </View>
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={PAGE_FIELD_ACCESSORY}>
          <View
            style={[
              styles.keyboardBar,
              { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
            ]}
          >
            <Button
              label="Done"
              variant="ghost"
              onPress={() => {
                Keyboard.dismiss();
              }}
            />
          </View>
        </InputAccessoryView>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * Choosing the pages to import. The book is drawn from the copy on the device
 * so a lesson can be found by eye; typed page numbers are the fallback when
 * there is no copy left to draw, or no renderer on this platform.
 */
export function PdfRangeStep({
  localUri,
  knownTotalPages,
  startAtPage,
  sameBook,
  busy,
  busyLabel,
  errorMessage,
  onCancel,
  onStart,
}: PdfRangeStepProps) {
  const previewable = localUri !== null && isPdfPreviewAvailable();

  const {
    data: totalPages,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['pdf-page-count', localUri],
    queryFn: async () => {
      if (localUri === null) {
        throw new Error('There is no copy of this book on the device.');
      }
      return getPdfPageCount(localUri);
    },
    enabled: previewable,
    staleTime: Infinity,
    retry: false,
  });

  if (previewable && isPending) {
    return <LoadingState label="Opening the book" />;
  }

  if (localUri !== null && totalPages !== undefined) {
    return (
      <PageBrowser
        localUri={localUri}
        totalPages={totalPages}
        startAtPage={startAtPage}
        busy={busy}
        busyLabel={busyLabel}
        errorMessage={errorMessage}
        onCancel={onCancel}
        onStart={onStart}
      />
    );
  }

  return (
    <PageNumbersForm
      sameBook={sameBook}
      totalPages={knownTotalPages}
      previewNote={
        isError ? "This PDF's pages could not be drawn, so enter the numbers instead." : null
      }
      busy={busy}
      busyLabel={busyLabel}
      errorMessage={errorMessage}
      onCancel={onCancel}
      onStart={onStart}
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  formColumn: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  browserColumn: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  formCard: {
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  selectionCard: {
    gap: Spacing.three,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  pageField: {
    width: 88,
  },
  keyboardBar: {
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
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
  actions: {
    gap: Spacing.two,
    alignItems: 'center',
  },
});
