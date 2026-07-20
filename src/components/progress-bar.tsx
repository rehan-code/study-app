import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ProgressBarProps {
  /** Fraction complete, 0 to 1. Values outside the range are clamped. */
  progress: number;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const theme = useTheme();
  const fraction = useSharedValue(clamp01(progress));

  useEffect(() => {
    fraction.value = withTiming(clamp01(progress), { duration: 250 });
  }, [fraction, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fraction.value * 100}%`,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp01(progress) * 100) }}
      style={[styles.track, { backgroundColor: theme.backgroundSelected }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: theme.primary }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
});
