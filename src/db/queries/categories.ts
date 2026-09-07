import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '../client';
import { categories, transactions } from '../schema';

/** How many live transactions use this category — the number the delete warning
 *  quotes, so nobody removes a category without knowing what it labels. */
export function categoryUsageCount(categoryId: string): number {
  return db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.categoryId, categoryId), isNull(transactions.deletedAt)))
    .all().length;
}

/** A single category. Soft-deleted ones still resolve, so an old transaction's
 *  label does not vanish from the screen showing it. */
export function categoryQuery(categoryId: string) {
  return db.select().from(categories).where(eq(categories.id, categoryId));
}

/** Categories for an account, optionally filtered to income or expense. */
export function categoriesQuery(accountId: string, kind?: 'income' | 'expense') {
  const where = kind
    ? and(eq(categories.accountId, accountId), eq(categories.kind, kind), isNull(categories.deletedAt))
    : and(eq(categories.accountId, accountId), isNull(categories.deletedAt));
  return db.select().from(categories).where(where).orderBy(asc(categories.sortOrder), asc(categories.name));
}
