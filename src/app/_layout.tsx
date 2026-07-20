import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';
import { isSupabaseConfigured } from '@/lib/supabase';

// Called at module scope so the native splash stays up while the session loads.
SplashScreen.preventAutoHideAsync();

function buildNavigationTheme(isDark: boolean): ReactNavigation.Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  const palette = isDark ? Colors.dark : Colors.light;
  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.backgroundElement,
      text: palette.text,
      border: palette.border,
      notification: palette.accent,
    },
  };
}

export default function RootLayout() {
  const isDark = useColorScheme() === 'dark';
  const configured = isSupabaseConfigured();
  const { session, initializing } = useSession();

  useEffect(() => {
    if (!initializing) {
      SplashScreen.hideAsync();
    }
  }, [initializing]);

  if (initializing) {
    return null;
  }

  const signedIn = configured && session !== null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={buildNavigationTheme(isDark)}>
          {/* Guards gate the whole tree, deep links included: a screen whose guard
              is false is removed from the navigator and navigation falls back to
              the first available screen (setup, then sign-in, then tabs). */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!configured}>
              <Stack.Screen name="setup" />
            </Stack.Protected>
            <Stack.Protected guard={configured && session === null}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="study/session" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="quiz/index" />
              <Stack.Screen name="quiz/session" />
              <Stack.Screen name="scan/new" />
              <Stack.Screen name="scan/[id]/review" />
              <Stack.Screen name="lesson/[id]" />
              <Stack.Screen name="card/[id]" />
            </Stack.Protected>
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
