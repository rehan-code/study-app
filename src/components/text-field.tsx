import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { ArabicType, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface TextFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  multiline?: boolean;
  rtl?: boolean;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
}

export function TextField({
  value,
  onChangeText,
  label,
  placeholder,
  error,
  multiline = false,
  rtl = false,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
}: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {label !== undefined && (
        <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={!rtl && !secureTextEntry}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: error !== undefined ? theme.danger : theme.border,
          },
          multiline && styles.multiline,
          rtl && styles.rtl,
          // iOS single-line inputs vertically misalign text when lineHeight is
          // set, so the generous harakat-safe line height applies to multiline
          // only; single-line Arabic gets its breathing room from minHeight.
          rtl && multiline && { lineHeight: ArabicType.body.lineHeight },
        ]}
      />
      {error !== undefined && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  rtl: {
    writingDirection: 'rtl',
    textAlign: 'right',
    fontSize: ArabicType.body.fontSize,
    minHeight: 56,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
  },
});
