import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts';
import { idCol, syncCols } from './_common';

/**
 * Cari — a person the user does business with (the digital "veresiye defteri").
 * Each carries a running balance: who owes the user, whom the user owes.
 */
export const contacts = sqliteTable(
  'contacts',
  {
    id: idCol(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    name: text('name').notNull(),
    /** Phone number, used to send the statement over WhatsApp. */
    phone: text('phone'),
    note: text('note'),
    /** Signed kuruş opening balance. Positive = the contact owes us. */
    openingBalance: integer('opening_balance').notNull().default(0),
    /**
     * How many days after a veresiye this contact is expected to pay ("Ahmet ay
     * sonu öder" → 30). Null means no agreed term, so nothing is ever overdue
     * for them. Kept per-contact rather than per-transaction because that is how
     * the arrangement actually works between an esnaf and a regular.
     */
    paymentTermDays: integer('payment_term_days'),
    ...syncCols,
  },
  (t) => [index('contacts_account_idx').on(t.accountId)],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
