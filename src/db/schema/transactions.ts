import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts';
import { categories } from './categories';
import { contacts } from './contacts';
import { idCol, syncCols } from './_common';

/** The six things a user can actually do. Debit/credit is never shown. */
export const TX_KINDS = [
  'cash_in', // nakit gelir / cash sale
  'cash_out', // nakit gider / cash expense
  'credit_sale', // veresiye satış — customer owes us
  'credit_purchase', // veresiye alış — we owe supplier
  'collect_customer', // tahsilat — customer pays us
  'pay_supplier', // ödeme — we pay supplier
  'transfer', // kasadan kasaya — money changes pocket, business gains nothing
] as const;
export type TxKind = (typeof TX_KINDS)[number];

export const KASA_TYPES = ['nakit', 'banka', 'kredi_karti'] as const;
export type KasaType = (typeof KASA_TYPES)[number];

/**
 * The ONE record the user sees and edits ("Köfteci Yusuf'a 680 lira verdim").
 * Carries every display field so the list renders with no join to `entries`.
 */
export const transactions = sqliteTable(
  'transactions',
  {
    id: idCol(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    /** 'YYYY-MM-DD' local business day. Stored separately from createdAt so
     *  day-grouping never drifts with timezone. */
    txDate: text('tx_date').notNull(),
    kind: text('kind', { enum: TX_KINDS }).notNull(),
    /** 'in' renders green, 'out' renders red. */
    direction: text('direction', { enum: ['in', 'out'] }).notNull(),
    /** Headline UNSIGNED amount in kuruş. */
    amount: integer('amount').notNull(),
    /** null for a pure veresiye movement that never touches a cash box. */
    kasaType: text('kasa_type', { enum: KASA_TYPES }),
    /** Only set for `transfer`: where the money landed (`kasaType` is where it
     *  left from). Denormalized from the entries so the list can render
     *  "Nakit → Banka" without a join. */
    toKasaType: text('to_kasa_type', { enum: KASA_TYPES }),
    categoryId: text('category_id').references(() => categories.id),
    contactId: text('contact_id').references(() => contacts.id),
    /** "ne için" — free text the user typed. */
    description: text('description'),
    /** Folded key for auto-recognition (see db/normalize.ts). */
    descriptionNorm: text('description_norm'),
    note: text('note'),
    /** Local file URI of an attached receipt photo (in the app documents dir). */
    receiptUri: text('receipt_uri'),
    ...syncCols,
  },
  (t) => [
    index('tx_account_date_idx').on(t.accountId, t.txDate),
    index('tx_contact_idx').on(t.contactId),
    index('tx_desc_idx').on(t.accountId, t.descriptionNorm),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
