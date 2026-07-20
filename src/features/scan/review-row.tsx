import { StyleSheet, Text, View } from 'react-native';

import { ArabicText } from '@/components/arabic-text';
import { Badge } from '@/components/badge';
import { Chip } from '@/components/chip';
import { IconButton } from '@/components/icon-button';
import { Surface } from '@/components/surface';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { FIELD_LABELS } from '@/domain/cards';
import type { ReviewDraft } from '@/domain/scan-review';
import {
  headlineErrorMessage,
  headlineFieldKey,
  MEANING_ERROR_MESSAGE,
  type DraftFieldErrors,
} from '@/features/scan/review-drafts';
import { useTheme } from '@/hooks/use-theme';

export interface ReviewRowProps {
  draft: ReviewDraft;
  index: number;
  errors: DraftFieldErrors | undefined;
  onFieldChange: (fieldKey: string, value: string) => void;
  onMeaningChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onToggleExcluded: () => void;
  onLessonPress: () => void;
}

export function ReviewRow({
  draft,
  index,
  errors,
  onFieldChange,
  onMeaningChange,
  onNoteChange,
  onToggleExcluded,
  onLessonPress,
}: ReviewRowProps) {
  const theme = useTheme();
  const headlineKey = headlineFieldKey(draft.type);
  const headline = draft.fields[headlineKey] ?? '';

  return (
    <Surface>
      <View style={styles.headerRow}>
        <Text style={[styles.rowNumber, { color: theme.textSecondary }]}>Row {index + 1}</Text>
        <View style={styles.headerActions}>
          <Chip
            label={draft.lessonName ?? 'No lesson'}
            selected={draft.lessonName !== null}
            onPress={onLessonPress}
          />
          <IconButton
            icon={draft.excluded ? 'arrow.uturn.backward' : 'minus.circle'}
            accessibilityLabel={draft.excluded ? 'Restore row' : 'Skip row'}
            themeColor={draft.excluded ? 'primary' : 'textSecondary'}
            onPress={onToggleExcluded}
          />
        </View>
      </View>
      {draft.excluded ? (
        <View style={styles.skippedRow}>
          <View style={styles.skippedText}>
            {headline.trim() !== '' ? (
              <ArabicText variant="compact" numberOfLines={1}>
                {headline}
              </ArabicText>
            ) : (
              <Text
                style={[styles.skippedMeaning, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {draft.meaning.trim() !== '' ? draft.meaning : 'Empty row'}
              </Text>
            )}
          </View>
          <Badge label="Skipped" />
        </View>
      ) : (
        <View style={styles.fields}>
          {FIELD_LABELS[draft.type]
            .filter((field) => field.key !== 'note')
            .map((field) => (
              <TextField
                key={field.key}
                label={`${field.label} · ${field.labelArabic}`}
                value={draft.fields[field.key] ?? ''}
                rtl
                error={
                  field.key === headlineKey && errors?.headline
                    ? headlineErrorMessage(draft.type)
                    : undefined
                }
                onChangeText={(value) => {
                  onFieldChange(field.key, value);
                }}
              />
            ))}
          <TextField
            label="Meaning"
            value={draft.meaning}
            placeholder="English meaning"
            error={errors?.meaning ? MEANING_ERROR_MESSAGE : undefined}
            onChangeText={onMeaningChange}
          />
          <TextField
            label="Note"
            value={draft.note ?? ''}
            placeholder="Margin note (optional)"
            onChangeText={onNoteChange}
          />
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    flexShrink: 1,
  },
  rowNumber: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fields: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  skippedRow: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    opacity: 0.5,
  },
  skippedText: {
    flex: 1,
  },
  skippedMeaning: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 500,
  },
});
