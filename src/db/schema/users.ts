import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { idCol, syncCols } from './_common';

/**
 * STUB for the future auth/sync phase. Present now so `createdBy`/`updatedBy`
 * on every table have a target and the schema is ready for Supabase.
 */
export const users = sqliteTable('users', {
  id: idCol(),
  displayName: text('display_name'),
  phone: text('phone'),
  email: text('email'),
  ...syncCols,
});

export type User = typeof users.$inferSelect;
