/**
 * The rules of the account e-mail and password, kept free of storage and crypto
 * so they can be tested without a device.
 *
 * Only the rules live here — no storage, no crypto. The password itself is
 * checked by the server (`account.ts`); these are the checks worth doing before
 * a round trip, so a typo does not cost a network call.
 */

export const MIN_PASSWORD_LENGTH = 6;

/** Trimmed and lowercased — "Ahmet@Mail.com" and "ahmet@mail.com " are one account. */
export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US');
}

/**
 * Deliberately loose: something@something.something with no spaces. Rejecting
 * exotic-but-legal addresses would lock people out of their own ledger, and
 * there is no confirmation mail that a stricter rule could protect.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

/** Passwords guessed first. A list this short still covers most real attempts. */
const WEAK_PASSWORDS = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  'password',
  'parola',
  'qwerty',
  'qwe123',
  '111111',
  '000000',
  'sifre123',
  'şifre123',
]);

/** What registration refuses, in the words shown to the user. Null when fine. */
export function passwordRejectionReason(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Parola en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`;
  }
  if (password.trim().length === 0) return 'Parola sadece boşluk olamaz.';
  if (WEAK_PASSWORDS.has(password.toLocaleLowerCase('tr-TR'))) {
    return 'Bu parola çok kolay tahmin ediliyor, başka bir tane seç.';
  }
  if (email && normalizeEmail(password) === normalizeEmail(email)) {
    return 'Parola e-postanla aynı olamaz.';
  }
  return null;
}

