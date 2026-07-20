import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ArabicText } from '@/components/arabic-text';
import { IconButton } from '@/components/icon-button';

export interface DetailHeaderProps {
  title: string;
  /** Render the title through ArabicText so harakat get room. */
  arabicTitle?: boolean;
  right?: ReactNode;
  onBack: () => void;
}

/** In-screen header for pushed detail screens (the native header is hidden). */
export function DetailHeader({ title, arabicTitle = false, right, onBack }: DetailHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <IconButton icon="chevron.left" accessibilityLabel="Back" onPress={onBack} />
      <View style={styles.titleColumn}>
        {arabicTitle ? (
          <ArabicText variant="compact" align="left" numberOfLines={1}>
            {title}
          </ArabicText>
        ) : (
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 44,
  },
  titleColumn: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 600,
  },
});
