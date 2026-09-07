import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts';
import { idCol, syncCols } from './_common';

/** Income/expense categories, scoped per account. */
export const categories = sqliteTable(
  'categories',
  {
    id: idCol(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    name: text('name').notNull(),
    /** Icon key (e.g. SF Symbol name). */
    icon: text('icon').notNull().default('tag'),
    color: text('color'),
    kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...syncCols,
  },
  (t) => [index('categories_account_idx').on(t.accountId)],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
