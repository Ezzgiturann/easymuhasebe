/**
 * Whole-database export and restore.
 *
 * The ledger lives only on this device until the sync phase ships, so a lost or
 * broken phone loses everything. This is the stopgap: a single JSON file the
 * user can send to themselves over WhatsApp, AirDrop, or e-mail.
 *
 * Soft-deleted rows are included on purpose — `deletedAt` is part of the
 * last-write-wins model, and dropping them would resurrect deleted records if a
 * backup were ever merged into a synced device.
 */

import { sql } from 'drizzle-orm';

import { db } from './client';
import {
  accountMembers,
  accounts,
  categories,
  contacts,
  descriptionSuggestions,
  entries,
  transactions,
  users,
} from './schema';

/** Bumped only when the file layout changes in a way older code can't read. */
export const BACKUP_VERSION = 1;

/**
 * Restore order matters: parents before children, because a child row referencing
 * a missing parent would be silently orphaned. Export uses the same order so the
 * file reads top-down.
 */
const TABLES = [
  { key: 'users', table: users },
  { key: 'accounts', table: accounts },
  { key: 'categories', table: categories },
  { key: 'contacts', table: contacts },
  { key: 'account_members', table: accountMembers },
  { key: 'transactions', table: transactions },
  { key: 'entries', table: entries },
  { key: 'description_suggestions', table: descriptionSuggestions },
] as const;

export interface BackupFile {
  format: 'easyhesap-backup';
  version: number;
  exportedAt: string;
  /** Row counts, so a restore can report what it read without walking the data. */
  counts: Record<string, number>;
  data: Record<string, Record<string, unknown>[]>;
}

/** Read every table into a plain object ready to be JSON-stringified. */
export function exportBackup(): BackupFile {
  const data: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};

  for (const { key, table } of TABLES) {
    const rows = db.select().from(table).all() as Record<string, unknown>[];
    data[key] = rows;
    counts[key] = rows.length;
  }

  return {
    format: 'easyhesap-backup',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts,
    data,
  };
}

export class BackupError extends Error {}

/**
 * Validate a parsed JSON blob as a backup file. Throws `BackupError` with a
 * message worth showing the user — a wrong file picked by accident is the most
 * likely failure, not corruption.
 */
export function parseBackup(raw: unknown): BackupFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new BackupError('Dosya okunamadı, geçerli bir yedek değil.');
  }
  const file = raw as Partial<BackupFile>;

  if (file.format !== 'easyhesap-backup') {
    throw new BackupError('Bu dosya bir easy hesap yedeği değil.');
  }
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    throw new BackupError(
      `Yedek sürümü (${file.version}) bu uygulamadan yeni. Uygulamayı güncelle.`,
    );
  }
  if (typeof file.data !== 'object' || file.data === null) {
    throw new BackupError('Yedek dosyasında veri bölümü yok.');
  }

  for (const { key } of TABLES) {
    const rows = (file.data as Record<string, unknown>)[key];
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new BackupError(`Yedekteki "${key}" bölümü bozuk.`);
    }
  }

  return file as BackupFile;
}

export interface RestoreResult {
  /** Rows written per table. */
  counts: Record<string, number>;
  total: number;
}

/**
 * REPLACE the local database with the backup's contents.
 *
 * Everything runs in one SQLite transaction: either the whole restore lands or
 * the old data is left untouched. A half-applied restore would be worse than no
 * restore at all — it would balance nothing and lose the original.
 */
export function restoreBackup(file: BackupFile): RestoreResult {
  const counts: Record<string, number> = {};
  let total = 0;

  try {
    db.transaction((tx) => {
      // Children first on the way out — the mirror of the insert order.
      for (const { table } of [...TABLES].reverse()) {
        tx.delete(table).run();
      }

      for (const { key, table } of TABLES) {
        const rows = (file.data[key] ?? []) as Record<string, unknown>[];
        counts[key] = rows.length;
        total += rows.length;
        // Chunked: SQLite caps variables per statement, and a busy shop's `entries`
        // table can run to thousands of rows.
        for (let i = 0; i < rows.length; i += 100) {
          const chunk = rows.slice(i, i + 100);
          if (chunk.length > 0) tx.insert(table).values(chunk as never).run();
        }
      }
    });
  } catch (e) {
    // The transaction rolled back, so the old data is still intact — say so, or
    // the user will assume they just lost everything.
    const detail = e instanceof Error ? e.message : String(e);
    throw new BackupError(
      `Yedek yazılamadı, mevcut verin olduğu gibi duruyor.\n\nSebep: ${detail}`,
    );
  }

  // The cached kasa balances came straight from the file, but a backup taken
  // mid-write (or hand-edited) could disagree with the postings. Recompute so
  // the home screen can't show a total the ledger doesn't support.
  recomputeCachedBalances();

  return { counts, total };
}

/**
 * Re-derive `accounts.cachedBalance` from what actually backs it: the opening
 * balance plus every kasa posting. Leaving the opening out would quietly drop it
 * from the balance on the first restore.
 */
export function recomputeCachedBalances(): void {
  db.run(sql`
    UPDATE accounts SET cached_balance = opening_balance + COALESCE((
      SELECT SUM(amount) FROM entries
      WHERE entries.account_id = accounts.id
        AND entries.ledger_type = 'kasa'
        AND entries.deleted_at IS NULL
    ), 0)
  `);
}

