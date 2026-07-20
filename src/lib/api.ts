import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { z } from 'zod';

import { parsedScanSchema, type ParsedScan } from '@/domain/parsed-scan';
import { getSupabase } from '@/lib/supabase';

const NETWORK_ERROR_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

const errorPayloadSchema = z.object({ error: z.string().min(1) });

const parseScanResponseSchema = z.object({ parsed: parsedScanSchema });
const generateCardImageResponseSchema = z.object({ path: z.string().min(1) });

/** Edge functions respond `{ error }` with a user-safe message on non-2xx statuses. */
async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  if (!(error instanceof FunctionsHttpError)) {
    return null;
  }
  const context: unknown = error.context;
  const response = context as { json?: () => Promise<unknown> } | null;
  if (!response || typeof response.json !== 'function') {
    return null;
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON error body; the caller falls back to its generic message.
    return null;
  }
  const parsed = errorPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return parsed.data.error;
}

async function invokeEdgeFunction(
  name: string,
  body: Record<string, string>,
  fallbackMessage: string,
): Promise<unknown> {
  const { data, error } = await getSupabase().functions.invoke<unknown>(name, { body });
  if (error !== null && error !== undefined) {
    if (error instanceof FunctionsFetchError) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    const message = await readFunctionErrorMessage(error);
    throw new Error(message ?? fallbackMessage);
  }
  const errorPayload = errorPayloadSchema.safeParse(data);
  if (errorPayload.success) {
    throw new Error(errorPayload.data.error);
  }
  return data;
}

export async function parseScan(scanId: string): Promise<ParsedScan> {
  const fallback = "Couldn't read that page. Please try again.";
  const data = await invokeEdgeFunction('parse-scan', { scanId }, fallback);
  const parsed = parseScanResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(fallback);
  }
  return parsed.data.parsed;
}

export async function generateCardImage(cardId: string): Promise<{ path: string }> {
  const fallback = "Couldn't create an image for this card. Please try again.";
  const data = await invokeEdgeFunction('generate-card-image', { cardId }, fallback);
  const parsed = generateCardImageResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(fallback);
  }
  return { path: parsed.data.path };
}
