import type { SyncTable } from './tables';

/**
 * Translating a row between SQLite's types and Postgres's.
 *
 * The two schemas share their column names, so this is not a mapping layer — it
 * is a short list of places where the same value is spelled differently, plus one
 * guard. Everything else passes through untouched, which is deliberate: a
 * hand-written field list would silently drop any column added later.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rows come off SQLite as plain objects with unknown-typed values. */
export type Row = Record<string, unknown>;

/**
 * Phone → server.
 *
 * Drops the columns that never travel, turns SQLite's 0/1 into booleans, and
 * blanks anything sitting in a `uuid` column that is not one. That last guard is
 * not theoretical: invites written before accounts existed carry the literal
 * text 'local-user' in `invited_by`, and Postgres rejects the whole batch — not
 * just the bad row — when it meets one. Blanking loses a fact nobody can use
 * anyway; failing loses the entire push.
 */
export function toServer(row: Row, table: SyncTable): Row {
  const out: Row = {};

  for (const [key, value] of Object.entries(row)) {
    if (table.localOnly.includes(key)) continue;

    if (table.booleans.includes(key)) {
      out[key] = value === 1 || value === true;
      continue;
    }

    if (table.uuids.includes(key)) {
      out[key] = typeof value === 'string' && UUID.test(value) ? value : null;
      continue;
    }

    out[key] = value;
  }

  return out;
}

/**
 * Server → phone.
 *
 * Booleans become 0/1 again. The columns the server does not have are simply
 * absent from the object, so the caller's UPSERT leaves the local values alone —
 * which is exactly what `cached_balance` needs.
 */
export function toLocal(row: Row, table: SyncTable): Row {
  const out: Row = {};

  for (const [key, value] of Object.entries(row)) {
    if (table.localOnly.includes(key)) continue;
    out[key] = table.booleans.includes(key) ? (value ? 1 : 0) : value;
  }

  return out;
}

/**
 * The id of the row's owning account, for rows we are not allowed to push.
 *
 * A row whose `account_id` is not a uuid, or whose account was never claimed by
 * a signed-in user, would be rejected by Row Level Security. Catching it here
 * turns a failed batch into a skipped row.
 */
export function isPushable(row: Row, table: SyncTable): boolean {
  if (table.name === 'accounts') {
    return typeof row.owner_user_id === 'string' && UUID.test(row.owner_user_id);
  }
  return typeof row.account_id === 'string' && UUID.test(row.account_id);
}
