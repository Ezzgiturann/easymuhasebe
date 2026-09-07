/**
 * Who is signed in. The only module that knows where identity comes from.
 *
 * The session is no longer a `'1'` flag in AsyncStorage — it is a real one, kept
 * by the Supabase client in the Keychain, and it carries a **JWT**: a token the
 * server signed. The phone cannot forge one and cannot alter one without
 * breaking the signature, which is what lets the server trust a request without
 * looking anything up.
 *
 * Signing in needs the internet. Staying signed in does not: the token is stored
 * and renewed in the background, so the ledger opens offline exactly as before.
 */

import { supabase } from '@/server/supabase';
import { saveProfile } from '@/db/profile';
import { createAccount, verifyCredentials } from './account';

export { AuthError } from './account';

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  phone: string | null;
}

/** True when a valid session exists on this device. */
export async function readSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session !== null;
}

export interface RegisterResult {
  /** True when the account exists but the address has not been proven yet. */
  needsConfirmation: boolean;
}

/**
 * Create the account and record the profile.
 *
 * Whether this also opens a session depends on a server setting. With e-mail
 * confirmation ON — which it should be, because password reset is delivered by
 * e-mail and an unproven address is an unrecoverable account — `signUp` creates
 * the user but no session, and the caller has to say so rather than leaving a
 * screen that looks like it did nothing.
 */
export async function register({
  displayName,
  email,
  password,
  phone,
}: RegisterInput): Promise<RegisterResult> {
  await createAccount(email, password);

  // Saved either way: the name belongs to this phone, not to the session, and
  // losing it because a mailbox has not been opened yet would be senseless.
  saveProfile({ displayName, phone });

  return { needsConfirmation: !(await readSession()) };
}

/** Check the password and open the session. Throws `AuthError` when it fails. */
export async function signIn(email: string, password: string): Promise<void> {
  await verifyCredentials(email, password);
}

/**
 * End the session.
 *
 * Never touches the ledger. Until sync exists there is no copy of it anywhere
 * else, so deleting on sign-out would destroy the only one — accounts,
 * transactions and cariler all stay exactly where they are.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
