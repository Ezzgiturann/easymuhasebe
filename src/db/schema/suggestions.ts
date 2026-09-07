import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts';
import { categories } from './categories';
import { contacts } from './contacts';
import { KASA_TYPES } from './transactions';
import { idCol, syncCols } from './_common';

/**
 * Auto-recognition cache: maps a normalized description to the category/contact/
 * kasa most often used with it. Upserted on every save so prefill is a single
 * indexed read. By the 3rd identical description the user only types the number.
 */
export const descriptionSuggestions = sqliteTable(
  'description_suggestions',
  {
    id: idCol(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    descriptionNorm: text('description_norm').notNull(),
    categoryId: text('category_id').references(() => categories.id),
    contactId: text('contact_id').references(() => contacts.id),
    kasaType: text('kasa_type', { enum: KASA_TYPES }),
    useCount: integer('use_count').notNull().default(1),
    lastUsedAt: integer('last_used_at')
      .notNull()
      .$defaultFn(() => Date.now()),
    ...syncCols,
  },
  (t) => [uniqueIndex('desc_sugg_idx').on(t.accountId, t.descriptionNorm)],
);

export type DescriptionSuggestion = typeof descriptionSuggestions.$inferSelect;
