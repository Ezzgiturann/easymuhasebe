import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '../client';
import { categories, contacts, transactions } from '../schema';

/** Flat, newest-first transaction rows for an account, with category icon/name
 *  and contact name joined in. Grouped into day sections by `groupByDay`.
 *
 *  `note` rides along only because search matches on it; the list never renders it. */
export function accountTransactionsQuery(accountId: string) {
  return db
    .select({
      id: transactions.id,
      txDate: transactions.txDate,
      kind: transactions.kind,
      direction: transactions.direction,
      amount: transactions.amount,
      kasaType: transactions.kasaType,
      toKasaType: transactions.toKasaType,
      /** Carried so the list can be filtered by category without a second query. */
      categoryId: transactions.categoryId,
      description: transactions.description,
      note: transactions.note,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      contactName: contacts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(contacts, eq(contacts.id, transactions.contactId))
    .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.txDate), desc(transactions.createdAt));
}

export type TransactionRow = Awaited<ReturnType<typeof accountTransactionsQuery>>[number];

/** Re-exported so screens keep importing their list plumbing from one module. */
export { groupByDay } from './group-by-day';
export type { DaySection } from './group-by-day';

/**
 * One transaction with everything the detail screen and the edit form need —
 * including `note` and `receiptUri`, which the list query deliberately omits.
 * Ids come along too so the edit form can prefill its pickers.
 */
export function transactionQuery(id: string) {
  return db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      txDate: transactions.txDate,
      kind: transactions.kind,
      direction: transactions.direction,
      amount: transactions.amount,
      kasaType: transactions.kasaType,
      toKasaType: transactions.toKasaType,
      categoryId: transactions.categoryId,
      contactId: transactions.contactId,
      description: transactions.description,
      note: transactions.note,
      receiptUri: transactions.receiptUri,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      contactName: contacts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(contacts, eq(contacts.id, transactions.contactId))
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)));
}

export type TransactionDetail = Awaited<ReturnType<typeof transactionQuery>>[number];

/** The last transaction on an account — source of the "last used" kasa/category
 *  defaults for the entry keypad. */
export function lastTransactionQuery(accountId: string) {
  return db
    .select({
      kasaType: transactions.kasaType,
      categoryId: transactions.categoryId,
      /** So the entry form opens on the direction the user last used. */
      direction: transactions.direction,
      kind: transactions.kind,
    })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.createdAt))
    .limit(1);
}
