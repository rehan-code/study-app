import { z } from 'npm:zod@4';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getDocumentProxy } from 'npm:unpdf@1.6.2';

import { errorResponse, handleOptions, HttpError, jsonResponse } from '../_shared/http.ts';
import { clientFromRequest } from '../_shared/supabase.ts';
import { PARSED_FIELD_KEYS, type ScanKind } from '../_shared/parsed-scan-contract.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_OUTPUT_TOKENS = 16000;
const TOOL_NAME = 'record_imported_pages';

/**
 * A hung Anthropic request would otherwise run until the edge runtime kills
 * the whole function, stranding the import in 'processing' with no last_error.
 * Timing out below the platform wall-clock limit turns that into a normal
 * resumable failure. Generous because dense pages can take minutes to parse.
 */
const ANTHROPIC_TIMEOUT_MS = 180_000;

/**
 * Pages per Claude call. Six covers roughly one lesson (text, nouns spread,
 * synonyms page, verbs page, expressions page) while keeping the forced tool
 * output comfortably under MAX_OUTPUT_TOKENS.
 *
 * Mirrored as IMPORT_BATCH_PAGES in src/domain/pdf-import.ts, which the app
 * uses to name the pages being read while a batch is in flight. Keep in sync.
 */
const BATCH_PAGES = 6;

const GENERIC_ERROR = "Couldn't read those pages. Try resuming the import.";

/**
 * Lost a claim race with another call working the same import. The import row
 * belongs to the winner and is healthy, so the catch block must NOT mark the
 * import failed on this path.
 */
class BatchConflictError extends HttpError {
  constructor() {
    super('Another import request is already running. Wait for it.', 409);
    this.name = 'BatchConflictError';
  }
}

const requestSchema = z.object({ importId: z.uuid() });

const importRecordSchema = z.object({
  id: z.string(),
  storage_path: z.string(),
  status: z.enum(['created', 'processing', 'done', 'failed']),
  total_pages: z.number().int().positive().nullable(),
  next_page: z.number().int().positive(),
  from_page: z.number().int().positive(),
  to_page: z.number().int().positive().nullable(),
  current_lesson: z.string().nullable(),
  lessons_created: z.number().int().nonnegative(),
  cards_created: z.number().int().nonnegative(),
  updated_at: z.string(),
});

const claimStampRowSchema = z.object({ updated_at: z.string() });

const toolUseBlockSchema = z.object({ type: z.literal('tool_use'), input: z.unknown() });
const anthropicMessageSchema = z.object({ content: z.array(z.unknown()) });

const importedRowSchema = z.object({
  fields: z.record(z.string(), z.string().nullable()),
  meaning: z.string().nullable(),
  note: z.string().nullable(),
});

const importedLessonSchema = z.object({
  lessonNumber: z.number().int().positive().nullable(),
  title: z.string(),
  continuesPreviousBatch: z.boolean(),
  nouns: z.array(importedRowSchema),
  verbs: z.array(importedRowSchema),
  phrases: z.array(importedRowSchema),
});

const importedPagesSchema = z.object({
  lessons: z.array(importedLessonSchema),
  warnings: z.array(z.string()),
});

type ImportedRow = z.infer<typeof importedRowSchema>;
type ImportedLesson = z.infer<typeof importedLessonSchema>;

interface PositionedItem {
  text: string;
  x: number;
  y: number;
}

/** One visual line of a page: the pieces sharing a baseline, ordered right to left. */
interface PageLine {
  y: number;
  items: PositionedItem[];
}

/**
 * Baselines closer than this belong to the same visual line. Harakat are their
 * own text items a point or two above the letter they sit on, and cells across
 * one table row rarely share an exact baseline, so grouping on equality split a
 * row over several lines and shuffled its columns out of reading order: a 1pt
 * drift was enough to emit the leftmost column before the rightmost one. Table
 * rows in this book sit about 31pt apart, so 6 stays well clear of the next row.
 */
const LINE_TOLERANCE = 6;

/**
 * Parts of the book embed fonts that put Arabic into legacy presentation-form
 * codepoints (U+FB50-U+FEFF) and borrow Urdu/Farsi letter shapes, which the
 * cards then store verbatim: they render oddly and never match text from the
 * photographed scans. NFKC maps presentation forms back to real letters, but
 * decomposes a shadda/haraka ligature into a SPACE plus the mark, splitting the
 * word it sat on, so that space is stripped before anything else. Verified
 * against Lesson 15 (book page 162), the page that surfaced every variant.
 */
const DETACHED_HARAKA = /[\s ]+(?=[ً-ٰٕ])/gu;
const FOREIGN_LETTERS: readonly [RegExp, string][] = [
  [/[ھہ]/gu, 'ه'],
  [/ی/gu, 'ي'],
  [/ک/gu, 'ك'],
];
// Lam-alef arrives as one ligature glyph, so its marks land after the alef in
// the text layer; in لَا and لِأَ the first mark belongs on the lam.
const LAM_ALEF_FIXES: readonly [RegExp, string][] = [
  [/لاَ/gu, 'لَا'],
  [/لأَِ/gu, 'لِأَ'],
];

function normalizeArabic(raw: string): string {
  let text = raw.normalize('NFKC').replace(DETACHED_HARAKA, '');
  for (const [pattern, replacement] of FOREIGN_LETTERS) {
    text = text.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of LAM_ALEF_FIXES) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, ' ').trim();
}

function groupIntoLines(items: PositionedItem[]): PageLine[] {
  // Top of the page first, right to left within a line: Arabic reading order.
  const sorted = [...items].sort((a, b) => (a.y === b.y ? b.x - a.x : b.y - a.y));
  const lines: PageLine[] = [];
  for (const item of sorted) {
    // Measured against the line's own top, never its last item, so a column of
    // near-misses cannot chain a whole page into one line.
    const open = lines.at(-1);
    if (open && open.y - item.y <= LINE_TOLERANCE) {
      open.items.push(item);
      continue;
    }
    lines.push({ y: item.y, items: [item] });
  }
  for (const line of lines) {
    line.items.sort((a, b) => b.x - a.x);
  }
  return lines;
}

async function downloadPdf(supabase: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from('scans').download(path);
  if (error || !data) {
    console.error('import-pdf-batch: pdf download failed', { path, error });
    throw new HttpError("Couldn't load the uploaded PDF. Try again.", 500);
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * pdf.js text items carry a transform matrix; elements 4 and 5 are the x/y
 * position in page space. Only the requested pages are parsed, which keeps
 * CPU usage far below the edge runtime limit even for an 856 page book.
 */
async function extractPositionedPages(
  pdfBytes: Uint8Array,
  fromPage: number,
  toPage: number,
): Promise<{ totalPages: number; pages: { page: number; lines: PageLine[] }[] }> {
  const document = await getDocumentProxy(pdfBytes);
  const totalPages = document.numPages;
  const pages: { page: number; lines: PageLine[] }[] = [];
  const lastPage = Math.min(toPage, totalPages);
  for (let pageNumber = fromPage; pageNumber <= lastPage; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: PositionedItem[] = [];
    for (const item of content.items) {
      if (typeof item !== 'object' || item === null || !('str' in item)) {
        continue;
      }
      const text = normalizeArabic(String(item.str));
      if (text.length === 0) {
        continue;
      }
      const transform = (item as { transform?: unknown }).transform;
      const matrix = Array.isArray(transform) ? transform : [];
      const x = typeof matrix[4] === 'number' ? Math.round(matrix[4]) : 0;
      const y = typeof matrix[5] === 'number' ? Math.round(matrix[5]) : 0;
      items.push({ text, x, y });
    }
    pages.push({ page: pageNumber, lines: groupIntoLines(items) });
  }
  return { totalPages, pages };
}

/** One output line per visual line, so a table row arrives as a row. */
function serializePages(pages: { page: number; lines: PageLine[] }[]): string {
  return pages
    .map((entry) => {
      const lines = entry.lines.map((line) => {
        const pieces = line.items.map((item) => `[x=${item.x}] ${item.text}`);
        return `[y=${line.y}] ${pieces.join('  ')}`;
      });
      return `=== PAGE ${entry.page} ===\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

function buildToolInputSchema(): Record<string, unknown> {
  const rowSchemaFor = (kind: ScanKind): Record<string, unknown> => {
    const keys = [...PARSED_FIELD_KEYS[kind]];
    const fieldProperties: Record<string, unknown> = {};
    for (const key of keys) {
      fieldProperties[key] = { type: ['string', 'null'] };
    }
    return {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fields', 'meaning', 'note'],
        properties: {
          fields: {
            type: 'object',
            additionalProperties: false,
            required: keys,
            properties: fieldProperties,
          },
          meaning: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
        },
      },
    };
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['lessons', 'warnings'],
    properties: {
      lessons: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'lessonNumber',
            'title',
            'continuesPreviousBatch',
            'nouns',
            'verbs',
            'phrases',
          ],
          properties: {
            lessonNumber: { type: ['integer', 'null'], minimum: 1 },
            title: { type: 'string' },
            continuesPreviousBatch: { type: 'boolean' },
            nouns: rowSchemaFor('nouns'),
            verbs: rowSchemaFor('verbs'),
            phrases: rowSchemaFor('phrases'),
          },
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  };
}

function buildInstruction(currentLesson: string | null, startsAtBookStart: boolean): string {
  let continuation: string;
  if (currentLesson !== null) {
    continuation = `The previous batch ended inside "${currentLesson}". If these pages start with table rows before any lesson heading, put them in a first group with continuesPreviousBatch=true.`;
  } else if (startsAtBookStart) {
    continuation = 'This batch starts at the very beginning of the book.';
  } else {
    // A page-range import opens mid-book, so the first pages can land inside a
    // lesson whose heading was never read.
    continuation =
      'This batch starts partway through the book and no earlier pages were read, so it may open in the middle of a lesson. If these pages start with table rows before any lesson heading, put them in a first group titled from whatever heading or running header is visible, with continuesPreviousBatch=true and lessonNumber set only if the lesson number is actually printed on these pages.';
  }
  return [
    'You are reading consecutive pages of "Kashf Al-Mufradaat", a printed Arabic vocabulary curriculum. Each page of the PDF was extracted as positioned text: one output line per visual line of the page, written as [y=...] followed by that line\'s pieces, each as [x=...] text. Higher y is higher on the page, and a line\'s pieces are already in Arabic reading order, right to left, so larger x comes first. Harakat often arrive as their own piece beside the letter they sit on; join them back onto the word.',
    continuation,
    'The book repeats one structure per lesson: a heading like الدَّرْسُ الأَوَّلُ (report its ordinal as lessonNumber, 1 for الأول, 2 for الثاني...), lesson text (dialogues or reading passages, NOT vocabulary rows: skip it), then vocabulary tables.',
    "Every table column keeps its own band of x, and one table row is normally one output line. The column headers are the table's first line, so their x values say where each band sits: place each piece of a row in the band its x falls in, and never merge two columns into one value.",
    "An English meaning too long for its cell wraps onto its own short line just above or below the row it belongs to, sitting in the same x band. Join those fragments into that row's single meaning; a line holding only wrapped English is never a row of its own.",
    'Table types, recognized by their column headers:',
    '- Nouns: المفرد -> "arabic", الجمع الأول -> "plural1", الجمع الثاني -> "plural2", المعنى -> meaning (English).',
    '- Synonyms page: المرادف -> "synonym", its الجمع -> "synonymPlural", المضاد -> "antonym", its الجمع -> "antonymPlural". These columns extend the nouns of the SAME lesson: merge them into the nouns rows by row order when both tables have content, or skip the page when the table is blank.',
    '- Verbs: الماضي -> "past", الحرف -> "preposition", المضارع -> "present", الأمر -> "imperative", المصدر -> "masdar", اسم الفاعل -> "activeParticiple", اسم المفعول -> "passiveParticiple", and the English meaning column -> meaning.',
    '- Expressions: التعبير -> "arabic" (a phrases row), المعنى -> meaning, الجملة (example sentence) -> note. Its three columns run right to left: التعبير farthest right, the English المعنى in the middle, الجملة farthest left. The row\'s English is the divider, so Arabic to the RIGHT of it is the expression and Arabic to the LEFT of it is the example sentence. The sentence normally quotes the expression inside a longer clause, which is exactly why it must never become "arabic": the card asks the expression alone. A row whose Arabic all sits right of the English has no sentence, so note is null. If a row carries no English, split it at the التعبير and الجملة header x values instead.',
    'Rules:',
    '- Copy Arabic EXACTLY as printed, preserving every haraka. Never normalize.',
    '- Blank cells and lone dashes are null. Rows whose cells are all empty do not exist: the book leaves many tables blank for handwriting, skip them entirely.',
    '- meaning is the English meaning; rows with no meaning column value still count when they have Arabic content, set meaning to null.',
    '- Use one lessons[] group per lesson heading that appears in these pages, in reading order. Rows before the first heading go into a continuesPreviousBatch=true group.',
    '- Page numbers, decorative text, watermarks, and section dividers are not content.',
    '- Report anything ambiguous in warnings as short English strings.',
    '- Never report an empty or missing cell in warnings. Blank cells are normal in these tables, especially synonym, antonym, plural, and participle columns, and a whole column can be empty.',
    `Call the ${TOOL_NAME} tool exactly once with the complete result.`,
  ].join('\n');
}

function mapAnthropicError(status: number, bodyText: string): HttpError {
  if (status === 401 || status === 403) {
    return new HttpError('The AI key was rejected. Update the ANTHROPIC_API_KEY secret.', 500);
  }
  if (status === 429 || status === 529) {
    return new HttpError('The AI service is busy right now. Wait a minute and resume.', 503);
  }
  if (status === 413 || bodyText.includes('request_too_large')) {
    return new HttpError('These pages are too dense to parse in one batch.', 413);
  }
  return new HttpError(GENERIC_ERROR, 502);
}

async function requestParseFromClaude(
  serializedPages: string,
  currentLesson: string | null,
  startsAtBookStart: boolean,
): Promise<unknown> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new HttpError("AI parsing isn't set up yet. Add the ANTHROPIC_API_KEY secret.", 500);
  }
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;
  let response: Response;
  let bodyText: string;
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        tools: [
          {
            name: TOOL_NAME,
            description: 'Record the structured vocabulary extracted from these book pages.',
            input_schema: buildToolInputSchema(),
          },
        ],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: serializedPages },
              { type: 'text', text: buildInstruction(currentLesson, startsAtBookStart) },
            ],
          },
        ],
      }),
    });
    bodyText = await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      console.error('import-pdf-batch: Anthropic request timed out', {
        timeoutMs: ANTHROPIC_TIMEOUT_MS,
      });
      throw new HttpError('The AI service took too long. Resume to retry this batch.', 504);
    }
    throw error;
  }
  if (!response.ok) {
    console.error('import-pdf-batch: Anthropic error', { status: response.status, body: bodyText });
    throw mapAnthropicError(response.status, bodyText);
  }
  const message = anthropicMessageSchema.safeParse(JSON.parse(bodyText));
  if (!message.success) {
    console.error('import-pdf-batch: unexpected Anthropic response shape', message.error);
    throw new HttpError(GENERIC_ERROR, 502);
  }
  for (const block of message.data.content) {
    const toolUse = toolUseBlockSchema.safeParse(block);
    if (toolUse.success) {
      return toolUse.data.input;
    }
  }
  console.error('import-pdf-batch: no tool_use block in Anthropic response');
  throw new HttpError(GENERIC_ERROR, 502);
}

function normalizeFields(kind: ScanKind, row: ImportedRow): Record<string, string | null> {
  const fields: Record<string, string | null> = {};
  for (const key of PARSED_FIELD_KEYS[kind]) {
    const value = row.fields[key] ?? null;
    const trimmed = value?.trim() ?? '';
    fields[key] = trimmed.length > 0 && trimmed !== '-' ? trimmed : null;
  }
  return fields;
}

const REQUIRED_FIELD: Record<ScanKind, string> = {
  nouns: 'arabic',
  verbs: 'past',
  phrases: 'arabic',
};

const CARD_TYPE: Record<ScanKind, string> = {
  nouns: 'vocab',
  verbs: 'verb',
  phrases: 'phrase',
};

interface CardInsert {
  lesson_id: string;
  pdf_import_id: string;
  import_page: number;
  type: string;
  fields: Record<string, string | null>;
  meaning: string;
}

function cardsForLesson(
  lessonId: string,
  importId: string,
  batchStartPage: number,
  lesson: ImportedLesson,
): CardInsert[] {
  const cards: CardInsert[] = [];
  const groups: { kind: ScanKind; rows: ImportedRow[] }[] = [
    { kind: 'nouns', rows: lesson.nouns },
    { kind: 'verbs', rows: lesson.verbs },
    { kind: 'phrases', rows: lesson.phrases },
  ];
  for (const group of groups) {
    for (const row of group.rows) {
      const fields = normalizeFields(group.kind, row);
      if (fields[REQUIRED_FIELD[group.kind]] === null) {
        continue;
      }
      const note = row.note?.trim() ?? '';
      fields.note = note.length > 0 ? note : null;
      cards.push({
        lesson_id: lessonId,
        pdf_import_id: importId,
        import_page: batchStartPage,
        type: CARD_TYPE[group.kind],
        fields,
        meaning: row.meaning?.trim() ?? '',
      });
    }
  }
  return cards;
}

/** "Lesson N" for numbered headings; the printed title otherwise. */
function resolveLessonName(lesson: ImportedLesson): string {
  if (lesson.lessonNumber !== null) {
    return `Lesson ${lesson.lessonNumber}`;
  }
  const title = lesson.title.trim();
  return title.length > 0 ? title : 'Imported';
}

async function getOrCreateLesson(
  supabase: SupabaseClient,
  name: string,
  position: number,
): Promise<{ id: string; created: boolean }> {
  const { data: existing, error: lookupError } = await supabase
    .from('lessons')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (lookupError) {
    console.error('import-pdf-batch: lesson lookup failed', lookupError);
    throw new HttpError("Couldn't save a lesson. Try resuming.", 500);
  }
  if (existing) {
    return { id: String(existing.id), created: false };
  }
  const { data: inserted, error: insertError } = await supabase
    .from('lessons')
    .insert({ name, position })
    .select('id')
    .single();
  if (insertError || !inserted) {
    console.error('import-pdf-batch: lesson insert failed', insertError);
    throw new HttpError("Couldn't save a lesson. Try resuming.", 500);
  }
  return { id: String(inserted.id), created: true };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) {
    return preflight;
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed.', 405);
  }

  let supabase: SupabaseClient;
  try {
    supabase = clientFromRequest(req);
  } catch (error) {
    console.error('import-pdf-batch: client setup failed', error);
    return errorResponse('The server is not configured correctly.', 500);
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return errorResponse('Sign in to import a PDF.', 401);
  }

  const body = await req.json().catch(() => null);
  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) {
    return errorResponse('A valid import id is required.', 400);
  }
  const { importId } = parsedBody.data;

  const { data: importRow, error: importError } = await supabase
    .from('pdf_imports')
    .select(
      'id, storage_path, status, total_pages, next_page, from_page, to_page, current_lesson, lessons_created, cards_created, updated_at',
    )
    .eq('id', importId)
    .maybeSingle();
  if (importError) {
    console.error('import-pdf-batch: import lookup failed', importError);
    return errorResponse("Couldn't load that import. Try again.", 500);
  }
  if (!importRow) {
    return errorResponse('Import not found.', 404);
  }
  const record = importRecordSchema.safeParse(importRow);
  if (!record.success) {
    console.error('import-pdf-batch: import row failed validation', record.error);
    return errorResponse("Couldn't load that import. Try again.", 500);
  }
  const current = record.data;

  if (current.status === 'done') {
    return jsonResponse({
      status: 'done',
      totalPages: current.total_pages,
      nextPage: current.next_page,
      lessonsCreated: current.lessons_created,
      cardsCreated: current.cards_created,
    });
  }

  const fromPage = current.next_page;
  const claimStamp = new Date().toISOString();

  try {
    // Claim the batch before any other work. The CAS on (next_page, updated_at)
    // lets exactly one of two calls racing from the same row snapshot proceed;
    // the loser exits here, before it has read the PDF or written anything.
    const { data: claimed, error: claimError } = await supabase
      .from('pdf_imports')
      .update({ status: 'processing', last_error: null, updated_at: claimStamp })
      .eq('id', importId)
      .eq('next_page', fromPage)
      .eq('updated_at', current.updated_at)
      .select('id');
    if (claimError) {
      console.error('import-pdf-batch: batch claim failed', claimError);
      throw new HttpError("Couldn't start this batch. Try resuming.", 500);
    }
    if (!claimed || claimed.length === 0) {
      throw new BatchConflictError();
    }

    const pdfBytes = await downloadPdf(supabase, current.storage_path);
    // The batch never reads past the end of the selected range.
    const batchEnd =
      current.to_page === null
        ? fromPage + BATCH_PAGES - 1
        : Math.min(fromPage + BATCH_PAGES - 1, current.to_page);
    const { totalPages, pages } = await extractPositionedPages(pdfBytes, fromPage, batchEnd);
    const selectionEnd =
      current.to_page === null ? totalPages : Math.min(current.to_page, totalPages);
    if (fromPage > selectionEnd) {
      // A hand-typed range can start past the end of the PDF; say so instead of
      // reporting the cursor message meant for an already-finished import.
      throw new HttpError(
        fromPage === current.from_page
          ? `Page ${fromPage} is past the end of this PDF, which has ${totalPages} pages.`
          : 'This import is already past the last page.',
        409,
      );
    }

    const toolInput = await requestParseFromClaude(
      serializePages(pages),
      current.current_lesson,
      fromPage === 1,
    );
    const validated = importedPagesSchema.safeParse(toolInput);
    if (!validated.success) {
      console.error('import-pdf-batch: tool output failed validation', validated.error);
      throw new HttpError('The AI returned an unexpected result. Resume to retry this batch.', 502);
    }

    // The Claude call is slow; a resume issued meanwhile may have reclaimed
    // the batch. Re-check ownership so a superseded run exits before touching
    // cards. Timestamps are compared as instants because PostgREST returns a
    // different ISO offset format than Date.toISOString produces.
    const { data: ownerRow, error: ownerError } = await supabase
      .from('pdf_imports')
      .select('updated_at')
      .eq('id', importId)
      .maybeSingle();
    if (ownerError) {
      console.error('import-pdf-batch: claim re-check failed', ownerError);
      throw new HttpError("Couldn't save this batch. Try resuming.", 500);
    }
    const ownerStamp = claimStampRowSchema.safeParse(ownerRow);
    if (!ownerStamp.success || Date.parse(ownerStamp.data.updated_at) !== Date.parse(claimStamp)) {
      throw new BatchConflictError();
    }

    // Re-running a failed batch replaces whatever it managed to write.
    const { error: cleanupError } = await supabase
      .from('cards')
      .delete()
      .eq('pdf_import_id', importId)
      .eq('import_page', fromPage);
    if (cleanupError) {
      console.error('import-pdf-batch: stale card cleanup failed', cleanupError);
      throw new HttpError("Couldn't prepare this batch. Try resuming.", 500);
    }

    let lessonsCreated = 0;
    let cardsCreated = 0;
    let openLesson = current.current_lesson;
    for (const lesson of validated.data.lessons) {
      const isContinuation = lesson.continuesPreviousBatch && openLesson !== null;
      const name = isContinuation && openLesson !== null ? openLesson : resolveLessonName(lesson);
      const position = lesson.lessonNumber ?? 0;
      const { id: lessonId, created } = await getOrCreateLesson(supabase, name, position);
      if (created) {
        lessonsCreated += 1;
      }
      const cards = cardsForLesson(lessonId, importId, fromPage, lesson);
      if (cards.length > 0) {
        const { error: cardsError } = await supabase.from('cards').insert(cards);
        if (cardsError) {
          console.error('import-pdf-batch: card insert failed', cardsError);
          throw new HttpError("Couldn't save this batch's cards. Try resuming.", 500);
        }
        cardsCreated += cards.length;
      }
      openLesson = name;
    }

    const lastProcessed = Math.min(batchEnd, selectionEnd);
    const nextPage = lastProcessed + 1;
    const done = nextPage > selectionEnd;
    // Keyed on the claim stamp: only the call that still owns the claim can
    // advance the cursor, so a superseded run fails loudly here instead of
    // double-counting a batch.
    const { data: advanced, error: advanceError } = await supabase
      .from('pdf_imports')
      .update({
        status: done ? 'done' : 'processing',
        total_pages: totalPages,
        next_page: nextPage,
        current_lesson: openLesson,
        lessons_created: current.lessons_created + lessonsCreated,
        cards_created: current.cards_created + cardsCreated,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', importId)
      .eq('next_page', fromPage)
      .eq('updated_at', claimStamp)
      .select('id');
    if (advanceError) {
      console.error('import-pdf-batch: cursor advance failed', advanceError);
      throw new HttpError("Couldn't finish this batch. Try resuming.", 500);
    }
    if (!advanced || advanced.length === 0) {
      throw new BatchConflictError();
    }

    return jsonResponse({
      status: done ? 'done' : 'processing',
      totalPages,
      nextPage,
      lessonsCreated: current.lessons_created + lessonsCreated,
      cardsCreated: current.cards_created + cardsCreated,
      batch: {
        fromPage,
        toPage: lastProcessed,
        cardsAdded: cardsCreated,
        warnings: validated.data.warnings,
      },
    });
  } catch (error) {
    const message = error instanceof HttpError ? error.message : GENERIC_ERROR;
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) {
      console.error('import-pdf-batch: unexpected failure', error);
    }
    // Losing the claim means another call owns the import and its state is
    // healthy; marking it failed here would clobber the winner's progress.
    if (error instanceof BatchConflictError) {
      return errorResponse(message, status);
    }
    // Guarded by the claim stamp so a run that was superseded mid-failure
    // still cannot overwrite the current owner's state.
    const { error: failError } = await supabase
      .from('pdf_imports')
      .update({ status: 'failed', last_error: message, updated_at: new Date().toISOString() })
      .eq('id', importId)
      .eq('updated_at', claimStamp);
    if (failError) {
      console.error('import-pdf-batch: could not record failure', failError);
    }
    return errorResponse(message, status);
  }
});
