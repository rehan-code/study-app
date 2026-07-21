# Mufradat Architecture

The single source of truth for module contracts, screen responsibilities, and conventions.
Read this before writing any code. See also docs/SCAN_FORMATS.md (workbook layouts) and
supabase/migrations/0001_init.sql (data model).

## Layers

- `src/app/`: expo-router routes ONLY. Thin composition: wire params, render feature
  components. No business logic, no direct supabase calls. Non-route helpers must NOT live
  here (expo-router treats every file as a route).
- `src/features/<area>/`: feature components and hooks (study deck, quiz runner, scan review
  editor, library lists). May use react-query, `src/lib`, and `src/domain`.
- `src/components/`: shared presentational primitives (design system). No data fetching,
  with one sanctioned exception: `CardImage` resolves a signed URL via react-query.
- `src/domain/`: pure TypeScript. No React, no supabase imports, no Date.now()/Math.random()
  (time and randomness are injected). Exhaustively unit tested.
- `src/lib/`: side-effectful integrations (supabase client, auth, queries, edge-function
  API, persisted zustand stores).
- `supabase/`: SQL migrations and Deno edge functions. Excluded from the app's tsconfig and
  eslint; keep them self-contained.

## Conventions

- TypeScript strict; no `any`, no non-null assertions unless provably safe with a comment.
- zod validation at every external boundary: DB rows, edge function responses, env.
- Every `if` uses braces, including guard clauses.
- No em dashes (U+2014) anywhere: UI copy, comments, docs.
- Comments explain non-obvious WHY only; never narrate the diff or reference the task.
- Every async surface shows explicit loading / error (with retry) / empty / success states.
- Arabic strings render through `<ArabicText>`; never raw `<Text>` for Arabic (harakat clip
  without generous line height; sizes live in `ArabicType` in `src/constants/theme.ts`).
- Colors only from `useTheme()` / `Colors`; no hex literals in components or screens.
- UI copy is friendly and short. Sentence case. No jargon ("Couldn't read that page" not
  "Parse operation failed").
- Haptics: light impact on swipe commit and answer selection; success notification on
  session completion. Nothing else.
- Do not run `expo start` during the build (typed-route generation mid-build causes churn).

## Data model recap (see migration for full DDL)

- `lessons(id, user_id, name unique per user, position, created_at)`
- `scans(id, user_id, kind nouns|verbs|phrases, page_paths text[], status uploaded|parsing|parsed|reviewed|failed, parsed_rows jsonb, parse_error, created_at)`
- `cards(id, user_id, lesson_id?, scan_id?, pdf_import_id?, import_page?, type vocab|verb|phrase, fields jsonb, meaning, ai_image_path?, image_enabled, box, due_at, correct_count, incorrect_count, last_reviewed_at?, created_at)`
- `pdf_imports(id, user_id, storage_path, status created|processing|done|failed, total_pages?, next_page, current_lesson?, lessons_created, cards_created, last_error?, created_at, updated_at)`:
  whole-book imports; `next_page` is the resume cursor, and `(pdf_import_id, import_page)` on
  cards lets a re-run of a batch replace its own cards instead of duplicating them.
- Storage buckets (private): `scans` (page photos and uploaded book PDFs), `card-images`
  (generated study images).
- Storage path conventions: scans `${userId}/${slug}.jpg` where slug is from
  `makeStorageSlug()`; book PDFs `${userId}/imports/${slug}.pdf`; card images
  `${userId}/${cardId}.jpg` (upsert on regenerate).

## Domain contracts

Already implemented (do not rewrite, extend only if a contract below requires it):
`cards.ts` (types, zod schemas, `cardFromRow`, `FIELD_LABELS`, `cardHeadline`,
`cardDetailRows`), `srs.ts` (Leitner), `parsed-scan.ts` (parser contract +
`PARSED_FIELD_KEYS`), `scans.ts`, `lessons.ts`.

### src/domain/session.ts (to implement)

```ts
export interface SessionEntry {
  cardId: string;
  result: ReviewResult;
  previous: SrsState;
  next: SrsState;
  card: Card; /* pre-answer snapshot so undo can restore a got_it card */
}
export interface StudySessionState {
  queue: Card[]; // remaining cards, head = current
  history: SessionEntry[]; // answered, in order (for undo and summary)
  totalPlanned: number; // unique cards planned at session start
}
export interface CreateSessionOptions {
  newLimit: number;
  shuffle: <T>(items: T[]) => T[];
}
export function createSession(
  cards: Card[],
  now: Date,
  options: CreateSessionOptions,
): StudySessionState;
export function currentCard(state: StudySessionState): Card | null;
export function answerCurrent(
  state: StudySessionState,
  result: ReviewResult,
  now: Date,
): StudySessionState;
export function undoLast(state: StudySessionState): StudySessionState;
export function isComplete(state: StudySessionState): boolean;
export function sessionProgress(state: StudySessionState): { done: number; total: number };
export function sessionSummary(state: StudySessionState): { gotIt: number; notYet: number };
```

Rules: `createSession` takes DUE cards only (caller filters with `isDue`), puts new cards
(`isNew`) before review cards so new words surface more, shuffles within each group with the
injected shuffle, and caps NEW cards at `newLimit` (reviews are never capped). `answerCurrent`
computes `next = reviewCard(...)`; on `got_it` the card leaves the queue; on `not_yet` the
card is updated with its new SRS state and reinserted 3 positions ahead (or at the end if
fewer than 3 remain). A card answered `not_yet` and later `got_it` produces two history
entries; `sessionSummary` counts a card as `notYet` if ANY of its entries missed.
`undoLast` restores the last history entry's card to the queue head with its `previous` state.

### src/domain/quiz.ts (to implement)

```ts
export type QuizKind = 'present' | 'imperative' | 'masdar' | 'meaning';
export interface QuizQuestion {
  cardId: string;
  kind: QuizKind;
  promptArabic: string; // e.g. the past-tense verb for 'present' questions
  promptMeaning: string; // English gloss shown as a hint
  instruction: string; // e.g. "Pick the present tense (المضارع)"
  choices: string[]; // 2 to 4 unique options
  correctIndex: number;
}
export function mulberry32(seed: number): () => number;
export function buildQuiz(
  cards: Card[],
  options: { count: number; kinds: QuizKind[]; rng: () => number },
): QuizQuestion[];
```

Rules: for verb-form kinds, eligible cards are verbs with a non-null target field; the
correct answer is that field; distractors are the same field from OTHER verb cards (unique,
not equal to the correct answer), preferring 3 distractors but allowing 1 minimum, else the
card is skipped. For 'meaning', any card type is eligible; prompt is `cardHeadline`, choices
are meanings. Choice order shuffled with rng; no duplicate cards in one quiz; if fewer
eligible cards than `count`, return as many as possible. Deterministic given the same rng.

### src/domain/scan-review.ts (to implement)

```ts
export interface DraftCorrection {
  field: string; // key per PARSED_FIELD_KEYS
  scanned: string; // exactly what the page says
  suggested: string; // the checked, corrected form
  reason: string; // short English explanation
}
export interface ReviewDraft {
  key: string; // stable row key, e.g. "row-3"
  type: CardType;
  fields: Record<string, string | null>; // editable working copy, keys per PARSED_FIELD_KEYS
  meaning: string;
  note: string | null;
  lessonName: string | null;
  excluded: boolean; // user removed this row in review
  corrections: DraftCorrection[]; // flagged answers; fields default to suggested
}
export function parsedToDrafts(
  kind: ScanKind,
  parsed: ParsedScan,
  fallbackLessonName: string | null,
): ReviewDraft[];
export function isBlankRow(row: ParsedRow): boolean;
export interface DraftValidation {
  key: string;
  problem: 'missing_headline' | 'missing_meaning';
}
export function validateDrafts(drafts: ReviewDraft[]): DraftValidation[];
export function draftToCardSeed(draft: ReviewDraft): {
  type: CardType;
  fields: CardFields;
  meaning: string;
};
```

Rules: `parsedToDrafts` drops blank rows (all fields null/empty AND meaning null), applies
lesson markers (rows before the first marker get `fallbackLessonName`, rows at/after a
marker get that marker's name, markers apply in `beforeRow` order), folds `note` into the
draft, and normalizes marker names to "Lesson N" form when they match /lesson\s*(\d+)/i.
It also applies the parser's per-row corrections: a flagged field's working value defaults
to the SUGGESTED form while the exact transcription is kept in the draft's `corrections`
(one per field, first wins; corrections aimed at unknown fields, blank/dash cells, or
that do not change the page value are dropped). The review UI renders both versions under
the field so the user can tap between the suggested fix and what the page says.
`draftToCardSeed` merges the note into fields and validates through the card field schemas
(throws ZodError on invalid; UI calls `validateDrafts` first to block save with friendly
messages). Excluded drafts are the caller's job to filter.

## Lib contracts

### src/lib/supabase.ts

```ts
export function isSupabaseConfigured(): boolean;
export function getSupabase(): SupabaseClient; // lazy singleton; throws if unconfigured
export function makeStorageSlug(): string; // time + random suffix, filename safe
```

Reads `process.env.EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. RN client
options: AsyncStorage storage, persistSession, autoRefreshToken, detectSessionInUrl false.
Import 'react-native-url-polyfill/auto' at module top.

### src/lib/auth.ts

```ts
export function useSession(): { session: Session | null; initializing: boolean };
export async function signInWithPassword(email: string, password: string): Promise<string | null>; // error message or null
export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
export async function signOut(): Promise<void>;
```

### src/lib/queries.ts

All reads validate rows through the domain `*FromRow` parsers. All functions use
`getSupabase()`. Throw `Error` with a user-presentable message on failure.

```ts
export const queryKeys = {
  lessons: ['lessons'] as const,
  cards: (lessonIds: readonly string[]) => ['cards', [...lessonIds].sort()] as const,
  card: (id: string) => ['cards', 'byId', id] as const,
  scans: ['scans'] as const,
  scan: (id: string) => ['scans', 'byId', id] as const,
  signedUrl: (bucket: string, path: string) => ['signed-url', bucket, path] as const,
};
export const NO_LESSON_ID = 'no-lesson'; // virtual filter id for cards without a lesson

export async function listLessons(): Promise<Lesson[]>; // sorted with compareLessons
export async function createLesson(name: string): Promise<Lesson>;
export async function renameLesson(id: string, name: string): Promise<void>;
export async function deleteLesson(id: string): Promise<void>; // cards keep, lesson_id nulls via FK
export async function listCards(lessonIds: readonly string[]): Promise<Card[]>; // [] = all; NO_LESSON_ID = lesson_id is null
export async function getCard(id: string): Promise<Card>;
export async function updateCardContent(
  id: string,
  fields: CardFields,
  meaning: string,
): Promise<void>;
export async function setCardImageEnabled(id: string, enabled: boolean): Promise<void>;
export async function setCardLesson(id: string, lessonId: string | null): Promise<void>;
export async function resetCardProgress(id: string): Promise<void>;
export async function deleteCard(id: string): Promise<void>;
export async function applyReview(cardId: string, srs: SrsState): Promise<void>;
export async function listScans(): Promise<Scan[]>;
export async function getScan(id: string): Promise<Scan>;
export async function createScan(kind: ScanKind, pagePaths: string[]): Promise<Scan>;
export async function deleteScan(id: string): Promise<void>;
export async function uploadScanPage(localUri: string): Promise<string>; // returns storage path
export async function getSignedUrl(bucket: 'scans' | 'card-images', path: string): Promise<string>;
export interface SaveReviewInput {
  scan: Scan;
  drafts: ReviewDraft[];
}
export async function saveReviewedCards(input: SaveReviewInput): Promise<{ created: number }>;
```

`saveReviewedCards`: filter excluded drafts, `validateDrafts` (throw on problems), resolve
lesson names to ids creating lessons as needed (case-insensitive name match against existing),
insert cards (type, fields with note folded in, meaning, lesson_id, scan_id), mark the scan
`reviewed`. `uploadScanPage`: read the local file (base64 via expo FileSystem or
fetch+arrayBuffer), upload jpeg with contentType to `scans/${userId}/${makeStorageSlug()}.jpg`.

### src/lib/api.ts

```ts
export async function parseScan(scanId: string): Promise<ParsedScan>; // invokes 'parse-scan'
export async function generateCardImage(cardId: string): Promise<{ path: string }>; // invokes 'generate-card-image'
```

Use `getSupabase().functions.invoke(name, { body })`. Non-2xx or `{ error }` payloads throw
an `Error` whose message is safe to show the user. Validate success payloads with zod
(`parsedScanSchema` for parse-scan).

### src/lib/stores.ts (zustand + AsyncStorage persistence)

```ts
export const useStudyFilter: /* { selectedLessonIds: string[]; toggleLesson(id): void; selectAll(): void; isAll: boolean } */
export const useSettings: /* { aiImagesEnabled: boolean; newCardsPerSession: number; setAiImagesEnabled(v): void; setNewCardsPerSession(n): void } */
```

Empty `selectedLessonIds` means "all lessons" (the default). `NO_LESSON_ID` may appear in the
selection. Defaults: aiImagesEnabled true, newCardsPerSession 20.

### src/lib/query-client.ts (owned by the shell)

Exports the singleton `queryClient` for the root provider.

## Edge function contracts (supabase/functions)

Both functions: `verify_jwt` enabled; build a supabase client from the caller's
Authorization header so RLS applies; respond JSON; on error respond `{ error: string }`
with a 4xx/5xx status and a message safe to show in the UI. Shared helpers in
`supabase/functions/_shared/`. Mirror of the parsed-scan zod contract lives in
`_shared/parsed-scan-contract.ts` with a sync comment.

### parse-scan

Request `{ scanId: string }`. Load scan (404 if missing), reject if status is `reviewed`,
set `parsing`, download `page_paths` from the scans bucket, send all pages in ONE Anthropic
messages request (model from `ANTHROPIC_MODEL`, default `claude-sonnet-5`; key from
`ANTHROPIC_API_KEY`) with a forced tool call whose input schema matches the parsed-scan
contract. The prompt must encode docs/SCAN_FORMATS.md: spreads merge row-by-row across two
photos in order, field keys per kind exactly as in `PARSED_FIELD_KEYS`, meaning in English,
preserve harakat exactly, blank/dash cells null, detect handwritten LESSON markers between
rows into `lessonMarkers` (beforeRow = index of the first row at/after the marker), ignore
the watermark, margin notes into `note`, uncertainties into `warnings`. The prompt also
asks the model to CHECK each filled-in answer (right plural/conjugation/masdar/participle,
right harakat) and report confident mistakes per row in `corrections` as
`{ field, suggested, reason }`; `fields` still carries the exact transcription, and
unreadable cells go to `warnings`, never `corrections`. Validate the tool
output with the contract schema, persist `parsed_rows` + status `parsed`, return
`{ parsed }`. On failure persist status `failed` + `parse_error` and return the error.

### generate-card-image

Request `{ cardId: string }`. Load card (404 if missing). Build prompt: "Simple flat
illustration for a language learning flashcard: {meaning}. Friendly, minimal, soft warm
colors, no text, no letters." Call fal.ai (`FAL_KEY`; model id from `FAL_MODEL`, default
`fal-ai/flux/schnell`, endpoint `https://fal.run/{model}` with `{ prompt, image_size:
'square_hd', num_images: 1 }`), download the resulting image, upload to
`card-images/${userId}/${cardId}.jpg` with upsert, update `ai_image_path`, return `{ path }`.

## Screen map

| Route                          | Purpose                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/_layout.tsx`          | Providers (QueryClientProvider, theme), splash handling, gates: unconfigured env -> setup screen; no session -> (auth); else (tabs).                                                        |
| `src/app/(auth)/sign-in.tsx`   | Email + password sign in with a sign-up toggle. Friendly errors, loading state, email-confirmation notice after sign up.                                                                    |
| `src/app/(tabs)/_layout.tsx`   | Tabs: Study (index), Library, Scan, Settings. NativeTabs with SF symbol icons if supported (verify against node_modules/expo-router types), otherwise classic Tabs with expo-symbols icons. |
| `src/app/(tabs)/index.tsx`     | Home: greeting, due/new counts for the current filter, lesson filter chips (all lessons + NO_LESSON_ID), Start studying button, Quiz button, empty states pointing to the Scan tab.         |
| `src/app/(tabs)/library.tsx`   | Lessons with card counts (plus a "No lesson" group), tap into lesson detail.                                                                                                                |
| `src/app/(tabs)/scans.tsx`     | Scan history list (kind, pages, status badge, date) + New scan button. Tap: parsed -> review, failed -> error + retry parse, reviewed -> summary, uploaded/parsing -> progress.             |
| `src/app/(tabs)/settings.tsx`  | Account (email, sign out), AI images toggle, new-cards-per-session stepper, app version.                                                                                                    |
| `src/app/study/session.tsx`    | Flashcard session for the current filter (modal, full screen).                                                                                                                              |
| `src/app/quiz/index.tsx`       | Quiz setup: question count (5/10/20), kind toggles (present on by default), start. Shows eligible-question availability.                                                                    |
| `src/app/quiz/session.tsx`     | Quiz runner + results.                                                                                                                                                                      |
| `src/app/scan/new.tsx`         | Kind picker (three friendly cards explaining each layout), pick/take 1-2 photos in right-page-then-left-page order, reorder/remove, upload + parse with progress, then navigate to review.  |
| `src/app/scan/import-pdf.tsx`  | Whole-book import: pick the curriculum PDF, upload, then drive `import-pdf-batch` one page batch at a time with progress, pause/resume, and a resumable cursor in `pdf_imports`.           |
| `src/app/scan/[id]/review.tsx` | Review parsed rows: editable fields per FIELD_LABELS, meaning, per-row lesson assignment seeded from markers, bulk lesson set, exclude row, validation, save all.                           |
| `src/app/lesson/[id].tsx`      | Cards in a lesson; rename/delete lesson.                                                                                                                                                    |
| `src/app/card/[id].tsx`        | Card detail: edit fields + meaning, image section (preview, generate/regenerate, per-card toggle), SRS stats, reset progress, change lesson, delete.                                        |
| `src/app/+not-found.tsx`       | Friendly fallback linking home.                                                                                                                                                             |

Feature components live in `src/features/{study,quiz,scan,library}/`.

### Study session UX (src/features/study)

Deck of one visible card: front shows `cardHeadline` (ArabicType.hero, centered) and, when
`imageEnabled && aiImagesEnabled && aiImagePath`, the card image above it; tap flips to the
back (meaning prominent + `cardDetailRows` table). Swipe right = got it (success tint as it
moves), swipe left = not yet (accent tint); equivalent buttons below the deck plus an Undo
button. Answers persist immediately via `applyReview` (fire-and-forget with error toast and
undo-safe ordering); progress bar on top; completion screen with summary counts and a
"Study again" that rebuilds the session. Use react-native-gesture-handler + reanimated.

### Quiz UX (src/features/quiz)

One question at a time: instruction, prompt Arabic large, four (or fewer) choice buttons.
Tap: locks choices, correct turns success, wrong pick turns danger while correct pulses,
haptic, auto-advance after ~900ms. Results: score headline, per-question list (prompt,
your answer, correct answer), Try again (new seed) and Done.

## Testing

- vitest, colocated `*.test.ts` next to domain modules (`npm test`).
- Cover: happy paths, edge cases (empty queues, single-card sessions, undo at boundaries,
  marker at row 0, marker beyond last row, duplicate distractors, '-' cells), invalid input
  (zod rejections), and determinism (seeded rng).
- Use realistic Arabic fixtures from docs/SCAN_FORMATS.md (e.g. اتصل بـ / يتصل / اتصال).
- Lib modules: pure helpers tested; supabase-touching functions are NOT unit tested (kept
  thin instead).

## Environment and secrets

- App (.env, gitignored): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Edge functions (supabase secrets, never in the app): `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL` (optional), `FAL_KEY`, `FAL_MODEL` (optional).
- Missing app env must never crash the app: the root layout routes to the setup screen.

## Definition of done

`npm run typecheck`, `npm run lint`, and `npm test` all green; every screen reachable and
handling its loading/error/empty states; no TODOs without owner and reason; UI copy clean.
