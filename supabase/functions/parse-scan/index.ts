import { z } from 'npm:zod@4';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  errorResponse,
  fetchWithTimeout,
  handleOptions,
  HttpError,
  jsonResponse,
} from '../_shared/http.ts';
import { clientFromRequest } from '../_shared/supabase.ts';
import {
  PARSED_FIELD_KEYS,
  parsedScanSchema,
  SCAN_KINDS,
  type ParsedScan,
  type ScanKind,
} from '../_shared/parsed-scan-contract.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_OUTPUT_TOKENS = 16000;
const TOOL_NAME = 'record_parsed_scan';
// Anthropic rejects images above ~5MB; catching it here gives a clearer message.
const MAX_PAGE_BYTES = 5 * 1024 * 1024;
// Aborts well before the edge runtime's wall clock limit kills the function,
// so a hung Anthropic call records 'failed' instead of stranding the scan.
const ANTHROPIC_TIMEOUT_MS = 240_000;
// Longer than any legitimate attempt (page downloads plus ANTHROPIC_TIMEOUT_MS).
// A 'parsing' scan whose stamp is older than this is stranded; re-parse it.
const PARSE_STALE_MS = 10 * 60 * 1000;

const GENERIC_PARSE_ERROR = "Couldn't read those pages. Try parsing again.";

const requestSchema = z.object({ scanId: z.uuid() });

const scanRecordSchema = z.object({
  id: z.string(),
  kind: z.enum(SCAN_KINDS),
  status: z.string(),
  page_paths: z.array(z.string()),
  parse_started_at: z.string().nullable(),
});

function isParseStale(parseStartedAt: string | null): boolean {
  if (parseStartedAt === null) {
    return true;
  }
  const startedMs = Date.parse(parseStartedAt);
  if (Number.isNaN(startedMs)) {
    return true;
  }
  return Date.now() - startedMs > PARSE_STALE_MS;
}

const toolUseBlockSchema = z.object({ type: z.literal('tool_use'), input: z.unknown() });

const anthropicMessageSchema = z.object({ content: z.array(z.unknown()) });

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function downloadPagesAsBase64(
  supabase: SupabaseClient,
  pagePaths: string[],
): Promise<string[]> {
  const pages: string[] = [];
  for (const path of pagePaths) {
    const { data, error } = await supabase.storage.from('scans').download(path);
    if (error || !data) {
      console.error('parse-scan: page download failed', { path, error });
      throw new HttpError("Couldn't load the page photos. Try again.", 500);
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.length > MAX_PAGE_BYTES) {
      throw new HttpError('A page photo is too large to parse. Retake it and try again.', 413);
    }
    pages.push(toBase64(bytes));
  }
  return pages;
}

function buildToolInputSchema(kind: ScanKind): Record<string, unknown> {
  const keys = [...PARSED_FIELD_KEYS[kind]];
  const fieldProperties: Record<string, unknown> = {};
  for (const key of keys) {
    fieldProperties[key] = { type: ['string', 'null'] };
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'rows', 'lessonMarkers', 'warnings'],
    properties: {
      kind: { type: 'string', enum: [kind] },
      rows: {
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
      },
      lessonMarkers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['beforeRow', 'name'],
          properties: {
            beforeRow: { type: 'integer', minimum: 0 },
            name: { type: 'string' },
          },
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
  };
}

const COLUMN_GUIDES: Record<ScanKind, string> = {
  nouns: [
    'Each row describes one noun or adjective.',
    'Right page columns, read right to left: المفرد (singular) -> "arabic", الجمع الأول (first plural) -> "plural1", الجمع الثاني (second plural) -> "plural2", المعنى (English meaning) -> "meaning".',
    'Left page columns, read right to left: المرادف (synonym) -> "synonym", الجمع next to it (synonym plural) -> "synonymPlural", المضاد (antonym) -> "antonym", الجمع next to it (antonym plural) -> "antonymPlural".',
    'Most rows fill only the singular, first plural, and meaning; synonym and antonym cells are usually empty.',
    'When المعنى carries a parenthesized Arabic example sentence, keep only the English gloss in "meaning" and move the example into "note".',
  ].join('\n'),
  verbs: [
    'Each row describes one verb.',
    'Right page columns, read right to left: الماضي (past tense) -> "past", الحرف (the preposition the verb governs, e.g. بـ or إلى) -> "preposition", المضارع (present tense) -> "present", الأمر (imperative) -> "imperative", المصدر (verbal noun) -> "masdar".',
    'Left page columns, read right to left: اسم الفاعل (active participle) -> "activeParticiple", اسم المفعول (passive participle) -> "passiveParticiple", الجملة/المعنى (English meaning, usually "To ...") -> "meaning".',
    'اسم الفاعل and اسم المفعول may be empty across the whole spread; that is valid, use null.',
    'When two verbal nouns share the المصدر cell (for example احتياج/حاجة), keep the full string in "masdar".',
  ].join('\n'),
  phrases: [
    'Each row is one Arabic phrase with its English meaning.',
    'The Arabic phrase goes into "arabic" and the English translation into "meaning".',
  ].join('\n'),
};

const PARSE_RULES = [
  'Rules:',
  '- Copy the Arabic EXACTLY as handwritten, preserving every haraka (diacritic mark) character for character. Never normalize spelling or add or remove diacritics.',
  '- A blank cell or a cell containing only "-" means "not applicable": use null for that field. It is never an error.',
  '- "meaning" is the English meaning of the row.',
  '- Handwritten "LESSON N" markers appear BETWEEN rows, often mid page. Report each one in lessonMarkers with beforeRow set to the index of the first data row at or after the marker, and name as written (for example "LESSON 10"). Markers are not rows themselves.',
  '- A margin annotation next to a row (for example a note about a mistake in the book) goes into that row\'s "note". Otherwise "note" is null.',
  '- A light "AndalusInstitute.com" watermark crosses the page. Ignore it completely; it is not content.',
  '- Put anything you are unsure about (an unreadable cell, ambiguous harakat, an uncertain row merge) into "warnings" as short English strings.',
  '- Emit rows in top to bottom order starting at index 0. Include every row that has any handwriting; skip rows that are completely empty.',
].join('\n');

function buildInstruction(kind: ScanKind, pageCount: number): string {
  const merge =
    pageCount === 2
      ? 'The two photos are the RIGHT page and the LEFT page of one workbook spread. The table rows continue across the spread: physical row N on the right page and physical row N on the left page are the SAME row. Merge them by row index, right page columns first, then left page columns.'
      : 'The single photo is one workbook page.';
  return [
    'You are transcribing a photographed page of a handwritten Arabic vocabulary workbook (Andalus Institute). The answers are handwritten with full harakat over a printed table grid.',
    merge,
    COLUMN_GUIDES[kind],
    PARSE_RULES,
    `Call the ${TOOL_NAME} tool exactly once with the complete result.`,
  ].join('\n\n');
}

function buildContentBlocks(kind: ScanKind, pages: string[]): unknown[] {
  const blocks: unknown[] = [];
  pages.forEach((data, index) => {
    const label =
      pages.length === 2
        ? index === 0
          ? 'Photo 1 of 2, the RIGHT page of the spread:'
          : 'Photo 2 of 2, the LEFT page of the same spread:'
        : 'The page photo:';
    blocks.push({ type: 'text', text: label });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  });
  blocks.push({ type: 'text', text: buildInstruction(kind, pages.length) });
  return blocks;
}

function mapAnthropicError(status: number, bodyText: string): HttpError {
  if (status === 401 || status === 403) {
    return new HttpError('The AI key was rejected. Update the ANTHROPIC_API_KEY secret.', 500);
  }
  if (status === 429 || status === 529) {
    return new HttpError('The AI service is busy right now. Wait a minute and try again.', 503);
  }
  if (status === 413 || bodyText.includes('request_too_large')) {
    return new HttpError('The page photos are too large to parse. Retake them and try again.', 413);
  }
  return new HttpError(GENERIC_PARSE_ERROR, 502);
}

async function requestParseFromClaude(kind: ScanKind, pages: string[]): Promise<unknown> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new HttpError("AI parsing isn't set up yet. Add the ANTHROPIC_API_KEY secret.", 500);
  }
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;
  const response = await fetchWithTimeout(
    ANTHROPIC_URL,
    {
      method: 'POST',
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
            description: 'Record the structured transcription of the workbook page photos.',
            input_schema: buildToolInputSchema(kind),
          },
        ],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: buildContentBlocks(kind, pages) }],
      }),
    },
    ANTHROPIC_TIMEOUT_MS,
    new HttpError('The AI took too long to read the pages. Try parsing again.', 504),
  );
  const bodyText = await response.text();
  if (!response.ok) {
    console.error('parse-scan: Anthropic error', { status: response.status, body: bodyText });
    throw mapAnthropicError(response.status, bodyText);
  }
  const message = anthropicMessageSchema.safeParse(JSON.parse(bodyText));
  if (!message.success) {
    console.error('parse-scan: unexpected Anthropic response shape', message.error);
    throw new HttpError(GENERIC_PARSE_ERROR, 502);
  }
  for (const block of message.data.content) {
    const toolUse = toolUseBlockSchema.safeParse(block);
    if (toolUse.success) {
      return toolUse.data.input;
    }
  }
  console.error('parse-scan: no tool_use block in Anthropic response');
  throw new HttpError(GENERIC_PARSE_ERROR, 502);
}

/** Forces the exact field keys per kind so the app always sees identical shapes. */
function normalizeParsed(kind: ScanKind, raw: unknown): ParsedScan {
  const validated = parsedScanSchema.safeParse(raw);
  if (!validated.success) {
    console.error('parse-scan: tool output failed contract validation', validated.error);
    throw new HttpError('The AI returned an unexpected result. Try parsing again.', 502);
  }
  if (validated.data.kind !== kind) {
    console.error('parse-scan: kind mismatch', { expected: kind, got: validated.data.kind });
    throw new HttpError('The AI returned an unexpected result. Try parsing again.', 502);
  }
  const keys = PARSED_FIELD_KEYS[kind];
  const rows = validated.data.rows.map((row) => {
    const fields: Record<string, string | null> = {};
    for (const key of keys) {
      fields[key] = row.fields[key] ?? null;
    }
    return { ...row, fields };
  });
  return { ...validated.data, rows };
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
    console.error('parse-scan: client setup failed', error);
    return errorResponse('The server is not configured correctly.', 500);
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return errorResponse('Sign in to parse scans.', 401);
  }

  const body = await req.json().catch(() => null);
  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) {
    return errorResponse('A valid scan id is required.', 400);
  }
  const { scanId } = parsedBody.data;

  const { data: scanRow, error: scanError } = await supabase
    .from('scans')
    .select('id, kind, status, page_paths, parse_started_at')
    .eq('id', scanId)
    .maybeSingle();
  if (scanError) {
    console.error('parse-scan: scan lookup failed', scanError);
    return errorResponse("Couldn't load that scan. Try again.", 500);
  }
  if (!scanRow) {
    return errorResponse('Scan not found.', 404);
  }
  const scan = scanRecordSchema.safeParse(scanRow);
  if (!scan.success) {
    console.error('parse-scan: scan row failed validation', scan.error);
    return errorResponse("Couldn't load that scan. Try again.", 500);
  }
  if (scan.data.status === 'reviewed') {
    return errorResponse('This scan was already reviewed. Its cards are saved.', 409);
  }
  if (scan.data.status === 'parsing' && !isParseStale(scan.data.parse_started_at)) {
    return errorResponse('This scan is already being read. Wait for it to finish.', 409);
  }
  if (scan.data.page_paths.length < 1 || scan.data.page_paths.length > 2) {
    return errorResponse('A scan needs one or two page photos.', 400);
  }

  // Compare-and-swap on the fields read above so two concurrent parse
  // requests fail loudly instead of both calling the AI.
  let claim = supabase
    .from('scans')
    .update({ status: 'parsing', parse_error: null, parse_started_at: new Date().toISOString() })
    .eq('id', scanId)
    .eq('status', scan.data.status);
  claim =
    scan.data.parse_started_at === null
      ? claim.is('parse_started_at', null)
      : claim.eq('parse_started_at', scan.data.parse_started_at);
  const { data: claimed, error: parsingError } = await claim.select('id');
  if (parsingError) {
    console.error('parse-scan: could not mark scan as parsing', parsingError);
    return errorResponse("Couldn't start parsing. Try again.", 500);
  }
  if (claimed === null || claimed.length === 0) {
    return errorResponse('This scan is already being read. Wait for it to finish.', 409);
  }

  try {
    const pages = await downloadPagesAsBase64(supabase, scan.data.page_paths);
    const toolInput = await requestParseFromClaude(scan.data.kind, pages);
    const parsed = normalizeParsed(scan.data.kind, toolInput);
    const { error: saveError } = await supabase
      .from('scans')
      .update({ status: 'parsed', parsed_rows: parsed, parse_error: null })
      .eq('id', scanId);
    if (saveError) {
      console.error('parse-scan: could not save parse result', saveError);
      throw new HttpError("Parsed the pages but couldn't save the result. Try again.", 500);
    }
    return jsonResponse({ parsed });
  } catch (error) {
    const message = error instanceof HttpError ? error.message : GENERIC_PARSE_ERROR;
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) {
      console.error('parse-scan: unexpected failure', error);
    }
    const { error: failError } = await supabase
      .from('scans')
      .update({ status: 'failed', parse_error: message })
      .eq('id', scanId);
    if (failError) {
      console.error('parse-scan: could not record failure', failError);
    }
    return errorResponse(message, status);
  }
});
