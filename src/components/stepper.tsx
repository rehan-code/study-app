import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { IconButton } from '@/components/icon-button';

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function Stepper({ value, onChange, min, max, step = 1 }: StepperProps) {
  const theme = useTheme();
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  const decrease = () => {
    const next = value - step;
    onChange(min !== undefined ? Math.max(min, next) : next);
  };
  const increase = () => {
    const next = value + step;
    onChange(max !== undefined ? Math.min(max, next) : next);
  };

  return (
    <View style={styles.row}>
      <IconButton
        icon="minus"
        accessibilityLabel="Decrease"
        onPress={decrease}
        disabled={atMin}
        size={16}
        themeColor="primary"
        background="primarySoft"
      />
      <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
      <IconButton
        icon="plus"
        accessibilityLabel="Increase"
        onPress={increase}
        disabled={atMax}
        size={16}
        themeColor="primary"
        background="primarySoft"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  value: {
    minWidth: 44,
    textAlign: 'center',
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
});
