import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label }: LoadingStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ActivityIndicator color={theme.primary} />
      {label !== undefined && (
        <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.two,
  },
  label: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 500,
    textAlign: 'center',
  },
});
