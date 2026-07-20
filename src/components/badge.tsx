import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'accent';

export interface BadgeProps {
  label: string | number;
  tone?: BadgeTone;
}

export function Badge({ label, tone = 'default' }: BadgeProps) {
  const theme = useTheme();
  // The palette's orange accent doubles as the warning hue, so the accent tone
  // maps to the teal primary pair to keep all five tones distinct.
  const palette = {
    default: { background: theme.backgroundSelected, label: theme.textSecondary },
    success: { background: theme.successSoft, label: theme.success },
    warning: { background: theme.accentSoft, label: theme.accent },
    danger: { background: theme.dangerSoft, label: theme.danger },
    accent: { background: theme.primarySoft, label: theme.primary },
  }[tone];

  return (
    <View style={[styles.base, { backgroundColor: palette.background }]}>
      <Text style={[styles.label, { color: palette.label }]} numberOfLines={1}>
        {String(label)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 22,
    minWidth: 22,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: Fonts.rounded,
    fontSize: 12,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
});
