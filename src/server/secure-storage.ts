import * as SecureStore from 'expo-secure-store';

/**
 * Where the auth session is kept.
 *
 * The session holds a refresh token — a long-lived credential that can mint new
 * access tokens for as long as it is valid. That is the actual key to the
 * account, so it belongs in the Keychain / Keystore, not in AsyncStorage, which
 * is plain unencrypted files.
 *
 * The catch: SecureStore refuses values over 2048 bytes on Android, and a
 * Supabase session comfortably exceeds that once the JWT carries any claims. So
 * values are split into numbered chunks and stitched back together on read.
 * Without this the write fails and the user is silently signed out on every
 * restart — a bug that looks like "the app keeps logging me out" and takes a
 * long time to trace back to a storage limit.
 */

/** Comfortably under the 2048-byte limit, leaving room for key overhead. */
const CHUNK_SIZE = 1800;

const chunkKey = (key: string, i: number) => `${key}.${i}`;
const countKey = (key: string) => `${key}.count`;

/** Remove every chunk of a previously stored value. */
async function clear(key: string): Promise<void> {
  const stored = await SecureStore.getItemAsync(countKey(key));
  const count = stored ? Number(stored) : 0;
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
  await SecureStore.deleteItemAsync(countKey(key));
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const stored = await SecureStore.getItemAsync(countKey(key));
      if (!stored) return null;

      const count = Number(stored);
      if (!Number.isInteger(count) || count <= 0) return null;

      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(chunkKey(key, i));
        // A missing chunk means a half-written value; a truncated session is
        // worse than none, so report nothing and let the user sign in again.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    // Old chunks first: a shorter new value would otherwise leave stale tail
    // chunks behind and the next read would stitch on garbage.
    await clear(key);

    const parts: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      parts.push(value.slice(i, i + CHUNK_SIZE));
    }

    for (let i = 0; i < parts.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), parts[i]);
    }
    await SecureStore.setItemAsync(countKey(key), String(parts.length));
  },

  async removeItem(key: string): Promise<void> {
    await clear(key);
  },
};
