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
- `modules/`: local Expo native modules, autolinked from the repo root. Only `src/lib`
  imports them, so the rest of the app depends on a lib contract and not on a native
  module that may be missing on a platform.
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
- `pdf_imports(id, user_id, storage_path, status created|processing|done|failed, total_pages?, next_page, from_page, to_page?, page_offset, current_lesson?, lessons_created, cards_created, last_error?, created_at, updated_at)`:
  book imports. Every page number here is in the UPLOADED file's numbering, not the printed
  book's: only the selected pages are uploaded (see below), so a slice runs `from_page` 1 to
  `to_page` N and `page_offset` is the book page its page 1 came from, minus 1. `bookPageRange`
  converts back for anything a person reads; `page_offset` 0 means the upload is the whole
  book, which is what pre-slicing rows and the legacy whole-book path store. `from_page`/
  `to_page` seed `next_page`, the resume cursor (`to_page` null runs to the last page).
  `(pdf_import_id, import_page)` on cards lets a re-run of a batch replace its own cards
  instead of duplicating them.
- Storage buckets (private): `scans` (page photos and uploaded book slices), `card-images`
  (generated study images).
- Storage path conventions: scans `${userId}/${slug}.jpg` where slug is from
  `makeStorageSlug()`; book PDFs `${userId}/imports/${slug}.pdf`; card images
  `${userId}/${cardId}.jpg` (upsert on regenerate).
- Whole curriculum PDFs are NOT uploaded. They run to tens of megabytes, past the Supabase
  storage upload limit (50 MB, and the free plan caps the setting there), and the importer
  only ever reads the selected lesson. The app cuts those pages out on the device with
  `extractPdfPages` and uploads the slice, so the upload is small whatever the book weighs.

## Domain contracts

Already implemented (do not rewrite, extend only if a contract below requires it):
`cards.ts` (types, zod schemas, `cardFromRow`, `FIELD_LABELS`, `cardHeadline`,
`cardDetailRows`, `withCardSrs`), `srs.ts` (Leitner + `learnedness`), `parsed-scan.ts`
(parser contract + `PARSED_FIELD_KEYS`), `scans.ts`, `lessons.ts`.

`learnedness(state)` scores how well a word is known, 0 (never answered, or just missed) to
1 (top box, clean record): 75% from `box / MAX_BOX`, 25% from lifetime accuracy, so two
words in the same box separate by how cleanly they got there. Quiz selection reads it.

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

### src/domain/quiz.ts

```ts
export type QuizKind = 'present' | 'imperative' | 'masdar' | 'meaning' | 'plural';
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
export function quizPool(cards: readonly Card[]): Card[];
export function buildQuiz(
  cards: Card[],
  options: { count: number; kinds: QuizKind[]; rng: () => number },
): QuizQuestion[];
export function answerQuizQuestion(
  cards: readonly Card[],
  cardId: string,
  correct: boolean,
  now: Date,
): { cards: Card[]; srs: SrsState } | null;
```

Rules: for verb-form kinds, eligible cards are verbs with a non-null target field; the
correct answer is that field; distractors are the same field from OTHER cards (unique, not
equal to the correct answer), ranked by similarity to the correct answer (letter distance +
wazn skeleton distance), preferring 3 distractors but allowing 1 minimum, else the card is
skipped. For 'meaning', any card type is eligible; prompt is `cardHeadline`, choices are
meanings. For 'plural', vocab cards with `plural1 ?? plural2`.

Selection: prompts come only from `quizPool` (cards with `lastReviewedAt !== null`, i.e.
already studied), drawn by weighted sampling without replacement where a card's weight is
`0.15 + (1 - learnedness)^2`, then returned sorted by `learnedness` ascending, so the least
learned words come up most often and are asked first. Distractors still draw on the whole
collection, never-studied cards included. Choice order shuffled with rng; no duplicate cards
in one quiz; if fewer eligible cards than `count`, return as many as possible. Deterministic
given the same rng. `answerQuizQuestion` applies a quiz answer exactly like a flashcard
answer (`reviewCard` with `got_it` / `not_yet`), so quiz results move the SRS level.

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
  pdfImports: ['pdf-imports'] as const,
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
export async function uploadPdf(localUri: string, onProgress?: UploadProgress): Promise<string>;
export async function createPdfImport(
  storagePath: string,
  range: ImportPageRange,
  totalPages: number | null,
  pageOffset: number,
): Promise<PdfImport>;
export async function getLatestPdfImport(): Promise<PdfImport | null>;
export async function listImportedCardIdsWithoutImages(importId: string): Promise<string[]>;
export async function listCardIdsWithoutImages(): Promise<string[]>; // any source
export async function getSignedUrl(bucket: 'scans' | 'card-images', path: string): Promise<string>;
export interface SaveReviewInput {
  scan: Scan;
  drafts: ReviewDraft[];
}
export async function saveReviewedCards(
  input: SaveReviewInput,
): Promise<{ created: number; cardIds: string[] }>;
```

`saveReviewedCards`: filter excluded drafts, `validateDrafts` (throw on problems), resolve
lesson names to ids creating lessons as needed (case-insensitive name match against existing),
insert cards (type, fields with note folded in, meaning, lesson_id, scan_id), mark the scan
`reviewed`, return the inserted card ids. After a successful save the review editor kicks off
`uploadPdf` streams the file off disk to a signed upload URL with
`expo-file-system`'s native upload task, reporting progress. It must NEVER read the PDF
into JS first: `fetch(uri).arrayBuffer()` base64 encodes a book sized file to cross the
bridge, and then supabase-js encodes it again to send it, which is why book imports used
to fail before a single page was ever parsed. A 413 is reported as the project's storage
upload limit, not as a generic failure. `createPdfImport` records the page count the
preview measured on device, so progress is honest from the first batch.

`saveReviewedCards` also kicks off
best-effort background image generation for those ids (`generateImagesForCards` in
`src/features/scan/generate-card-images.ts`: small concurrency pool, failures swallowed,
card queries invalidated per finished image), skipped when `aiImagesEnabled` is off. `uploadScanPage`: read the local file (base64 via expo FileSystem or
fetch+arrayBuffer), upload jpeg with contentType to `scans/${userId}/${makeStorageSlug()}.jpg`.

### src/lib/api.ts

```ts
export async function parseScan(scanId: string): Promise<ParsedScan>; // invokes 'parse-scan'
export async function generateCardImage(cardId: string): Promise<{ path: string }>; // invokes 'generate-card-image'
```

Use `getSupabase().functions.invoke(name, { body })`. Non-2xx or `{ error }` payloads throw
an `Error` whose message is safe to show the user. Validate success payloads with zod
(`parsedScanSchema` for parse-scan).

### src/lib/pdf-preview.ts

```ts
export function isPdfPreviewAvailable(): boolean;
export async function getPdfPageCount(localUri: string): Promise<number>;
export async function renderPdfPage(localUri: string, page: number, width: number): Promise<string>;
export async function extractPdfPages(
  localUri: string,
  fromPage: number,
  toPage: number,
): Promise<string>;
```

The only importer of `modules/pdf-preview`, a local Expo module that draws a page of a
local PDF with PDFKit and returns a cached JPEG URI. Declared apple-only, so
`requireOptionalNativeModule` yields null elsewhere and `isPdfPreviewAvailable()` is false;
callers fall back to typed page numbers rather than breaking. The native side caches by
(file, page, width) so paging back and forth over a spread redraws nothing.

### src/lib/book-file.ts

```ts
export async function keepBookFile(pickedUri: string): Promise<string>;
export function existingBookFile(localUri: string | null): string | null;
```

The picked PDF is moved out of the document picker's cache copy into
`Paths.document/books/`, because iOS reclaims the cache directory and a curriculum PDF is
a fat early candidate. Only the newest book is kept; picking another drops the previous
one. `existingBookFile` is how a caller checks the kept copy is still there before showing
a preview of it.

### src/lib/stores.ts (zustand + AsyncStorage persistence)

```ts
export const useStudyFilter: /* { selectedLessonIds: string[]; toggleLesson(id): void; selectAll(): void; isAll: boolean } */
export const useSettings: /* { aiImagesEnabled: boolean; newCardsPerSession: number; setAiImagesEnabled(v): void; setNewCardsPerSession(n): void } */
export const useBookFile: /* { storagePath: string | null; localUri: string | null; rememberBook(storagePath, localUri): void } */
```

Empty `selectedLessonIds` means "all lessons" (the default). `NO_LESSON_ID` may appear in the
selection. Defaults: aiImagesEnabled true, newCardsPerSession 20. `useBookFile` pairs the
uploaded book's storage path with the device copy `keepBookFile` left behind, so importing
the next lesson can page through the book without downloading the PDF again.

### src/lib/query-client.ts (owned by the shell)

Exports the singleton `queryClient` for the root provider.

## Edge function contracts (supabase/functions)

Both functions: `verify_jwt` enabled; build a supabase client from the caller's
Authorization header so RLS applies; respond JSON; on error respond `{ error: string }`
with a 4xx/5xx status and a message safe to show in the UI. Shared helpers in
`supabase/functions/_shared/`. Mirror of the parsed-scan zod contract lives in
`_shared/parsed-scan-contract.ts` with a sync comment.

### import-pdf-batch

Request `{ importId: string }`. Claims one batch of `BATCH_PAGES` (6) pages, extracts them
with unpdf/pdf.js as positioned text items, and sends that text to Anthropic with a forced
tool call. It reads text, never page images.

Extraction is the delicate part. pdf.js returns the items in DRAWING order, and in this book
every haraka that sits on a word's final letter is a zero-advance glyph drawn just before
that word, so bidi reordering strands it ahead of the word it belongs to: sometimes as an
item of its own, sometimes wedged onto the front of the next item's string. Left alone the
text reads مُحَمَّد where the page prints مُحَمَّدٌ, which silently deletes every tanween in
the book (tanween only ever falls on a final letter). `reattachDisplacedMarks`
(`_shared/arabic-marks.ts`) walks the items in drawing order and gives each word the marks
left over from the item drawn before it, unpacking precomposed forms such as U+FC5E (shadda
with dammatan) and dropping the space or tatweel they ride on. It must run BEFORE the sort
into reading order, because that drawing order is the only thing that says which word a
detached mark belongs to. A mark drawn over a word outranks one still being carried, and
anything that cannot be placed is passed through untouched rather than guessed onto a word.

Repairing the glyphs still leaves the harakat only as good as the typesetting, so the parsed
rows then go through a second, independent pass (`vocalizeLessons`) that treats the printed
LETTERS as the truth and derives the vowelling from knowledge of Arabic instead. Each Arabic
cell is sent with its column's grammatical role (`ROLE_LABELS`: past tense verb, masdar,
broken plural, active participle...) and the row's English meaning, which together decide
which reading of the letters is meant: كتب is كَتَبَ in the past column and كُتُبٌ in the
plural column, and nothing but the role can tell them apart. This is also why a dictionary
lookup does not fit: a verbs row needs seven separate cells vowelled (past, preposition,
present, imperative, masdar, and both participles), which is a paradigm, not a headword.

Nothing that comes back is trusted on its own. `chooseVocalized` (`_shared/vocalize.ts`)
keeps a proposal only if it is the SAME word: identical letters once marks, tatweel, spacing,
presentation forms and the Urdu lookalikes this book's fonts substitute (`ھ ک ی`) are folded
away by `arabicSkeleton`. So the pass can add harakat, correct harakat and rewrite
presentation forms into ordinary Arabic, but it cannot swap in a different word than the page
prints. It is monotonic too: a proposal carrying fewer marks than the page is dropped, so a
vague answer can never strip vowelling the book already had. A cell whose letters are
themselves corrupt (the broken heading font leaves ASCII inside the word, about 0.5% of
items) fails the guard and simply keeps what was printed.

`vocalizationTargets` and `applyVocalizations` share one internal walk, so the cells that get
asked about and the cells that get written back cannot drift out of step. The calls are
chunked (`VOCALIZE_CHUNK`, 100 cells) and run concurrently, and the whole pass is best
effort: any failure is logged and the batch lands with the printed forms rather than failing.

### parse-scan

Request `{ scanId: string }`. Load scan (404 if missing), reject if status is `reviewed`,
set `parsing`, download `page_paths` (1 to `MAX_SCAN_PAGES`, 8) from the scans bucket, then
split them into groups: two photos per group for nouns/verbs (right page + left page of one
spread), one per group for phrases. Each group is its own Anthropic messages request (model
from `ANTHROPIC_MODEL`, default `claude-sonnet-5`; key from `ANTHROPIC_API_KEY`) with a
forced tool call whose input schema matches the parsed-scan contract, and the groups run
concurrently, so a four-spread scan costs about the wall clock of one. Each group numbers
its rows from 0; `mergeParsed` concatenates the groups in photo order, shifts every
`lessonMarker.beforeRow` by the rows already ahead of it, and prefixes each warning with its
group ("Spread 2: ..."). The prompt must encode docs/SCAN_FORMATS.md: a spread merges
row-by-row across its two photos, field keys per kind exactly as in `PARSED_FIELD_KEYS`, meaning in English,
preserve harakat exactly, blank/dash cells null, detect handwritten LESSON markers between
rows into `lessonMarkers` (beforeRow = index of the first row at/after the marker), ignore
the watermark, margin notes into `note`, uncertainties into `warnings`. Blank cells are
never a warning: whole synonym, antonym, plural, and participle columns are routinely empty,
so the prompt forbids reporting them and `visibleWarnings` (src/domain/parsed-scan.ts) drops
any that slip through before the review banner renders, which also cleans up scans parsed
before that rule existed. The prompt also
asks the model to CHECK each filled-in answer (right plural/conjugation/masdar/participle,
right harakat) and report confident mistakes per row in `corrections` as
`{ field, suggested, reason }`; `fields` still carries the exact transcription, and
unreadable cells go to `warnings`, never `corrections`. Validate the tool
output with the contract schema, persist `parsed_rows` + status `parsed`, return
`{ parsed }`. On failure persist status `failed` + `parse_error` and return the error.

### generate-card-image

Request `{ cardId: string }`. Load card (404 if missing). Build prompt from the card's
meaning: a charming minimalist flat vector illustration (one central subject, rounded
geometric shapes, warm terracotta/amber/sage/cream palette, plain light background,
generous negative space). Call fal.ai (`FAL_KEY`; model id from `FAL_MODEL`, default
`fal-ai/flux/schnell`, endpoint `https://fal.run/{model}` with `{ prompt, image_size:
'landscape_4_3', num_images: 1 }`), download the resulting image, upload to
`card-images/${userId}/${cardId}.jpg` with upsert, update `ai_image_path`, return `{ path }`.

**Card images must never contain writing**, and two mechanisms keep them clean:

- _Prompt._ FLUX has no negative prompt, and its text encoder reads "no text, no letters,
  no captions" as a request for exactly those, so the prompt never names writing at all.
  It states the wanted result positively instead (smooth empty surfaces, an idea carried by
  shape and colour alone) and keeps the meaning unquoted so it reads as scene, not caption.
- _Check and retry._ Each generated image goes to Claude (`ANTHROPIC_API_KEY`; model from
  `IMAGE_CHECK_MODEL`, default `claude-haiku-4-5-20251001`) with a forced `report_writing_in_image`
  tool call returning `{ hasWriting, note }`; garbled letter-like squiggles count as writing
  and ties resolve to "yes". An image with writing is discarded and regenerated, up to three
  attempts whose prompts step from scene to symbol to bare pictogram (the surfaces that
  invite lettering vanish as the subject abstracts). All three dirty -> 502, leaving the card
  imageless rather than storing writing. fal.ai errors propagate at once; only writing retries.
  A check that cannot run (no key, upstream error) logs and keeps the image.

## Screen map

| Route                          | Purpose                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/_layout.tsx`          | Providers (QueryClientProvider, theme), splash handling, gates: unconfigured env -> setup screen; no session -> (auth); else (tabs).                                                                                                                   |
| `src/app/(auth)/sign-in.tsx`   | Email + password sign in with a sign-up toggle. Friendly errors, loading state, email-confirmation notice after sign up.                                                                                                                               |
| `src/app/(tabs)/_layout.tsx`   | Tabs: Study (index), Library, Scan, Settings. NativeTabs with SF symbol icons if supported (verify against node_modules/expo-router types), otherwise classic Tabs with expo-symbols icons.                                                            |
| `src/app/(tabs)/index.tsx`     | Home: greeting, due/new counts for the current filter, lesson filter chips (all lessons + NO_LESSON_ID), Start studying button, Quiz button, empty states pointing to the Scan tab.                                                                    |
| `src/app/(tabs)/library.tsx`   | Lessons with card counts (plus a "No lesson" group), tap into lesson detail.                                                                                                                                                                           |
| `src/app/(tabs)/scans.tsx`     | Scan history list (kind, pages, status badge, date) + New scan button. Tap: parsed -> review, failed -> error + retry parse, reviewed -> summary, uploaded/parsing -> progress.                                                                        |
| `src/app/(tabs)/settings.tsx`  | Account (email, sign out), AI images toggle, missing-pictures count with a "Make them" action (`useMissingCardImages`), new-cards-per-session stepper, app version.                                                                                    |
| `src/app/study/session.tsx`    | Flashcard session for the current filter (modal, full screen).                                                                                                                                                                                         |
| `src/app/quiz/index.tsx`       | Quiz setup: question count (5/10/20), kind toggles (present on by default), start. Shows eligible-question availability.                                                                                                                               |
| `src/app/quiz/session.tsx`     | Quiz runner + results.                                                                                                                                                                                                                                 |
| `src/app/scan/new.tsx`         | Kind picker (three friendly cards explaining each layout), pick/take up to 8 photos grouped into right-page-then-left-page spreads (phrases: one page per group), per-spread swap, crop/remove, upload + parse with progress, then navigate to review. |
| `src/app/scan/import-pdf.tsx`  | Book import: pick the curriculum PDF, page through the real pages to mark where the lesson starts and ends, upload with progress, then drive `import-pdf-batch` one batch at a time, pause/resume, resumable cursor. More pages reuse the upload.      |
| `src/app/scan/[id]/review.tsx` | Review parsed rows: editable fields per FIELD_LABELS, meaning, per-row lesson assignment seeded from markers, bulk lesson set, exclude row, validation, save all, then background image generation for the new cards.                                  |
| `src/app/lesson/[id].tsx`      | Cards in a lesson; rename/delete lesson.                                                                                                                                                                                                               |
| `src/app/card/[id].tsx`        | Card detail: edit fields + meaning, image section (preview, generate/regenerate, per-card toggle), SRS stats, reset progress, change lesson, delete.                                                                                                   |
| `src/app/+not-found.tsx`       | Friendly fallback linking home.                                                                                                                                                                                                                        |

Feature components live in `src/features/{study,quiz,scan,library}/`.

### Study session UX (src/features/study)

Deck of one visible card: front shows `cardHeadline` (ArabicType.hero, centered) and nothing
else, because the picture is a hint; tap flips to the back (the card image when
`imageEnabled && aiImagesEnabled && aiImagePath`, meaning prominent, `cardDetailRows` table).
`RefreshImageButton` sits in the back's top right corner as a bare icon, no box around it: it
calls `generateCardImage` again and invalidates only the signed URL, since the new picture
overwrites the same storage path. Its tap blocks the deck's tap (`blocksExternalGesture`), so
pressing it replaces the picture instead of flipping the card. Swipe right = got it (success tint as it
moves), swipe left = not yet (accent tint); equivalent buttons below the deck plus an Undo
button. Answers persist immediately via `applyReview` (fire-and-forget with error toast and
undo-safe ordering); progress bar on top; completion screen with summary counts and a
"Study again" that rebuilds the session. Use react-native-gesture-handler + reanimated.

### Quiz UX (src/features/quiz)

One question at a time: instruction, prompt Arabic large, four (or fewer) choice buttons.
Tap: locks choices, correct turns success, wrong pick turns danger while correct pulses,
haptic, auto-advance after ~900ms. Results: score headline, per-question list (prompt,
your answer, correct answer), Try again (new seed) and Done.

Each answer persists immediately via `applyReview` (fire-and-forget with a dismissible
error banner, same as the study deck), so a quiz raises and lowers levels exactly like a
flashcard session. The runner holds its own copy of the cards and applies each answer to it,
so "Try again" reflects the levels this quiz just changed; the cards query is invalidated on
exit. Setup blocks with a "study first" message while fewer than `MIN_QUIZ_QUESTIONS` cards
in the selection have ever been studied.

### Book import UX (src/features/scan)

Picking a PDF moves it to permanent storage (`keepBookFile`) and opens `PdfRangeStep`.
With the native renderer present it shows `PageBrowser`: the drawn page filling most of
the screen, a `‹ [page] of N ›` pager whose number is also typeable so a lesson deep in an
800 page book is one entry away, and "Start here" / "End here" buttons that mark the
current page as an end of the range. Marking an end past the other end drags that one
along, so the selection can never invert. The browser opens on the previous import's
`nextPage` when the book is already uploaded, which is where the next lesson begins.

The jump field uses a number pad, which on iOS has no return key, so it carries an
`InputAccessoryView` with Done and the page image dismisses the keyboard on tap. Nothing is
uploaded until the range is confirmed, so a wrong guess costs no bandwidth and no AI parse.
`PageNumbersForm` (two typed page numbers, validated against the page count when it is
known) is the fallback when the renderer is missing or the device copy of the book has gone;
it cannot slice, so that path uploads the whole file and may hit the storage limit.

Confirming the range cuts those pages out (`extractPdfPages`), uploads the slice, and
records `page_offset` so the progress screen still speaks in the book's page numbers.

`ProgressStep` reports at batch granularity because that is the truth: one batch is a single
Claude call over `IMPORT_BATCH_PAGES` (6) pages, so the cursor does not move for minutes.
Rather than let that read as a stall, the screen names the pages in flight
(`describeReadingNow`, "Reading pages 140 to 145") and `ProgressBar`'s `advancingTo` eases
the fill across them, stopping at 90% of the batch's span so it never claims work that has
not landed, then snapping when the batch reports.

Imported cards come straight from the edge function, which only talks to Anthropic, so
nothing has a picture when the pages are read. The runner calls `generateImagesForCards`
itself the moment an import reaches `done` (gated on `aiImagesEnabled`) and reports it on
the `imageStatus` line. There is deliberately NO button for this on the import screen: a
finished import makes its own pictures, and offering a button reads as though it will not.
Settings owns the catch-up case instead (`useMissingCardImages`), covering cards from any
source that still have none, including scans whose generation failed.

## Testing

- vitest, colocated `*.test.ts` next to domain modules, plus the pure helpers in
  `supabase/functions/_shared/` (`npm test`).
- Cover: happy paths, edge cases (empty queues, single-card sessions, undo at boundaries,
  marker at row 0, marker beyond last row, duplicate distractors, '-' cells), invalid input
  (zod rejections), and determinism (seeded rng).
- Use realistic Arabic fixtures from docs/SCAN_FORMATS.md (e.g. اتصل بـ / يتصل / اتصال).
- Lib modules: pure helpers tested; supabase-touching functions are NOT unit tested (kept
  thin instead).

## Environment and secrets

- App (.env, gitignored): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Edge functions (supabase secrets, never in the app): `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL` (optional), `IMAGE_CHECK_MODEL` (optional), `FAL_KEY`, `FAL_MODEL`
  (optional). `ANTHROPIC_API_KEY` is used by `parse-scan`, `import-pdf-batch`, and the
  card-image writing check.
- Missing app env must never crash the app: the root layout routes to the setup screen.

## Definition of done

`npm run typecheck`, `npm run lint`, and `npm test` all green; every screen reachable and
handling its loading/error/empty states; no TODOs without owner and reason; UI copy clean.
