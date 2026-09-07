/**
 * Which ledgers a user may open.
 *
 * A plain function over rows rather than a WHERE clause, and that is the whole
 * point. The identity used to be compiled into the SQL, and `useLiveQuery` keeps
 * the query object it was first handed — so a screen mounted before sign-in
 * finished held a query that asked for "accounts belonging to nobody" forever.
 * The symptom was strange enough to be worth recording: the home list showed the
 * ledger (it mounts after the gate) while İşlemler insisted there were none (its
 * provider mounts before it).
 *
 * Filtering here means the answer is recomputed from the current user id on every
 * render, and no cached query can be stale. Accounts are a handful of rows per
 * user; there is nothing to save by pushing this into SQL.
 */

export interface AccountLike {
  id: string;
  ownerUserId: string | null;
}

export interface MembershipLike {
  accountId: string;
  userId: string | null;
  role: string;
  status: string;
}

/**
 * Owned ledgers plus ones shared with this user.
 *
 * Only `active` memberships count: a pending invite is a ledger someone has been
 * offered, not one they can read — putting it in the list would show a balance
 * the server would refuse to send.
 *
 * Signed out, nothing is accessible except rows from before accounts existed,
 * which `claimUnownedAccounts` hands to the first person who signs in.
 */
export function accessibleAccounts<T extends AccountLike>(
  accounts: readonly T[],
  memberships: readonly MembershipLike[],
  userId: string | null,
): T[] {
  if (!userId) return accounts.filter((a) => a.ownerUserId === null);

  const sharedWithMe = new Set(
    memberships
      .filter((m) => m.userId === userId && m.status === 'active' && m.role !== 'owner')
      .map((m) => m.accountId),
  );

  return accounts.filter((a) => a.ownerUserId === userId || sharedWithMe.has(a.id));
}

/** True when the ledger belongs to someone else — it was shared with this user. */
export function isSharedWithMe(account: AccountLike, userId: string | null): boolean {
  return account.ownerUserId !== userId;
}
