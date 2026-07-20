import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { Radius, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface IconButtonProps {
  icon: SFSymbol;
  accessibilityLabel: string;
  onPress: () => void;
  size?: number;
  themeColor?: ThemeColor;
  background?: ThemeColor;
  disabled?: boolean;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = 20,
  themeColor = 'text',
  background,
  disabled = false,
}: IconButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background !== undefined ? theme[background] : 'transparent',
          opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <SymbolView name={icon} size={size} tintColor={theme[themeColor]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
