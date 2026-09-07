/**
 * Keeping the conversation across app restarts.
 *
 * Stored in AsyncStorage rather than SQLite on purpose: a chat log is device UI
 * state, not ledger data, and putting it in the database would drag it into
 * every backup file.
 *
 * The rules about WHAT is kept live in `trim-history.ts`, which is pure and
 * therefore testable; this file is only the storage half.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getCurrentUserId } from '@/auth/current-user';

import { isMessage, trimHistory, type Message } from './trim-history';

export { MAX_MESSAGES, trimHistory, type Message } from './trim-history';

/**
 * Keyed by user, not by device.
 *
 * One key per phone meant the next person to sign in opened the assistant and
 * found the previous person's conversation waiting — their questions, their
 * balances, their customers' names. A chat log is UI state, but it is UI state
 * made of somebody's finances.
 *
 * Signed out there is no conversation to read or write at all: `null` is not a
 * user, and a shared fallback key is how this leaked in the first place.
 */
function storageKey(): string | null {
  const userId = getCurrentUserId();
  return userId ? `easyhesap.chatHistory.${userId}` : null;
}

/** Anything unreadable is treated as no history — never as a crash. */
export async function loadHistory(): Promise<Message[]> {
  const key = storageKey();
  if (!key) return [];

  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return trimHistory(parsed.filter(isMessage));
  } catch {
    return [];
  }
}

/**
 * Returns the failure instead of swallowing it. Persistence is something the
 * user can see the absence of, and a silent catch leaves them unable to tell
 * "not saving" from "not implemented".
 */
export async function saveHistory(messages: Message[]): Promise<string | null> {
  const key = storageKey();
  if (!key) return null;

  try {
    await AsyncStorage.setItem(key, JSON.stringify(trimHistory(messages)));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'bilinmeyen hata';
  }
}

export async function clearHistory(): Promise<void> {
  const key = storageKey();
  if (!key) return;

  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Same: the in-memory list is already cleared by the caller.
  }
}
