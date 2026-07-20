# Mufradat (arabic-study)

Personal iPhone app for studying Arabic vocabulary from photographed workbook pages.
Stack: Expo SDK 57 + expo-router + TypeScript, Supabase (auth, Postgres, storage, edge functions).

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Read first

- `docs/ARCHITECTURE.md`: layers, module contracts, screen map, conventions. The source of truth.
- `docs/SCAN_FORMATS.md`: the workbook page layouts the scan parser must handle.
- `docs/BACKEND.md`: Supabase setup and deployment.

## Layout

- `src/app/`: expo-router routes only (thin; no business logic, no non-route files)
- `src/features/<area>/`: feature components and hooks
- `src/components/`: shared design-system primitives
- `src/domain/`: pure TS business logic, no React/supabase imports, vitest-tested
- `src/lib/`: supabase client, auth, queries, edge-function API, persisted stores
- `supabase/`: migrations + Deno edge functions (excluded from app tsconfig/eslint)

## Rules

- Validate all external data (edge function responses, DB rows, env) with zod. No `any`.
- Braces on every `if`. No em dashes anywhere. Comments only for non-obvious why.
- API keys (Anthropic, fal.ai) exist ONLY as Supabase edge function secrets, never in the
  app bundle. Only EXPO_PUBLIC_SUPABASE_URL and the anon key ship to the client.
- Arabic text renders through `<ArabicText>` (preserve harakat; generous line height).
- Every async surface: explicit loading / error with retry / empty / success states.
- The Supabase project is personal, NOT the Doublespeed work org.

## Commands

- `npm start`: dev server; scan the QR with Expo Go on the iPhone
- `npm test` / `npm run test:watch`: vitest over src
- `npm run typecheck`: tsc, app code only (supabase/functions excluded)
- `npm run lint`: eslint via expo
- `npm run format`: prettier
- `npm run icons`: regenerate app icons from scripts/generate-icons.js
