import { and, between, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '../client';
import { categories, entries } from '../schema';

/**
 * How much is in each cash box right now — the question asked while counting the
 * till at closing time. Sums every kasa posting ever made, so it needs no date
 * range and stays correct even after an edit rewrites old postings.
 *
 * Boxes that were never used are simply absent from the result; the caller
 * decides whether to show a zero row or hide it.
 */
export function kasaBalancesQuery(accountId: string) {
  return db
    .select({
      kasaType: entries.kasaType,
      total: sql<number>`SUM(${entries.amount})`,
    })
    .from(entries)
    .where(
      and(
        eq(entries.accountId, accountId),
        eq(entries.ledgerType, 'kasa'),
        isNull(entries.deletedAt),
      ),
    )
    .groupBy(entries.kasaType);
}

/**
 * Monthly income vs expense totals. Reads ONLY category postings, so settling a
 * debt (which has no category posting) never counts as income/expense.
 * Category amounts are sign-flipped for display (income entries are negative).
 */
export function monthlyTotalsQuery(accountId: string, start: string, end: string) {
  return db
    .select({
      kind: categories.kind,
      total: sql<number>`SUM(CASE WHEN ${categories.kind} = 'income' THEN -${entries.amount} ELSE ${entries.amount} END)`,
    })
    .from(entries)
    .innerJoin(categories, eq(categories.id, entries.categoryId))
    .where(
      and(
        eq(entries.accountId, accountId),
        eq(entries.ledgerType, 'category'),
        between(entries.txDate, start, end),
        isNull(entries.deletedAt),
      ),
    )
    .groupBy(categories.kind);
}

/**
 * Money that actually moved in and out of the cash boxes this month.
 *
 * Separate from `monthlyTotalsQuery` because that one inner-joins categories, so
 * it only counts what was filed under a category. A cash payment to a person
 * carries no category — the app models it as settling that person's balance, not
 * as a new expense — and so it is invisible there.
 *
 * That gap produced a genuinely misleading answer: the till was 745 ₺ lighter and
 * the assistant reported "bu ay hiç harcaman yok", because by its own definition
 * there was none. Both numbers are true and the user needs to see both.
 */
export function monthlyKasaFlowQuery(accountId: string, start: string, end: string) {
  return db
    .select({
      inflow: sql<number>`COALESCE(SUM(CASE WHEN ${entries.amount} > 0 THEN ${entries.amount} ELSE 0 END), 0)`,
      outflow: sql<number>`COALESCE(SUM(CASE WHEN ${entries.amount} < 0 THEN -${entries.amount} ELSE 0 END), 0)`,
    })
    .from(entries)
    .where(
      and(
        eq(entries.accountId, accountId),
        eq(entries.ledgerType, 'kasa'),
        between(entries.txDate, start, end),
        isNull(entries.deletedAt),
      ),
    );
}

/**
 * Category breakdown for a month, biggest first. Pass kind='expense' for the
 * spending breakdown / top-5, or 'income' for the income breakdown.
 */
export function categoryBreakdownQuery(
  accountId: string,
  kind: 'income' | 'expense',
  start: string,
  end: string,
) {
  return db
    .select({
      categoryId: categories.id,
      name: categories.name,
      icon: categories.icon,
      total: sql<number>`SUM(ABS(${entries.amount}))`,
    })
    .from(entries)
    .innerJoin(categories, eq(categories.id, entries.categoryId))
    .where(
      and(
        eq(entries.accountId, accountId),
        eq(entries.ledgerType, 'category'),
        eq(categories.kind, kind),
        between(entries.txDate, start, end),
        isNull(entries.deletedAt),
      ),
    )
    .groupBy(categories.id)
    .orderBy(desc(sql`SUM(ABS(${entries.amount}))`));
}
