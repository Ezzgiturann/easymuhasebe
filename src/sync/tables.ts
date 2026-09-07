/**
 * Which tables travel, in which order, and how their columns differ between the
 * phone and the server.
 *
 * The order is a foreign-key order, not a preference: a transaction cannot land
 * on the server before the account it belongs to exists there, and an entry
 * cannot land before its transaction. Push walks this list forwards. Pull walks
 * it forwards too, for the same reason.
 */

export interface SyncTable {
  /** Same name on both sides — the local schema is already snake_case. */
  readonly name: string;
  /** Columns that exist on the phone but must never be sent. */
  readonly localOnly: readonly string[];
  /** Stored as 0/1 in SQLite, boolean in Postgres. */
  readonly booleans: readonly string[];
  /**
   * Columns Postgres types as `uuid`. SQLite accepts any text, so rows written
   * before accounts existed can hold things like 'local-user' here — sent as-is
   * they fail the whole batch with a type error.
   */
  readonly uuids: readonly string[];
}

const AUDIT_UUIDS = ['id', 'created_by', 'updated_by', 'device_id'] as const;

export const SYNC_TABLES: readonly SyncTable[] = [
  {
    name: 'accounts',
    // The cached balance is derived from the transactions and recomputed locally
    // after every pull. Sending it would let two phones that each recorded a sale
    // offline merge into one wrong number.
    localOnly: ['cached_balance'],
    booleans: ['is_shared'],
    uuids: [...AUDIT_UUIDS, 'owner_user_id'],
  },
  {
    name: 'categories',
    localOnly: [],
    booleans: [],
    uuids: [...AUDIT_UUIDS, 'account_id'],
  },
  {
    name: 'contacts',
    localOnly: [],
    booleans: [],
    uuids: [...AUDIT_UUIDS, 'account_id'],
  },
  {
    name: 'transactions',
    localOnly: [],
    booleans: [],
    uuids: [...AUDIT_UUIDS, 'account_id', 'category_id', 'contact_id'],
  },
  {
    name: 'entries',
    localOnly: [],
    booleans: [],
    uuids: [...AUDIT_UUIDS, 'account_id', 'transaction_id', 'category_id', 'contact_id'],
  },
  {
    name: 'account_members',
    localOnly: [],
    booleans: [],
    uuids: [...AUDIT_UUIDS, 'account_id', 'user_id', 'invited_by'],
  },
];

/*
 * Absent on purpose:
 *
 * - `users` — the server's identity is `auth.users`; the local table is a profile
 *   cache for a display name.
 * - `description_suggestions` — rebuilt from the transactions after a pull. It
 *   holds `use_count`, an incrementing counter: two phones each adding 1 offline
 *   cannot be merged by picking a winner, since the answer is 2.
 */
