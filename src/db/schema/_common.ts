import { integer, text } from 'drizzle-orm/sqlite-core';

/**
 * UUID v7 primary key, generated on-device (see db/ids.ts). Time-ordered so rows
 * sort chronologically by id and last-write-wins tie-breaks stay deterministic.
 *
 * The id is supplied by the mutation layer (via `newId()`), not a schema-level
 * `$defaultFn`, so the schema module graph stays free of native imports and
 * drizzle-kit can bundle it under Node.
 */
export const idCol = () => text('id').primaryKey();

/**
 * Sync + audit + soft-delete columns present on EVERY table.
 *
 * Timestamps are epoch-ms integers (timezone-safe, good for last-write-wins).
 * Nothing is ever physically deleted — `deletedAt` is set instead, so in a
 * shared account one person's delete never silently vanishes for the others.
 */
export const syncCols = {
  /** Epoch-ms row creation time. */
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
  /** Epoch-ms of last write. This is the last-write-wins clock for sync. */
  updatedAt: integer('updated_at')
    .notNull()
    .$defaultFn(() => Date.now()),
  /** users.id of the creator (nullable in the local-only phase). */
  createdBy: text('created_by'),
  /** users.id of the last writer. */
  updatedBy: text('updated_by'),
  /** Installation id of the last writer (audit + LWW tiebreak). */
  deviceId: text('device_id'),
  /** Epoch-ms soft-delete marker. NULL = live row. Never DELETE physically. */
  deletedAt: integer('deleted_at'),
};
