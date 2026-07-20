import { SymbolView, type SFSymbol } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: SFSymbol;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

const SIZES = {
  md: { height: 44, fontSize: 16, iconSize: 16 },
  lg: { height: 54, fontSize: 17, iconSize: 18 },
} as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
}: ButtonProps) {
  const theme = useTheme();
  const dimensions = SIZES[size];
  const palette = {
    primary: { background: theme.primary, label: theme.onPrimary },
    secondary: { background: theme.primarySoft, label: theme.primary },
    ghost: { background: 'transparent', label: theme.primary },
    danger: { background: theme.dangerSoft, label: theme.danger },
  }[variant];
  const blocked = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: dimensions.height,
          backgroundColor: palette.background,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.label} />
      ) : (
        <>
          {icon !== undefined && (
            <SymbolView name={icon} size={dimensions.iconSize} tintColor={palette.label} />
          )}
          <Text
            style={[styles.label, { color: palette.label, fontSize: dimensions.fontSize }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.four,
  },
  label: {
    fontFamily: Fonts.rounded,
    fontWeight: 600,
  },
});
