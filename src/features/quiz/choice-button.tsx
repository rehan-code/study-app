import { Pressable, StyleSheet } from 'react-native';

import { ArabicText } from '@/components/arabic-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChoiceState = 'idle' | 'correct' | 'wrong' | 'faded';

export interface ChoiceButtonProps {
  text: string;
  arabic: boolean;
  state: ChoiceState;
  locked: boolean;
  onPress: () => void;
}

interface ChoicePalette {
  background: string;
  border: string;
  text: ThemeColor;
}

export function ChoiceButton({ text, arabic, state, locked, onPress }: ChoiceButtonProps) {
  const theme = useTheme();
  const palette: ChoicePalette = {
    idle: { background: theme.backgroundElement, border: theme.border, text: 'text' as const },
    correct: { background: theme.successSoft, border: theme.success, text: 'success' as const },
    wrong: { background: theme.dangerSoft, border: theme.danger, text: 'danger' as const },
    faded: {
      background: theme.backgroundElement,
      border: theme.border,
      text: 'textSecondary' as const,
    },
  }[state];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          opacity: state === 'faded' ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {arabic ? (
        <ArabicText variant="body" align="center" themeColor={palette.text}>
          {text}
        </ArabicText>
      ) : (
        <ThemedText themeColor={palette.text} style={styles.latin}>
          {text}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  latin: {
    textAlign: 'center',
  },
});
