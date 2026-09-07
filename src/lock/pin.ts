/**
 * The rules of the screen lock PIN, kept free of storage and crypto so they can
 * be tested without a device.
 *
 * What the PIN is and is not: it stops someone who picks up the unlocked phone
 * from reading the ledger. It is NOT encryption — the SQLite file sits in the
 * app's documents directory, so anyone with filesystem access reads everything
 * regardless. Storing a salted hash rather than the digits is still worth doing
 * (the same four digits are often the phone's own passcode), but it buys
 * obscurity, not secrecy, and the UI must never promise more than that.
 */

export const PIN_LENGTH = 4;

/** Digits only, exactly PIN_LENGTH of them. */
export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/**
 * PINs an attacker guesses first. Refusing them is cheap; a lock whose most
 * common value is "1234" is decoration.
 */
const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '2580']);

export function isWeakPin(pin: string): boolean {
  return WEAK_PINS.has(pin);
}

/** What `setPin` refuses, in the words shown to the user. Null when acceptable. */
export function pinRejectionReason(pin: string): string | null {
  if (!isValidPin(pin)) return `PIN ${PIN_LENGTH} rakam olmalı.`;
  if (isWeakPin(pin)) return 'Bu PIN çok kolay tahmin ediliyor, başka bir tane seç.';
  return null;
}

/** The record kept in secure storage. `hash` is hex of SHA-256 over salt + pin. */
export interface StoredPin {
  salt: string;
  hash: string;
}

/** Shape check for something read back out of storage, which may be anything. */
export function isStoredPin(value: unknown): value is StoredPin {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.salt === 'string' && !!v.salt && typeof v.hash === 'string' && !!v.hash;
}
