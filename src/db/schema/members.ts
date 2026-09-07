import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts';
import { idCol, syncCols } from './_common';

/**
 * Sharing: an account can be shared with a few people (editor = full edit,
 * viewer = read-only). A pending invite has no `userId` yet — it carries the
 * invitee's `phone`/`displayName` until they join (which activates with the
 * Supabase backend). Rows here already match the future RLS model.
 */
export const accountMembers = sqliteTable(
  'account_members',
  {
    id: idCol(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    /** users.id once the invitee joins; null while the invite is pending. */
    userId: text('user_id'),
    /** Invitee contact info for a pending invite. */
    phone: text('phone'),
    displayName: text('display_name'),
    role: text('role', { enum: ['owner', 'editor', 'viewer'] })
      .notNull()
      .default('viewer'),
    status: text('status', { enum: ['pending', 'active', 'revoked'] })
      .notNull()
      .default('pending'),
    invitedBy: text('invited_by'),
    ...syncCols,
  },
  (t) => [index('members_account_idx').on(t.accountId)],
);

export type AccountMember = typeof accountMembers.$inferSelect;
