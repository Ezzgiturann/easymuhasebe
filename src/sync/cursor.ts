import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * How far each table has been synced.
 *
 * Two marks per table, and they are genuinely different questions:
 *
 *   pulled — the newest `updated_at` we have taken from the server
 *   pushed — the newest `updated_at` we have sent to it
 *
 * Sharing one number would mean every row the server sent us looks like a local
 * change on the next pass and gets pushed straight back.
 *
 * Losing this file costs a slow sync, not data: both marks fall back to 0, the
 * whole ledger is exchanged again, and last-write-wins produces the same result.
 * That is why it lives in AsyncStorage rather than in the database.
 */

/**
 * Keyed by user. Two people signing into the same phone each keep their own mark:
 * sharing one would let the second person's first sync start from wherever the
 * first person's had reached, and every row older than that would never be asked
 * for — their ledger would arrive with holes in it.
 */
const key = (userId: string) => `sync.cursor.v1.${userId}`;

export interface Marks {
  pulled: number;
  pushed: number;
}

export type Cursor = Record<string, Marks>;

const EMPTY: Marks = { pulled: 0, pushed: 0 };

export async function readCursor(userId: string): Promise<Cursor> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as Cursor) : {};
  } catch {
    // Unreadable or corrupt: start over rather than refuse to sync.
    return {};
  }
}

export function marksFor(cursor: Cursor, table: string): Marks {
  return cursor[table] ?? EMPTY;
}

export async function writeCursor(userId: string, cursor: Cursor): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(cursor));
  } catch {
    // Same trade as above — a lost mark means redundant work next time.
  }
}

/**
 * Forget everything, so the next sync re-reads the whole ledger.
 *
 * Needed after joining someone else's account: their rows were written long
 * before our mark, so an incremental pull would never ask for them. Re-reading
 * everything once is the cheap, obviously-correct answer.
 */
export async function resetCursor(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId));
  } catch {
    /* nothing to undo */
  }
}
