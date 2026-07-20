import { useQuery } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { mergeLessonNames } from '@/features/scan/review-drafts';
import { useTheme } from '@/hooks/use-theme';
import { listLessons, queryKeys } from '@/lib/queries';

export interface LessonPickerProps {
  visible: boolean;
  title: string;
  selectedName: string | null;
  /** Draft lesson names that may not exist in the database yet (from page markers). */
  extraNames: readonly string[];
  onSelect: (name: string | null) => void;
  onClose: () => void;
}

interface PickerRowProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function PickerRow({ label, selected, onPress }: PickerRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        { backgroundColor: pressed || selected ? theme.backgroundSelected : 'transparent' },
      ]}
    >
      <Text style={[styles.optionLabel, { color: theme.text }]} numberOfLines={1}>
        {label}
      </Text>
      {selected && (
        <SymbolView name="checkmark" size={15} weight="semibold" tintColor={theme.primary} />
      )}
    </Pressable>
  );
}

/** Bottom-sheet picker for assigning a lesson name; supports creating a new one inline. */
export function LessonPicker({
  visible,
  title,
  selectedName,
  extraNames,
  onSelect,
  onClose,
}: LessonPickerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [newName, setNewName] = useState('');

  const lessonsQuery = useQuery({
    queryKey: queryKeys.lessons,
    queryFn: listLessons,
    enabled: visible,
  });

  const names = mergeLessonNames(
    (lessonsQuery.data ?? []).map((lesson) => lesson.name),
    extraNames,
  );

  const selectAndReset = (name: string | null) => {
    setNewName('');
    onSelect(name);
  };

  const addNewLesson = () => {
    const trimmed = newName.trim();
    if (trimmed === '') {
      return;
    }
    // Reuse the existing casing when the name already exists.
    const existing = names.find((name) => name.toLowerCase() === trimmed.toLowerCase());
    selectAndReset(existing ?? trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdropWrap}>
        <Pressable
          accessibilityLabel="Close lesson picker"
          onPress={onClose}
          style={[styles.backdrop, { backgroundColor: theme.text }]}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.backgroundElement,
                paddingBottom: insets.bottom + Spacing.three,
              },
            ]}
          >
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            {lessonsQuery.isPending ? (
              <View style={styles.pendingRow}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : lessonsQuery.isError ? (
              <View style={styles.errorBlock}>
                <Text style={[styles.errorText, { color: theme.textSecondary }]}>
                  {lessonsQuery.error.message}
                </Text>
                <Button
                  label="Try again"
                  variant="secondary"
                  onPress={() => {
                    void lessonsQuery.refetch();
                  }}
                />
              </View>
            ) : (
              <ScrollView style={styles.optionsList} keyboardShouldPersistTaps="handled">
                <PickerRow
                  label="No lesson"
                  selected={selectedName === null}
                  onPress={() => {
                    selectAndReset(null);
                  }}
                />
                {names.map((name) => (
                  <PickerRow
                    key={name.toLowerCase()}
                    label={name}
                    selected={
                      selectedName !== null && selectedName.toLowerCase() === name.toLowerCase()
                    }
                    onPress={() => {
                      selectAndReset(name);
                    }}
                  />
                ))}
              </ScrollView>
            )}
            <View style={[styles.newLessonRow, { borderTopColor: theme.border }]}>
              <View style={styles.newLessonField}>
                <TextField
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="New lesson name"
                  autoCapitalize="words"
                />
              </View>
              <Button
                label="Add"
                variant="secondary"
                disabled={newName.trim() === ''}
                onPress={addNewLesson}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.35,
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 600,
    textAlign: 'center',
  },
  pendingRow: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  errorBlock: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
    textAlign: 'center',
  },
  optionsList: {
    maxHeight: 320,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 500,
  },
  newLessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
  },
  newLessonField: {
    flex: 1,
  },
});
