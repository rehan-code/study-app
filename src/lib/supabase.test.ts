import { afterEach, describe, expect, it, vi } from 'vitest';

import { isSupabaseConfigured, makeStorageSlug } from '@/lib/supabase';

// Hoisted above the imports by vitest; replaces the React Native only modules.
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  if (originalUrl === undefined) {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  } else {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
  }
  if (originalKey === undefined) {
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  } else {
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});

describe('makeStorageSlug', () => {
  it('produces filename-safe slugs', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(makeStorageSlug()).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    }
  });

  it('produces distinct slugs across calls', () => {
    const slugs = new Set(Array.from({ length: 100 }, () => makeStorageSlug()));
    expect(slugs.size).toBeGreaterThan(1);
  });
});

describe('isSupabaseConfigured', () => {
  it('is false when either env var is missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(isSupabaseConfigured()).toBe(false);

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('is false when an env var is empty', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = '';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('is true when both env vars are set', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    expect(isSupabaseConfigured()).toBe(true);
  });
});
