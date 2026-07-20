import { Text } from 'react-native';

import { ArabicType, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ArabicVariant = keyof typeof ArabicType;

export interface ArabicTextProps {
  children: string;
  variant?: ArabicVariant;
  align?: 'left' | 'center' | 'right';
  themeColor?: ThemeColor;
  numberOfLines?: number;
}

/**
 * The only sanctioned way to render Arabic. ArabicType line heights leave room
 * for harakat above and below the letters; raw <Text> defaults clip them.
 */
export function ArabicText({
  children,
  variant = 'body',
  align,
  themeColor,
  numberOfLines,
}: ArabicTextProps) {
  const theme = useTheme();
  const type = ArabicType[variant];

  return (
    <Text
      numberOfLines={numberOfLines}
      style={{
        color: theme[themeColor ?? 'text'],
        fontSize: type.fontSize,
        lineHeight: type.lineHeight,
        writingDirection: 'rtl',
        textAlign: align,
      }}
    >
      {children}
    </Text>
  );
}
