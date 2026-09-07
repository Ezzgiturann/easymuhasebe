import { asc, eq, isNull } from 'drizzle-orm';

import { db } from '../client';
import { accounts } from '../schema';

/**
 * Every account row on this device, newest ordering applied.
 *
 * Deliberately carries no identity. Who may see what is decided by
 * `accessibleAccounts` (src/utils/accessible-accounts.ts) over these rows —
 * because `useLiveQuery` keeps the query object it was first given, and a
 * user id compiled into the WHERE clause stayed at whatever it was when the
 * screen mounted. A provider that mounted before sign-in finished then asked
 * for "accounts belonging to nobody" for the rest of the session.
 */
export function allAccountsQuery() {
  return db
    .select()
    .from(accounts)
    .where(isNull(accounts.deletedAt))
    .orderBy(asc(accounts.sortOrder), asc(accounts.createdAt));
}

/** A single account by id. */
export function accountQuery(id: string) {
  return db.select().from(accounts).where(eq(accounts.id, id));
}
