import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts';
import { categories } from './categories';
import { contacts } from './contacts';
import { transactions, KASA_TYPES } from './transactions';
import { idCol, syncCols } from './_common';

/** Which double-entry bucket a posting hits. */
export const LEDGER_TYPES = ['kasa', 'category', 'contact'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

/**
 * Double-entry postings — the ledger lines. The user NEVER sees these.
 *
 * One `transactions` row fans out into (usually two) `entries` whose signed
 * `amount` sums to exactly 0. That zero-sum is the consistency guarantee:
 * money never appears from nowhere or silently vanishes.
 *
 * Sign convention (kuruş): kasa '+' = cash increased; contact '+' = the contact
 * owes us more; category is whatever balances the transaction to 0.
 */
export const entries = sqliteTable(
  'entries',
  {
    id: idCol(),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id),
    /** Denormalized scope (RLS + fast per-account balance sums). */
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    /** Denormalized so reports aggregate without joining transactions. */
    txDate: text('tx_date').notNull(),
    ledgerType: text('ledger_type', { enum: LEDGER_TYPES }).notNull(),
    /** Set iff ledgerType = 'kasa'. */
    kasaType: text('kasa_type', { enum: KASA_TYPES }),
    /** Set iff ledgerType = 'category'. */
    categoryId: text('category_id').references(() => categories.id),
    /** Set iff ledgerType = 'contact'. */
    contactId: text('contact_id').references(() => contacts.id),
    /** SIGNED kuruş. Invariant: SUM(amount) per transactionId = 0. */
    amount: integer('amount').notNull(),
    ...syncCols,
  },
  (t) => [
    index('entries_tx_idx').on(t.transactionId),
    index('entries_kasa_idx').on(t.accountId, t.ledgerType, t.kasaType),
    index('entries_contact_idx').on(t.contactId),
    index('entries_category_idx').on(t.categoryId, t.txDate),
  ],
);

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
