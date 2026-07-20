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
): Promise<{ totalPages: number; pages: { page: number; items: PositionedItem[] }[] }> {
  const document = await getDocumentProxy(pdfBytes);
  const totalPages = document.numPages;
  const pages: { page: number; items: PositionedItem[] }[] = [];
  const lastPage = Math.min(toPage, totalPages);
  for (let pageNumber = fromPage; pageNumber <= lastPage; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: PositionedItem[] = [];
    for (const item of content.items) {
      if (typeof item !== 'object' || item === null || !('str' in item)) {
        continue;
      }
      const text = String(item.str).trim();
      if (text.length === 0) {
        continue;
      }
      const transform = (item as { transform?: unknown }).transform;
      const matrix = Array.isArray(transform) ? transform : [];
      const x = typeof matrix[4] === 'number' ? Math.round(matrix[4]) : 0;
      const y = typeof matrix[5] === 'number' ? Math.round(matrix[5]) : 0;
      items.push({ text, x, y });
    }
    // Reading order: top of the page first, right to left within a line.
    items.sort((a, b) => (a.y === b.y ? b.x - a.x : b.y - a.y));
    pages.push({ page: pageNumber, items });
  }
  return { totalPages, pages };
}

function serializePages(pages: { page: number; items: PositionedItem[] }[]): string {
  return pages
    .map((entry) => {
      const lines = entry.items.map((item) => `[x=${item.x} y=${item.y}] ${item.text}`);
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

function buildInstruction(currentLesson: string | null): string {
  const continuation =
    currentLesson === null
      ? 'This batch starts at the very beginning of the book.'
      : `The previous batch ended inside "${currentLesson}". If these pages start with table rows before any lesson heading, put them in a first group with continuesPreviousBatch=true.`;
  return [
    'You are reading consecutive pages of "Kashf Al-Mufradaat", a printed Arabic vocabulary curriculum. Each page of the PDF was extracted as positioned text items: [x= y=] coordinates followed by the text. Higher y is higher on the page; Arabic tables read right to left, so within a row larger x comes first.',
    continuation,
    'The book repeats one structure per lesson: a heading like الدَّرْسُ الأَوَّلُ (report its ordinal as lessonNumber, 1 for الأول, 2 for الثاني...), lesson text (dialogues or reading passages, NOT vocabulary rows: skip it), then vocabulary tables.',
    'Table types, recognized by their column headers:',
    '- Nouns: المفرد -> "arabic", الجمع الأول -> "plural1", الجمع الثاني -> "plural2", المعنى -> meaning (English).',
    '- Synonyms page: المرادف -> "synonym", its الجمع -> "synonymPlural", المضاد -> "antonym", its الجمع -> "antonymPlural". These columns extend the nouns of the SAME lesson: merge them into the nouns rows by row order when both tables have content, or skip the page when the table is blank.',
    '- Verbs: الماضي -> "past", الحرف -> "preposition", المضارع -> "present", الأمر -> "imperative", المصدر -> "masdar", اسم الفاعل -> "activeParticiple", اسم المفعول -> "passiveParticiple", and the English meaning column -> meaning.',
    '- Expressions: التعبير -> "arabic" (a phrases row), المعنى -> meaning, الجملة (example sentence) -> "note".',
    'Rules:',
    '- Copy Arabic EXACTLY as printed, preserving every haraka. Never normalize.',
    '- Blank cells and lone dashes are null. Rows whose cells are all empty do not exist: the book leaves many tables blank for handwriting, skip them entirely.',
    '- meaning is the English meaning; rows with no meaning column value still count when they have Arabic content, set meaning to null.',
    '- Use one lessons[] group per lesson heading that appears in these pages, in reading order. Rows before the first heading go into a continuesPreviousBatch=true group.',
    '- Page numbers, decorative text, watermarks, and section dividers are not content.',
    '- Report anything ambiguous in warnings as short English strings.',
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
              { type: 'text', text: buildInstruction(currentLesson) },
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
      'id, storage_path, status, total_pages, next_page, current_lesson, lessons_created, cards_created, updated_at',
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
    const toPage = fromPage + BATCH_PAGES - 1;
    const { totalPages, pages } = await extractPositionedPages(pdfBytes, fromPage, toPage);
    if (fromPage > totalPages) {
      throw new HttpError('This import is already past the last page.', 409);
    }

    const toolInput = await requestParseFromClaude(serializePages(pages), current.current_lesson);
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

    const lastProcessed = Math.min(toPage, totalPages);
    const nextPage = lastProcessed + 1;
    const done = nextPage > totalPages;
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
