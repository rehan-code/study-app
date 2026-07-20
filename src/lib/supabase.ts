import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Expo inlines EXPO_PUBLIC_* only for direct process.env.NAME member access,
// so these reads must stay as literal expressions.
function readSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null;
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client !== null) {
    return client;
  }
  const env = readSupabaseEnv();
  if (env === null) {
    throw new Error(
      'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env and restart the app.',
    );
  }
  client = createClient(env.url, env.anonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Filename-safe slug for storage paths: base36 timestamp plus a random suffix. */
export function makeStorageSlug(): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${time}-${random}`;
}
