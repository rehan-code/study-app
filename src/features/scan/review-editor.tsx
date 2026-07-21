import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { Surface } from '@/components/surface';
import { Radius, Spacing } from '@/constants/theme';
import type { ParsedScan } from '@/domain/parsed-scan';
import { parsedToDrafts, validateDrafts, type ReviewDraft } from '@/domain/scan-review';
import type { Scan } from '@/domain/scans';
import { LessonPicker } from '@/features/scan/lesson-picker';
import {
  bulkLessonValue,
  clearFieldError,
  correctionCount,
  correctionSummaryMessage,
  distinctLessonNames,
  fieldErrorsFromProblems,
  headlineFieldKey,
  includedDrafts,
  setAllDraftLessons,
  setDraftField,
  setDraftLesson,
  setDraftMeaning,
  setDraftNote,
  toggleDraftExcluded,
  type DraftFieldErrors,
} from '@/features/scan/review-drafts';
import { generateImagesForCards } from '@/features/scan/generate-card-images';
import { ReviewRow } from '@/features/scan/review-row';
import { useTheme } from '@/hooks/use-theme';
import { generateCardImage } from '@/lib/api';
import { queryKeys, saveReviewedCards } from '@/lib/queries';
import { useSettings } from '@/lib/stores';

export interface ReviewEditorProps {
  scan: Scan;
  parsed: ParsedScan;
}

type PickerTarget = { target: 'all' } | { target: 'row'; key: string };

function saveButtonLabel(count: number): string {
  if (count === 0) {
    return 'Finish without saving';
  }
  if (count === 1) {
    return 'Save 1 card';
  }
  return `Save ${count} cards`;
}

export function ReviewEditor({ scan, parsed }: ReviewEditorProps) {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [drafts, setDrafts] = useState<ReviewDraft[]>(() =>
    parsedToDrafts(scan.kind, parsed, null),
  );
  const [dirty, setDirty] = useState(false);
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  const [correctionsDismissed, setCorrectionsDismissed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, DraftFieldErrors>>({});
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirtyRef = useRef(false);
  const savedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const rowOffsetsRef = useRef(new Map<string, number>());

  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
  };

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (!dirtyRef.current || savedRef.current) {
        return;
      }
      event.preventDefault();
      Alert.alert(
        'Discard this review?',
        'Your edits will be lost. The scan stays here so you can review it later.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              navigation.dispatch(event.data.action);
            },
          },
        ],
      );
    });
  }, [navigation]);

  const saveMutation = useMutation({
    mutationFn: saveReviewedCards,
    onSuccess: async ({ cardIds }) => {
      savedRef.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (useSettings.getState().aiImagesEnabled && cardIds.length > 0) {
        // Fire and forget: pictures fill in while the user browses the library.
        void generateImagesForCards(cardIds, {
          generate: generateCardImage,
          onImageReady: (cardId) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.cards([]) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.card(cardId) });
          },
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.lessons }),
        // queryKeys.cards([]) partially matches every card list query.
        queryClient.invalidateQueries({ queryKey: queryKeys.cards([]) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.scans }),
      ]);
      router.replace('/library');
    },
    onError: (error: Error) => {
      setSaveError(error.message);
    },
  });

  const included = includedDrafts(drafts);

  const handleFieldChange = (key: string, fieldKey: string, value: string) => {
    setDrafts((current) => setDraftField(current, key, fieldKey, value));
    markDirty();
    const draft = drafts.find((entry) => entry.key === key);
    if (draft !== undefined && fieldKey === headlineFieldKey(draft.type) && value.trim() !== '') {
      setFieldErrors((current) => clearFieldError(current, key, 'headline'));
    }
  };

  const handleMeaningChange = (key: string, value: string) => {
    setDrafts((current) => setDraftMeaning(current, key, value));
    markDirty();
    if (value.trim() !== '') {
      setFieldErrors((current) => clearFieldError(current, key, 'meaning'));
    }
  };

  const handleNoteChange = (key: string, value: string) => {
    setDrafts((current) => setDraftNote(current, key, value));
    markDirty();
  };

  const handleToggleExcluded = (key: string) => {
    setDrafts((current) => toggleDraftExcluded(current, key));
    markDirty();
  };

  const handleLessonSelect = (name: string | null) => {
    if (picker === null) {
      return;
    }
    if (picker.target === 'all') {
      setDrafts((current) => setAllDraftLessons(current, name));
    } else {
      const key = picker.key;
      setDrafts((current) => setDraftLesson(current, key, name));
    }
    markDirty();
    setPicker(null);
  };

  const handleSave = () => {
    if (saveMutation.isPending) {
      return;
    }
    const problems = validateDrafts(included);
    if (problems.length > 0) {
      setFieldErrors(fieldErrorsFromProblems(problems));
      const firstOffset = rowOffsetsRef.current.get(problems[0].key);
      if (firstOffset !== undefined) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, firstOffset - Spacing.three),
          animated: true,
        });
      }
      return;
    }
    setFieldErrors({});
    setSaveError(null);
    saveMutation.mutate({ scan, drafts });
  };

  const pickerSelectedName = (() => {
    if (picker === null) {
      return null;
    }
    if (picker.target === 'all') {
      const bulk = bulkLessonValue(drafts);
      return bulk.state === 'same' ? bulk.name : null;
    }
    return drafts.find((draft) => draft.key === picker.key)?.lessonName ?? null;
  })();

  if (drafts.length === 0) {
    return (
      <EmptyState
        icon="doc.text.viewfinder"
        title="Nothing readable on this page"
        message="The parser found no filled-in rows. Finish the review to mark the scan as done, or go back and rescan clearer photos."
        action={{ label: 'Finish review', onPress: handleSave }}
      />
    );
  }

  const bulk = bulkLessonValue(drafts);
  const bulkLabel = bulk.state === 'mixed' ? 'Mixed' : (bulk.name ?? 'No lesson');
  const showWarnings = parsed.warnings.length > 0 && !warningsDismissed;
  const flaggedCount = correctionCount(included);
  const showCorrections = flaggedCount > 0 && !correctionsDismissed;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ gestureEnabled: !dirty }} />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {showCorrections && (
          <View style={[styles.warnings, { backgroundColor: theme.accentSoft }]}>
            <SymbolView name="checkmark.seal" size={18} tintColor={theme.accent} />
            <View style={styles.warningsText}>
              <Text style={[styles.warningLine, { color: theme.text }]}>
                {correctionSummaryMessage(flaggedCount)}
              </Text>
            </View>
            <IconButton
              icon="xmark"
              accessibilityLabel="Dismiss correction summary"
              size={14}
              themeColor="accent"
              onPress={() => {
                setCorrectionsDismissed(true);
              }}
            />
          </View>
        )}
        {showWarnings && (
          <View style={[styles.warnings, { backgroundColor: theme.accentSoft }]}>
            <SymbolView name="exclamationmark.triangle" size={18} tintColor={theme.accent} />
            <View style={styles.warningsText}>
              {parsed.warnings.map((warning) => (
                <Text key={warning} style={[styles.warningLine, { color: theme.text }]}>
                  {warning}
                </Text>
              ))}
            </View>
            <IconButton
              icon="xmark"
              accessibilityLabel="Dismiss warnings"
              size={14}
              themeColor="accent"
              onPress={() => {
                setWarningsDismissed(true);
              }}
            />
          </View>
        )}
        <Surface style={styles.bulkRow}>
          <View style={styles.bulkText}>
            <Text style={[styles.bulkTitle, { color: theme.text }]}>Lesson for all rows</Text>
            <Text style={[styles.bulkSubtitle, { color: theme.textSecondary }]}>
              Rows keep their own lesson if you change one below.
            </Text>
          </View>
          <Chip
            label={bulkLabel}
            selected={bulk.state === 'same' && bulk.name !== null}
            onPress={() => {
              setPicker({ target: 'all' });
            }}
          />
        </Surface>
        {drafts.map((draft, index) => (
          <View
            key={draft.key}
            onLayout={(event) => {
              rowOffsetsRef.current.set(draft.key, event.nativeEvent.layout.y);
            }}
          >
            <ReviewRow
              draft={draft}
              index={index}
              errors={fieldErrors[draft.key]}
              onFieldChange={(fieldKey, value) => {
                handleFieldChange(draft.key, fieldKey, value);
              }}
              onMeaningChange={(value) => {
                handleMeaningChange(draft.key, value);
              }}
              onNoteChange={(value) => {
                handleNoteChange(draft.key, value);
              }}
              onToggleExcluded={() => {
                handleToggleExcluded(draft.key);
              }}
              onLessonPress={() => {
                setPicker({ target: 'row', key: draft.key });
              }}
            />
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        {saveError !== null && (
          <Text style={[styles.saveError, { color: theme.danger }]}>{saveError}</Text>
        )}
        <Button
          label={saveButtonLabel(included.length)}
          size="lg"
          fullWidth
          loading={saveMutation.isPending}
          onPress={handleSave}
        />
      </View>
      <LessonPicker
        visible={picker !== null}
        title={picker?.target === 'row' ? 'Lesson for this row' : 'Lesson for all rows'}
        selectedName={pickerSelectedName}
        extraNames={distinctLessonNames(drafts)}
        onSelect={handleLessonSelect}
        onClose={() => {
          setPicker(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  warnings: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  warningsText: {
    flex: 1,
    gap: Spacing.one,
  },
  warningLine: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  bulkText: {
    flex: 1,
    gap: Spacing.half,
  },
  bulkTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 600,
  },
  bulkSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  saveError: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
    textAlign: 'center',
  },
});
