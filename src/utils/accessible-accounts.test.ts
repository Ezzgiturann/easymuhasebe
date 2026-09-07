import { accessibleAccounts, isSharedWithMe } from './accessible-accounts';

const ME = 'user-me';
const OTHER = 'user-other';

const acc = (id: string, ownerUserId: string | null) => ({ id, ownerUserId });
const member = (
  accountId: string,
  userId: string | null,
  role = 'editor',
  status = 'active',
) => ({ accountId, userId, role, status });

describe('accessibleAccounts', () => {
  const accounts = [acc('mine', ME), acc('theirs', OTHER), acc('orphan', null)];

  it('returns the ledgers I own', () => {
    expect(accessibleAccounts(accounts, [], ME).map((a) => a.id)).toEqual(['mine']);
  });

  it('adds a ledger shared with me', () => {
    const rows = accessibleAccounts(accounts, [member('theirs', ME)], ME);
    expect(rows.map((a) => a.id)).toEqual(['mine', 'theirs']);
  });

  /** A pending invite is a ledger offered, not one the server would send. */
  it('ignores a membership that is not active', () => {
    const rows = accessibleAccounts(accounts, [member('theirs', ME, 'editor', 'pending')], ME);
    expect(rows.map((a) => a.id)).toEqual(['mine']);
  });

  it('ignores someone else’s membership', () => {
    const rows = accessibleAccounts(accounts, [member('theirs', OTHER)], ME);
    expect(rows.map((a) => a.id)).toEqual(['mine']);
  });

  /** The owner has a membership row of their own; counting it would duplicate. */
  it('does not double-count the owner’s own membership row', () => {
    const rows = accessibleAccounts(accounts, [member('mine', ME, 'owner')], ME);
    expect(rows.map((a) => a.id)).toEqual(['mine']);
  });

  it('never leaks another user’s ledger', () => {
    expect(accessibleAccounts(accounts, [], OTHER).map((a) => a.id)).toEqual(['theirs']);
  });

  /**
   * Signed out means the pre-account era: those rows are handed to whoever signs
   * in first. Everything else stays hidden.
   */
  it('shows only unowned rows when signed out', () => {
    expect(accessibleAccounts(accounts, [], null).map((a) => a.id)).toEqual(['orphan']);
  });

  it('handles an empty ledger', () => {
    expect(accessibleAccounts([], [], ME)).toEqual([]);
  });
});

describe('isSharedWithMe', () => {
  it('is false for my own ledger and true for someone else’s', () => {
    expect(isSharedWithMe(acc('a', ME), ME)).toBe(false);
    expect(isSharedWithMe(acc('a', OTHER), ME)).toBe(true);
  });
});
