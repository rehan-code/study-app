import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ModalScaffold } from '@/features/library/modal-scaffold';

export interface RenameLessonModalProps {
  visible: boolean;
  initialName: string;
  submitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export function RenameLessonModal({
  visible,
  initialName,
  submitting,
  errorMessage,
  onClose,
  onSubmit,
}: RenameLessonModalProps) {
  const theme = useTheme();
  const [name, setName] = useState(initialName);
  const [wasVisible, setWasVisible] = useState(visible);

  // Re-seed the field each time the dialog opens (adjust-state-during-render pattern).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setName(initialName);
    }
  }

  return (
    <ModalScaffold visible={visible} onClose={onClose} dismissable={!submitting}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>Rename lesson</Text>
        <TextField value={name} onChangeText={setName} label="Name" placeholder="Lesson 9" />
        {errorMessage !== null && (
          <Text style={[styles.error, { color: theme.danger }]}>{errorMessage}</Text>
        )}
        <View style={styles.buttons}>
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={submitting} />
          <Button
            label="Save"
            onPress={() => {
              onSubmit(name.trim());
            }}
            loading={submitting}
            disabled={name.trim().length === 0}
          />
        </View>
      </View>
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
  },
  title: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 600,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
