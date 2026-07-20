import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Builds a client that forwards the caller's JWT, so every database and
 * storage call runs under that user's RLS policies. The functions never use
 * the service role key; ownership comes from auth.getUser(), not the body.
 */
export function clientFromRequest(req: Request): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are not configured');
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
