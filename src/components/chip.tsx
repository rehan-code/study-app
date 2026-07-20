import { Pressable, StyleSheet, Text } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ChipProps {
  label: string;
  onPress: () => void;
  selected?: boolean;
}

export function Chip({ label, onPress, selected = false }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: selected ? theme.primarySoft : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: selected ? theme.primary : theme.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: Fonts.rounded,
    fontSize: 15,
    fontWeight: 600,
  },
});
