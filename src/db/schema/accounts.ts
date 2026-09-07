import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { idCol, syncCols } from './_common';
import { KASA_TYPES } from './transactions';

/**
 * The product's "hesap" — a shop, a personal wallet, a partnership. Each is an
 * independent ledger with its own balance, categories and contacts.
 */
export const accounts = sqliteTable(
  'accounts',
  {
    id: idCol(),
    /** users.id of the creator; the row-level-security anchor for the future sync phase. */
    ownerUserId: text('owner_user_id'),
    name: text('name').notNull(),
    /** Hex color shown on the home-screen row. */
    color: text('color').notNull(),
    currency: text('currency').notNull().default('TRY'),
    /** Denormalized kasa total in kuruş, maintained on every write for fast home lists. */
    cachedBalance: integer('cached_balance').notNull().default(0),
    /**
     * "Başlangıç bakiyesi" — what was already on hand when record-keeping
     * started, in kuruş.
     *
     * A column rather than a posting, matching `contacts.openingBalance`: it is a
     * starting state, not a movement. Recording it as a transaction would make
     * the shop's first day read as income and inflate that month's totals — the
     * same mistake a transfer used to cause.
     */
    openingBalance: integer('opening_balance').notNull().default(0),
    /** Which box that money is in. Only meaningful when openingBalance != 0. */
    openingKasaType: text('opening_kasa_type', { enum: KASA_TYPES }),
    /** True once the owner opens the account for sharing — it then lives under
     *  "Paylaşılan Hesaplar" whether or not anyone has joined yet. */
    isShared: integer('is_shared', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...syncCols,
  },
  (t) => [index('accounts_owner_idx').on(t.ownerUserId)],
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
