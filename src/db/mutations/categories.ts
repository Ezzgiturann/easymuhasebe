import { eq } from 'drizzle-orm';

import { db } from '../client';
import { newId } from '../ids';
import { categories } from '../schema';
import { insertStamp, updateStamp } from '../stamp';

/** Create a custom category for an account. Returns the new category id. */
export function createCategory(
  accountId: string,
  name: string,
  kind: 'income' | 'expense',
): string {
  const id = newId();
  db.insert(categories)
    .values({
      id,
      accountId,
      name: name.trim(),
      kind,
      icon: kind === 'income' ? 'add-circle' : 'pricetag',
      sortOrder: 100,
      ...insertStamp(),
    })
    .run();
  return id;
}

/** Rename a category. Past transactions keep pointing at it, so their reports
 *  simply start showing the new name — nothing is re-filed. */
export function updateCategory(id: string, name: string): void {
  db.update(categories)
    .set({ name: name.trim(), ...updateStamp() })
    .where(eq(categories.id, id))
    .run();
}

/**
 * Soft-delete a category: it leaves the picker but stays joinable, so existing
 * transactions keep their label and past months still add up in Özet. Reports
 * join categories without a `deletedAt` filter precisely so this holds.
 */
export function deleteCategory(id: string): void {
  const now = Date.now();
  db.update(categories)
    .set({ deletedAt: now, ...updateStamp(now) })
    .where(eq(categories.id, id))
    .run();
}
