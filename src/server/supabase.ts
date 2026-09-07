import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { secureStorage } from './secure-storage';

/**
 * The one connection to our backend.
 *
 * Auth uses it today; the sync engine will use the same client tomorrow, which
 * is why it lives here rather than inside `auth/`.
 *
 * Both values below ship inside the app bundle on purpose. The URL is an
 * address, and the anon key is a public identifier — it says "this request comes
 * from our app", not "this request may do anything". What a request is allowed
 * to touch is decided by Row Level Security in the database, using the signed-in
 * user's token, never by this key.
 */

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';


export const supabase = createClient(url, anonKey, {
  auth: {
    // The session lives in the Keychain, chunked — see secure-storage.ts.
    storage: secureStorage,
    persistSession: true,
    autoRefreshToken: true,
    // A browser reads the session out of the page URL after an OAuth redirect.
    // There is no URL here, and leaving this on makes the client wait for one.
    detectSessionInUrl: false,
  },
});

/**
 * Access tokens expire in about an hour and the client renews them on a timer —
 * but a timer does not run while the app is in the background. Without this,
 * coming back to a backgrounded app means the first request goes out with a
 * stale token.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
