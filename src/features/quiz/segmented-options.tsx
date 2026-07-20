import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SegmentedOptionsProps {
  options: readonly number[];
  value: number;
  onChange: (value: number) => void;
}

export function SegmentedOptions({ options, value, onChange }: SegmentedOptionsProps) {
  const theme = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.segment,
              selected && {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                borderWidth: StyleSheet.hairlineWidth,
              },
              { opacity: pressed && !selected ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[styles.label, { color: selected ? theme.text : theme.textSecondary }]}
              numberOfLines={1}
            >
              {String(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: Fonts.rounded,
    fontSize: 16,
    fontWeight: 600,
  },
});
