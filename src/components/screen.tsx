import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}

export function Screen({ children, scroll = false, padded = true }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const contentStyle = {
    paddingTop: insets.top + (padded ? Spacing.three : 0),
    paddingBottom: insets.bottom + (padded ? Spacing.three : 0),
    paddingHorizontal: padded ? Spacing.three : 0,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.root, { backgroundColor: theme.background }]}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }, contentStyle]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
