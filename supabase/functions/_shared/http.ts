// Permissive CORS: the functions are called from the Expo app (native and web
// dev builds), so any origin is accepted; auth is enforced by verify_jwt + RLS.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

/** An error whose message is safe to show verbatim in the app. */
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * fetch with a hard deadline. An edge function must never await an outbound
 * call indefinitely: if the runtime kills the function mid-request, any
 * status row it set beforehand stays stranded in its transient state. On
 * timeout the given HttpError is thrown so each caller surfaces a message
 * that fits its flow.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutError: HttpError,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      console.error('outbound request timed out', { url, timeoutMs });
      throw timeoutError;
    }
    throw error;
  }
}

/** Returns the CORS preflight response, or null when the request is not OPTIONS. */
export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  return null;
}
