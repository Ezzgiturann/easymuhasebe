/**
 * The owner's account, verified by the server.
 *
 * This file used to hash the password with SHA-256 and keep it in SecureStore,
 * because there was nobody to ask. Its own comment predicted this change:
 * "when the cloud arrives this is the file that changes". It did.
 *
 * What actually moved: the password is now checked by Supabase Auth, which
 * stores it with a real password hashing function (bcrypt) that is deliberately
 * slow — SHA-256 is fast, and fast is exactly wrong for passwords, because fast
 * also means fast to guess billions of them. A same-device check could get away
 * with it; a server holding many people's passwords cannot.
 *
 * The rules about what makes a valid e-mail or password stay in
 * `credentials.ts`, pure and tested. Only the verification moved.
 */

import { supabase } from '@/server/supabase';

/** Anything the user could act on: wrong password, taken e-mail, no signal. */
export class AuthError extends Error {}

/**
 * Turn a Supabase error into Turkish the user can do something with.
 *
 * Deliberately vague on sign-in: saying "no such e-mail" tells whoever is
 * holding the phone which half they got right, and tells a stranger which
 * e-mails have accounts here.
 */
function describe(message: string, kind: 'signIn' | 'signUp' | 'reset'): string {
  const m = message.toLowerCase();

  if (m.includes('invalid login credentials')) return 'E-posta veya parola hatalı.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.';
  }
  if (m.includes('email not confirmed')) {
    return 'E-postanı doğrulaman gerekiyor. Gelen kutuna bak.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Bağlantı kurulamadı. İnternetini kontrol et.';
  }

  if (kind === 'signIn') return 'Giriş yapılamadı. Tekrar dene.';
  if (kind === 'signUp') return 'Hesap oluşturulamadı. Tekrar dene.';
  return 'Parola sıfırlama isteği gönderilemedi.';
}

/**
 * Is there an account for this address?
 *
 * Asked before a reset so the screen can say "no such account" instead of
 * leaving someone waiting for a code that will never arrive — which is exactly
 * what happened, for an hour.
 *
 * The endpoint is unauthenticated by necessity (a person who forgot their
 * password has no session) and rate-limited per IP because of it. This does
 * reveal whether an address is registered — but the sign-up form already says
 * "bu e-posta ile zaten bir hesap var", so the fact was never actually hidden.
 *
 * Returns null when the check itself fails. The caller then falls back to
 * sending the reset anyway: a broken check must not stop a real user from
 * recovering their account.
 */
export async function isEmailRegistered(email: string): Promise<boolean | null> {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey) return null;

  try {
    const response = await fetch(`${url}/functions/v1/email-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No user token exists here; the anon key is what gets us past the
        // platform gate, and the function does its own rate limiting.
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { registered?: unknown };
    return typeof payload.registered === 'boolean' ? payload.registered : null;
  } catch {
    return null;
  }
}

/** Create the account on the server. Caller validates the inputs first. */
export async function createAccount(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new AuthError(describe(error.message, 'signUp'));

  // Var olan bir adresle kayıtta sunucu HATA DÖNDÜRMÜYOR — sahte bir başarı
  // döndürüyor: 200, hata yok, `confirmation_sent_at` damgalı, ama hiçbir posta
  // gitmiyor. Bunu adres tarama saldırısını önlemek için yapıyor.
  //
  // Tek işaret `identities`'in boş gelmesi. Onu okumazsak uygulama "kod
  // gönderildi" der ve kullanıcı hiç gelmeyecek bir kodu bekler — nitekim bekledi.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    throw new AuthError('Bu e-posta ile zaten bir hesap var. "Giriş yap" sekmesinden gir.');
  }
}

/** Check the credentials and open a session. */
export async function verifyCredentials(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new AuthError(describe(error.message, 'signIn'));
}

/**
 * Send a reset link to the address, if an account exists for it.
 *
 * Note what this does NOT do: tell the caller whether the address is registered.
 * Reporting "no such account" would turn this screen into a tool for discovering
 * who has an account here. The user sees the same message either way.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw new AuthError(describe(error.message, 'reset'));
}

/**
 * Prove the code from the sign-up e-mail, which also opens the session.
 *
 * A code rather than a link, for the same reason as the reset: a link has to
 * carry the phone back into the app, and that route is brittle in Expo Go.
 */
export async function confirmSignUp(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'signup',
  });
  if (!error) return;

  const m = error.message.toLowerCase();
  if (m.includes('expired')) throw new AuthError('Kodun süresi dolmuş. Yeni bir kod iste.');
  throw new AuthError('Kod hatalı. E-postandaki kodu kontrol et.');
}

/** Send the confirmation code again, for a code that expired or never arrived. */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
  if (error) throw new AuthError(describe(error.message, 'signUp'));
}

/**
 * Finish a reset: prove the code from the e-mail, then set the new password.
 *
 * Two steps on the wire, one action for the user. `verifyOtp` is what turns
 * "I can read that mailbox" into a session; `updateUser` needs that session to
 * exist, which is why they cannot be reordered.
 */
export async function completePasswordReset(
  email: string,
  code: string,
  password: string,
): Promise<void> {
  const { error: otpError } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'recovery',
  });
  if (otpError) {
    const m = otpError.message.toLowerCase();
    if (m.includes('expired')) throw new AuthError('Kodun süresi dolmuş. Yeni bir kod iste.');
    throw new AuthError('Kod hatalı. E-postandaki kodu kontrol et.');
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new AuthError(describe(error.message, 'reset'));
}

