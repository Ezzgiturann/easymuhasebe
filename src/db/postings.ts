import type { KasaType, TxKind } from './schema/transactions';
import type { LedgerType } from './schema/entries';

/**
 * A single double-entry posting before it is persisted (id / transactionId /
 * accountId / txDate / sync columns are filled in by the mutation layer).
 */
export interface EntrySeed {
  ledgerType: LedgerType;
  kasaType: KasaType | null;
  categoryId: string | null;
  contactId: string | null;
  /** SIGNED kuruş. */
  amount: number;
}

export interface BuildEntriesInput {
  kind: TxKind;
  /** UNSIGNED headline amount in kuruş. */
  amount: number;
  /** The cash box money leaves from, or arrives in for a one-sided movement. */
  kasaType: KasaType | null;
  /** Only for `transfer`: the cash box money arrives in. */
  toKasaType?: KasaType | null;
  categoryId: string | null;
  contactId: string | null;
}

/**
 * Translate one user-facing transaction into balanced double-entry postings.
 * The user never sees debit/credit — this table is the whole translation.
 *
 * Sign convention (kuruş): kasa '+' = cash increased; contact '+' = the contact
 * owes us more; category balances the transaction to zero. The returned seeds
 * always sum to 0 (asserted below) so money is never created or destroyed.
 *
 * Note: collect_customer / pay_supplier have NO category posting — settling a
 * debt is not new income/expense, so income/expense reports never double-count.
 * `transfer` books no category for the same reason: moving money between cash
 * boxes is neither income nor expense, and treating it as both would inflate a
 * month's totals on each side while leaving the difference looking correct.
 */
export function buildEntries(input: BuildEntriesInput): EntrySeed[] {
  const { kind, amount: a, kasaType, toKasaType, categoryId, contactId } = input;

  if (!Number.isInteger(a) || a <= 0) {
    throw new Error(`buildEntries: amount must be a positive integer kuruş, got ${a}`);
  }

  /** Defaults to the movement's own cash box; `transfer` passes the other side. */
  const kasa = (amount: number, type: KasaType | null = kasaType): EntrySeed => {
    if (!type) throw new Error(`buildEntries: kind '${kind}' requires a kasaType`);
    return { ledgerType: 'kasa', kasaType: type, categoryId: null, contactId: null, amount };
  };
  const category = (amount: number): EntrySeed => {
    if (!categoryId) throw new Error(`buildEntries: kind '${kind}' requires a categoryId`);
    return { ledgerType: 'category', kasaType: null, categoryId, contactId: null, amount };
  };
  const contact = (amount: number): EntrySeed => {
    if (!contactId) throw new Error(`buildEntries: kind '${kind}' requires a contactId`);
    return { ledgerType: 'contact', kasaType: null, categoryId: null, contactId, amount };
  };

  let seeds: EntrySeed[];
  switch (kind) {
    case 'cash_in': // nakit gelir: cash up, income booked
      seeds = [kasa(a), category(-a)];
      break;
    case 'cash_out': // nakit gider: cash down, expense booked
      seeds = [kasa(-a), category(a)];
      break;
    case 'credit_sale': // veresiye satış: income booked, customer owes us more
      seeds = [category(-a), contact(a)];
      break;
    case 'credit_purchase': // veresiye alış: expense booked, we owe supplier more
      seeds = [category(a), contact(-a)];
      break;
    case 'collect_customer': // tahsilat: cash up, customer owes us less
      seeds = [kasa(a), contact(-a)];
      break;
    case 'pay_supplier': // ödeme: cash down, we owe supplier less
      seeds = [kasa(-a), contact(a)];
      break;
    case 'transfer': // kasadan kasaya: nothing enters or leaves the business
      if (!toKasaType) throw new Error("buildEntries: kind 'transfer' requires a toKasaType");
      if (toKasaType === kasaType) {
        throw new Error('buildEntries: a transfer must move between two different kasaType');
      }
      seeds = [kasa(-a), kasa(a, toKasaType)];
      break;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`buildEntries: unknown kind ${_exhaustive}`);
    }
  }

  const sum = seeds.reduce((acc, s) => acc + s.amount, 0);
  if (sum !== 0) {
    throw new Error(`buildEntries: postings for '${kind}' do not balance (sum=${sum})`);
  }
  return seeds;
}

/** Green (money in) vs red (money out) for the transaction list, per kind. */
export function directionForKind(kind: TxKind): 'in' | 'out' {
  switch (kind) {
    case 'cash_in':
    case 'credit_sale':
    case 'collect_customer':
      return 'in';
    case 'cash_out':
    case 'credit_purchase':
    case 'pay_supplier':
    // A transfer has no direction — nothing enters or leaves. 'out' is only
    // stored because the column requires one; the UI renders transfers neutrally
    // rather than as a loss.
    case 'transfer':
      return 'out';
    default: {
      const _exhaustive: never = kind;
      throw new Error(`directionForKind: unknown kind ${_exhaustive}`);
    }
  }
}

/** What the user picks in the entry form: a cash box or "veresiye" (on credit). */
export type PaymentMethod = KasaType | 'veresiye';

/**
 * Map the three simple choices the user actually makes — money in/out, payment
 * method, and whether a person is attached — onto one of the six kinds.
 *
 * The key modeling call: a CASH movement that names a person is a debt
 * settlement (collect/pay, no category), because a plain cash sale to a walk-in
 * wouldn't be tracked per-person. A cash movement with no person is a booked
 * income/expense. "Veresiye" is always a credit sale/purchase against the cari.
 */
export function deriveKind(
  direction: 'in' | 'out',
  method: PaymentMethod,
  hasContact: boolean,
): TxKind {
  if (method === 'veresiye') {
    return direction === 'in' ? 'credit_sale' : 'credit_purchase';
  }
  if (hasContact) {
    return direction === 'in' ? 'collect_customer' : 'pay_supplier';
  }
  return direction === 'in' ? 'cash_in' : 'cash_out';
}

/** Kinds that book a category (income/expense). Settlements do not. */
export function kindNeedsCategory(kind: TxKind): boolean {
  return kind === 'cash_in' || kind === 'cash_out' || kind === 'credit_sale' || kind === 'credit_purchase';
}

/** Kinds that require a cari. */
export function kindNeedsContact(kind: TxKind): boolean {
  return (
    kind === 'credit_sale' ||
    kind === 'credit_purchase' ||
    kind === 'collect_customer' ||
    kind === 'pay_supplier'
  );
}

/** Net change to the account's cached kasa balance for a set of postings. */
export function kasaDelta(seeds: EntrySeed[]): number {
  return seeds
    .filter((s) => s.ledgerType === 'kasa')
    .reduce((acc, s) => acc + s.amount, 0);
}

/**
 * Signed effect on the account's cash, worked out from the kind alone.
 *
 * `kasaDelta` needs the postings; this needs only a list row, which is what the
 * day headers in the transaction list have. A veresiye moves no cash and a
 * transfer nets to zero, so neither counts — a day header reading "+2.400" means
 * the till really did grow by 2.400.
 *
 * Must agree with `kasaDelta(buildEntries(...))`; there is a test asserting that.
 */
export function cashEffect(kind: TxKind, amount: number): number {
  switch (kind) {
    case 'cash_in':
    case 'collect_customer':
      return amount;
    case 'cash_out':
    case 'pay_supplier':
      return -amount;
    case 'credit_sale':
    case 'credit_purchase':
    case 'transfer':
      return 0;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`cashEffect: unknown kind ${_exhaustive}`);
    }
  }
}
