import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { Fonts, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface AnswerControlsProps {
  onNotYet: () => void;
  onGotIt: () => void;
  onUndo: () => void;
  undoDisabled: boolean;
}

function AnswerButton({
  label,
  icon,
  softColor,
  strongColor,
  onPress,
}: {
  label: string;
  icon: SFSymbol;
  softColor: ThemeColor;
  strongColor: ThemeColor;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.answerButton,
        {
          backgroundColor: theme[softColor],
          opacity: pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <SymbolView name={icon} size={18} tintColor={theme[strongColor]} />
      <Text style={[styles.answerLabel, { color: theme[strongColor] }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AnswerControls({ onNotYet, onGotIt, onUndo, undoDisabled }: AnswerControlsProps) {
  return (
    <View style={styles.row}>
      <AnswerButton
        label="Not yet"
        icon="xmark"
        softColor="accentSoft"
        strongColor="accent"
        onPress={onNotYet}
      />
      <IconButton
        icon="arrow.uturn.backward"
        accessibilityLabel="Undo last answer"
        onPress={onUndo}
        disabled={undoDisabled}
        background="backgroundSelected"
        themeColor="textSecondary"
      />
      <AnswerButton
        label="Got it"
        icon="checkmark"
        softColor="successSoft"
        strongColor="success"
        onPress={onGotIt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  answerButton: {
    flex: 1,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
  },
  answerLabel: {
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: 600,
  },
});
