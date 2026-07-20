import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
}

export function ListRow({ title, subtitle, onPress, right }: ListRowProps) {
  const theme = useTheme();
  const showChevron = onPress !== undefined && right === undefined;

  return (
    <Pressable
      accessibilityRole={onPress !== undefined ? 'button' : undefined}
      disabled={onPress === undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
      ]}
    >
      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      {showChevron && (
        <SymbolView
          name="chevron.right"
          size={14}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  textColumn: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: 500,
  },
});
