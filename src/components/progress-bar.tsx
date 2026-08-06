import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Long enough to cover a slow step without arriving early on a quick one. */
const ADVANCE_MS = 45_000;

/** Stops short of the target so the bar never claims work that is not done. */
const ADVANCE_LIMIT = 0.9;

export interface ProgressBarProps {
  /** Fraction complete, 0 to 1. Values outside the range are clamped. */
  progress: number;
  /**
   * Fraction the work in flight will reach when it lands. The fill eases most
   * of the way there and waits, so a step that reports nothing for a minute
   * still looks alive.
   */
  advancingTo?: number;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function ProgressBar({ progress, advancingTo }: ProgressBarProps) {
  const theme = useTheme();
  const fraction = useSharedValue(clamp01(progress));

  useEffect(() => {
    const settled = clamp01(progress);
    const ahead = advancingTo === undefined ? settled : clamp01(advancingTo);
    if (ahead <= settled) {
      fraction.value = withTiming(settled, { duration: 250 });
      return;
    }
    fraction.value = withSequence(
      withTiming(settled, { duration: 250 }),
      withTiming(settled + (ahead - settled) * ADVANCE_LIMIT, {
        duration: ADVANCE_MS,
        easing: Easing.out(Easing.quad),
      }),
    );
  }, [fraction, progress, advancingTo]);

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
