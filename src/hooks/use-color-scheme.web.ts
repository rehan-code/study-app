import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const emptySubscribe = () => () => {};

/**
 * Static web rendering has no client color scheme, so the first client render
 * must match the server-rendered 'light' until hydration completes.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
