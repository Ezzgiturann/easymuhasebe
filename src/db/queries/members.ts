import { and, asc, eq, isNull, ne } from 'drizzle-orm';

import { db } from '../client';
import { accountMembers } from '../schema';

/** Members + pending invites for an account (excludes the owner, who is you). */
export function membersQuery(accountId: string) {
  return db
    .select()
    .from(accountMembers)
    .where(and(eq(accountMembers.accountId, accountId), isNull(accountMembers.deletedAt)))
    .orderBy(asc(accountMembers.createdAt));
}

/**
 * Every membership row, with enough columns to answer both "is this account
 * shared" and "may this user open it".
 *
 * No identity in the query — see `allAccountsQuery` for why.
 */
export function allMembershipsQuery() {
  return db
    .select({
      accountId: accountMembers.accountId,
      userId: accountMembers.userId,
      role: accountMembers.role,
      status: accountMembers.status,
    })
    .from(accountMembers)
    .where(isNull(accountMembers.deletedAt));
}

/** Account ids of every active/pending membership — used to mark which accounts
 *  are shared. Kept as its own live query so the home reacts to account_members. */
export function allMembersQuery() {
  return db
    .select({ accountId: accountMembers.accountId })
    .from(accountMembers)
    .where(
      and(
        isNull(accountMembers.deletedAt),
        // The owner has a membership row of their own — it is what the sharing
        // rules read. Counting it here would make every account look shared the
        // moment it was created, which is exactly what happened.
        ne(accountMembers.role, 'owner'),
      ),
    );
}
