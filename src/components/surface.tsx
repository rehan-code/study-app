import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SurfaceProps {
  children: ReactNode;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Surface({ children, padded = true, style }: SurfaceProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.three,
  },
});
