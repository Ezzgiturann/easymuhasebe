import AsyncStorage from '@react-native-async-storage/async-storage';

import { newId } from './ids';

/**
 * "Which installation am I", readable synchronously.
 *
 * Every row records the device that last wrote it. Two reasons, both about sync:
 * it is the tiebreak when the same row is edited on two phones within the same
 * millisecond and `updatedAt` cannot decide, and it is what lets the sync engine
 * skip its own echo — a row this device just pushed coming back down is not news.
 *
 * Deliberately not the hardware id. `expo-application` can supply one, but it is
 * async, changes on reinstall anyway, and identifies the phone rather than the
 * install — a value we generate ourselves is honest about being neither.
 */

const KEY = 'device.id';

let deviceId: string | null = null;

/**
 * Reads the id, minting one on first run. Called once at startup, before any
 * screen can write a row — the mutation layer is synchronous and cannot await.
 */
export async function loadDeviceId(): Promise<void> {
  if (deviceId) return;

  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(KEY);
  } catch {
    // Unreadable storage is not worth blocking the app for; a session-only id
    // still tiebreaks correctly within this run.
  }

  if (stored) {
    deviceId = stored;
    return;
  }

  // UUID v7 like every other id here: time-ordered, and two phones offline still
  // never mint the same one.
  const fresh = newId();
  deviceId = fresh;
  try {
    await AsyncStorage.setItem(KEY, fresh);
  } catch {
    // Same as above — this run works, the next one mints a new id. That costs an
    // extra tiebreak identity, not correctness.
  }
}

/** Null only before `loadDeviceId` has run. */
export function getDeviceId(): string | null {
  return deviceId;
}
