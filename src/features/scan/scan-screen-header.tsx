import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ScanScreenHeaderProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}

/** In-screen header for the scan flow; the root stack renders no native header. */
export function ScanScreenHeader({ title, onBack, right }: ScanScreenHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {onBack !== undefined ? (
        <IconButton icon="chevron.left" accessibilityLabel="Back" onPress={onBack} />
      ) : (
        <View style={styles.slot} />
      )}
      <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
        {title}
      </Text>
      {right !== undefined ? right : <View style={styles.slot} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    minHeight: 48,
  },
  slot: {
    width: 40,
    height: 40,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 600,
  },
});
