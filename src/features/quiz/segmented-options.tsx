import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SegmentedOptionsProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedOptions<T extends string | number>({
  options,
  value,
  onChange,
}: SegmentedOptionsProps<T>) {
  const theme = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
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
              {option.label}
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
