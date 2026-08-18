import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Edge functions are excluded from the app's tsconfig and eslint, but the
    // pure helpers under _shared are plain TS and are tested here with the rest.
    include: ['src/**/*.test.ts', 'supabase/functions/_shared/*.test.ts'],
    environment: 'node',
  },
});
