import { SymbolView, type SFSymbol } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from '@/components/button';

export interface EmptyStateProps {
  icon: SFSymbol;
  title: string;
  message: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: theme.primarySoft }]}>
        <SymbolView name={icon} size={28} tintColor={theme.primary} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
      {action !== undefined && (
        <View style={styles.action}>
          <Button label={action.label} onPress={action.onPress} variant="secondary" />
        </View>
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
