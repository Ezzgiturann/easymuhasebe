import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

/**
 * `enableChangeListener: true` is what makes `useLiveQuery` reactive across
 * screens — without it, screens won't refresh after a write.
 */
export const sqlite = openDatabaseSync('easymuhasebe.db', {
  enableChangeListener: true,
});

// Better durability under concurrent reads/writes.
sqlite.execSync('PRAGMA journal_mode = WAL;');
// FK integrity is enforced in code (soft-delete + LWW would fight cascades),
// so we intentionally leave `PRAGMA foreign_keys` at its default (off).

export const db = drizzle(sqlite, { schema });

export type DB = typeof db;
