import { isAuthRetryableFetchError, type AuthError, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const NETWORK_ERROR_MESSAGE = "Couldn't reach the server. Check your connection and try again.";
const ACCOUNT_EXISTS_MESSAGE = 'An account with this email already exists. Try signing in.';

function describeAuthError(error: AuthError): string {
  if (isAuthRetryableFetchError(error)) {
    return NETWORK_ERROR_MESSAGE;
  }
  switch (error.code) {
    case 'invalid_credentials':
      return 'Wrong email or password. Please try again.';
    case 'email_not_confirmed':
      return 'Please confirm your email first. Check your inbox for the link.';
    case 'user_already_exists':
    case 'email_exists':
      return ACCOUNT_EXISTS_MESSAGE;
    case 'weak_password':
      return 'That password is too weak. Try a longer one.';
    case 'email_address_invalid':
      return "That email address doesn't look right. Double-check it.";
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Wait a moment and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function useSession(): { session: Session | null; initializing: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  // Without config there is nothing to wait for; start settled to avoid a sync setState.
  const [initializing, setInitializing] = useState(() => isSupabaseConfigured());

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }
    let active = true;
    const supabase = getSupabase();
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session);
          setInitializing(false);
        }
      })
      .catch(() => {
        if (active) {
          setSession(null);
          setInitializing(false);
        }
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setInitializing(false);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, initializing };
}

export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  const { error } = await getSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error !== null) {
    return describeAuthError(error);
  }
  return null;
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<{ error: string | null; needsEmailConfirmation: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim(),
    password,
  });
  if (error !== null) {
    return { error: describeAuthError(error), needsEmailConfirmation: false };
  }
  // With email confirmation on, signing up an existing confirmed user returns
  // an obfuscated user with no identities instead of an error.
  if (data.user !== null && (data.user.identities?.length ?? 0) === 0) {
    return { error: ACCOUNT_EXISTS_MESSAGE, needsEmailConfirmation: false };
  }
  return { error: null, needsEmailConfirmation: data.session === null };
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error !== null && error.code !== 'session_not_found') {
    throw new Error(describeAuthError(error));
  }
}
