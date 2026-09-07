import { isPushable, toLocal, toServer } from './serialize';
import { SYNC_TABLES } from './tables';

const table = (name: string) => {
  const t = SYNC_TABLES.find((x) => x.name === name);
  if (!t) throw new Error(`no such sync table: ${name}`);
  return t;
};

const UUID_A = '018f3a2b-0000-7000-8000-000000000001';
const UUID_B = '018f3a2b-0000-7000-8000-000000000002';

describe('toServer', () => {
  it('drops the derived balance', () => {
    const out = toServer({ id: UUID_A, name: 'Mutfak', cached_balance: 5000 }, table('accounts'));
    expect(out).not.toHaveProperty('cached_balance');
    expect(out.name).toBe('Mutfak');
  });

  it('turns SQLite 0/1 into booleans', () => {
    expect(toServer({ is_shared: 1 }, table('accounts')).is_shared).toBe(true);
    expect(toServer({ is_shared: 0 }, table('accounts')).is_shared).toBe(false);
  });

  /**
   * The reason this guard exists: invites written before accounts existed carry
   * 'local-user' here, and Postgres rejects the whole batch over one bad value.
   */
  it('blanks a non-uuid sitting in a uuid column', () => {
    const out = toServer({ id: UUID_A, invited_by: 'local-user' }, table('account_members'));
    expect(out.invited_by).toBeNull();
    expect(out.id).toBe(UUID_A);
  });

  it('keeps a real uuid and a null alike', () => {
    const out = toServer({ contact_id: UUID_B, category_id: null }, table('transactions'));
    expect(out.contact_id).toBe(UUID_B);
    expect(out.category_id).toBeNull();
  });

  /** A hand-written field list would drop tomorrow's column; this must not. */
  it('passes unknown columns through untouched', () => {
    expect(toServer({ some_new_column: 'x' }, table('transactions')).some_new_column).toBe('x');
  });

  it('leaves amounts exactly as they are', () => {
    expect(toServer({ amount: -2599 }, table('transactions')).amount).toBe(-2599);
  });
});

describe('toLocal', () => {
  it('turns booleans back into 0/1', () => {
    expect(toLocal({ is_shared: true }, table('accounts')).is_shared).toBe(1);
    expect(toLocal({ is_shared: false }, table('accounts')).is_shared).toBe(0);
  });

  /** Absent, not zero: the local UPSERT must leave the computed value alone. */
  it('never carries a balance back', () => {
    expect(toLocal({ cached_balance: 9 }, table('accounts'))).not.toHaveProperty('cached_balance');
  });

  it('round-trips an ordinary row', () => {
    const row = { id: UUID_A, name: 'Ahmet', opening_balance: 12345, deleted_at: null };
    expect(toLocal(toServer(row, table('contacts')), table('contacts'))).toEqual(row);
  });
});

describe('isPushable', () => {
  it('accepts a claimed account and rejects an unowned one', () => {
    expect(isPushable({ owner_user_id: UUID_A }, table('accounts'))).toBe(true);
    expect(isPushable({ owner_user_id: null }, table('accounts'))).toBe(false);
  });

  it('rejects a child row whose account id is not a uuid', () => {
    expect(isPushable({ account_id: UUID_A }, table('transactions'))).toBe(true);
    expect(isPushable({ account_id: 'local' }, table('transactions'))).toBe(false);
  });
});
