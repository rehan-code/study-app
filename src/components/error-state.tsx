import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from '@/components/button';

export interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: theme.dangerSoft }]}>
        <SymbolView name="exclamationmark.triangle" size={26} tintColor={theme.danger} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>Something went wrong</Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
      <View style={styles.action}>
        <Button label="Try again" onPress={onRetry} variant="secondary" />
      </View>
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
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  title: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 600,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 500,
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.two,
  },
});
