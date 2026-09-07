import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '../client';
import { contacts, entries, transactions } from '../schema';

/**
 * Contacts (cari) for an account, each with its running balance.
 * Balance = openingBalance + SUM(contact entries). Positive = they owe us.
 */
export function contactsWithBalanceQuery(accountId: string) {
  const movement = sql<number>`COALESCE(SUM(CASE WHEN ${entries.deletedAt} IS NULL AND ${entries.ledgerType} = 'contact' THEN ${entries.amount} ELSE 0 END), 0)`;
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      phone: contacts.phone,
      openingBalance: contacts.openingBalance,
      paymentTermDays: contacts.paymentTermDays,
      balance: sql<number>`${contacts.openingBalance} + ${movement}`,
    })
    .from(contacts)
    .leftJoin(entries, eq(entries.contactId, contacts.id))
    .where(and(eq(contacts.accountId, accountId), isNull(contacts.deletedAt)))
    .groupBy(contacts.id)
    .orderBy(asc(contacts.name));
}

/**
 * Every contact movement in the account, oldest first — one query instead of one
 * per contact, so the Cariler list can work out who is overdue without N reads.
 * Group by `contactId` and feed each group to `outstandingLots`.
 */
export function accountContactMovementsQuery(accountId: string) {
  return db
    .select({
      contactId: entries.contactId,
      txDate: entries.txDate,
      contactAmount: entries.amount,
    })
    .from(entries)
    .where(
      and(
        eq(entries.accountId, accountId),
        eq(entries.ledgerType, 'contact'),
        isNull(entries.deletedAt),
      ),
    )
    .orderBy(asc(entries.txDate), asc(entries.createdAt));
}

/** A single contact record. */
export function contactQuery(contactId: string) {
  return db.select().from(contacts).where(eq(contacts.id, contactId));
}

/**
 * A contact's statement — every movement with them, oldest first. The running
 * balance is accumulated in code starting from the contact's openingBalance
 * (see buildStatement).
 */
export function contactStatementQuery(contactId: string) {
  return db
    .select({
      id: transactions.id,
      txDate: transactions.txDate,
      description: transactions.description,
      direction: transactions.direction,
      amount: transactions.amount,
      createdAt: transactions.createdAt,
      /** Signed effect on the contact balance (from the contact posting). */
      contactAmount: entries.amount,
    })
    .from(entries)
    .innerJoin(transactions, eq(transactions.id, entries.transactionId))
    .where(
      and(
        eq(entries.contactId, contactId),
        eq(entries.ledgerType, 'contact'),
        isNull(entries.deletedAt),
      ),
    )
    .orderBy(asc(transactions.txDate), asc(transactions.createdAt));
}

export type StatementRow = Awaited<ReturnType<typeof contactStatementQuery>>[number];

export interface StatementLine extends StatementRow {
  /** Running balance after this line. Positive = they owe us. */
  running: number;
}

/** Accumulate the running balance across statement rows. */
export function buildStatement(openingBalance: number, rows: StatementRow[]): StatementLine[] {
  let running = openingBalance;
  return rows.map((r) => {
    running += r.contactAmount;
    return { ...r, running };
  });
}
