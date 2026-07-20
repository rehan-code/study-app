import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1C1917',
    textSecondary: '#57534E',
    background: '#FAF7F2',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EDE7DC',
    border: '#E5DFD3',
    primary: '#0D7A6C',
    onPrimary: '#FFFFFF',
    primarySoft: '#DDF0EC',
    accent: '#C77414',
    accentSoft: '#F9EBD7',
    success: '#1B7F42',
    successSoft: '#DFF5E7',
    danger: '#B3372E',
    dangerSoft: '#FBE5E2',
  },
  dark: {
    text: '#F5F4F0',
    textSecondary: '#A9A49B',
    background: '#161513',
    backgroundElement: '#211F1C',
    backgroundSelected: '#2D2A25',
    border: '#36322B',
    primary: '#37B49E',
    onPrimary: '#0A211D',
    primarySoft: '#173B34',
    accent: '#E9A23B',
    accentSoft: '#3B2C13',
    success: '#57C97B',
    successSoft: '#16301F',
    danger: '#E4756B',
    dangerSoft: '#3C1A17',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

/** Arabic script with full harakat needs roughly 1.9x line height to avoid clipping marks. */
export const ArabicType = {
  hero: { fontSize: 44, lineHeight: 84 },
  headline: { fontSize: 30, lineHeight: 58 },
  body: { fontSize: 22, lineHeight: 42 },
  compact: { fontSize: 18, lineHeight: 34 },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
