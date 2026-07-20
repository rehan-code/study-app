import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Surface } from '@/components/surface';

export interface SectionProps {
  title?: string;
  children: ReactNode;
  padded?: boolean;
}

/** A labeled Surface block, the building unit of detail and settings screens. */
export function Section({ title, children, padded = true }: SectionProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {title !== undefined && (
        <Text style={[styles.label, { color: theme.textSecondary }]}>{title}</Text>
      )}
      <Surface padded={padded}>{children}</Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
    marginLeft: Spacing.one,
  },
});
