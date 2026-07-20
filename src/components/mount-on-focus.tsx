import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';

/**
 * Defers rendering until the screen is first focused, then stays mounted.
 * Works around expo-router native tabs pre-rendering every tab with unbounded
 * safe-area insets, which flashes a mis-measured layout on first tab visit
 * (expo/expo#42486). Remove once that fix lands upstream.
 */
export function MountOnFocus({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setMounted(true);
    }, []),
  );

  if (!mounted) {
    return null;
  }
  return <>{children}</>;
}
