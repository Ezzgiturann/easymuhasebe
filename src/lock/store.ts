/**
 * Storing and checking the screen-lock PIN, plus the biometric prompt.
 *
 * Lives apart from `src/auth/` on purpose. That folder answers "who are you to
 * the server"; this one answers "may this phone be opened right now". Different
 * questions, different lifetimes — the PIN survives a sign-out, and a session
 * survives the phone being locked.
 *
 * The only file here that touches SecureStore or the biometric API; the rules
 * live in `pin.ts`, which stays testable.
 */

import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import { hashesMatch } from './hashing';
import { isStoredPin, type StoredPin } from './pin';

const PIN_KEY = 'lock.pin';
const BIOMETRIC_KEY = 'lock.biometric';

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

async function readStoredPin(): Promise<StoredPin | null> {
  const raw = await SecureStore.getItemAsync(PIN_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredPin(parsed) ? parsed : null;
  } catch {
    // Unparseable means the lock is unusable. Reporting "no PIN" leaves the
    // owner able to get in and set a new one; the alternative is a permanent
    // lockout with the data still on the device.
    return null;
  }
}

/** True once a PIN has been set. */
export async function isLockEnabled(): Promise<boolean> {
  return (await readStoredPin()) !== null;
}

/** Store a new PIN. Caller must have run `pinRejectionReason` first. */
export async function setPin(pin: string): Promise<void> {
  const salt = Crypto.randomUUID();
  const hash = await hashPin(pin, salt);
  await SecureStore.setItemAsync(PIN_KEY, JSON.stringify({ salt, hash } satisfies StoredPin));
}

/** Check an entered PIN against the stored one. */
export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await readStoredPin();
  if (!stored) return false;
  return hashesMatch(await hashPin(pin, stored.salt), stored.hash);
}

/** Turn the lock off entirely, biometrics with it. */
export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
}

/** Whether this device has biometrics that are actually set up. */
export async function biometricAvailable(): Promise<boolean> {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === '1';
}

/** Biometrics only ever supplement the PIN, so this is a no-op without one. */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync(BIOMETRIC_KEY, '1');
  else await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
}

/**
 * Prompt for a fingerprint / face.
 *
 * NOTE: Face ID does not work inside Expo Go on iOS (the module ships, the
 * prompt does not). It fails cleanly and returns false, which is why the PIN
 * keypad stays on screen behind this — the user is never left with biometrics
 * as their only way in.
 */
export async function promptBiometric(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Uygulamayı aç',
      cancelLabel: 'PIN gir',
      fallbackLabel: 'PIN gir',
    });
    return result.success;
  } catch {
    return false;
  }
}
