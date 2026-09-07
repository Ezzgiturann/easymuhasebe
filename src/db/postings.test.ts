import {
  buildEntries,
  cashEffect,
  deriveKind,
  directionForKind,
  kasaDelta,
  kindNeedsCategory,
  kindNeedsContact,
} from './postings';
import { TX_KINDS } from './schema/transactions';

const CATEGORY = 'cat-1';
const CONTACT = 'kisi-1';

/** Everything a kind might need, so one call works for all seven. */
const anyInput = (kind: (typeof TX_KINDS)[number], amount = 12345) => ({
  kind,
  amount,
  kasaType: 'nakit' as const,
  toKasaType: 'banka' as const,
  categoryId: CATEGORY,
  contactId: CONTACT,
});

describe('buildEntries', () => {
  /**
   * The invariant the whole ledger rests on. If postings ever fail to sum to
   * zero, money has been created or destroyed and every balance downstream is
   * wrong — so assert it for every kind rather than a sampled few.
   */
  it.each(TX_KINDS)('postings for %s sum to zero', (kind) => {
    const seeds = buildEntries(anyInput(kind));
    expect(seeds.reduce((sum, s) => sum + s.amount, 0)).toBe(0);
  });

  it('books cash income against a category and raises the cash box', () => {
    const seeds = buildEntries({
      kind: 'cash_in',
      amount: 1000,
      kasaType: 'nakit',
      categoryId: CATEGORY,
      contactId: null,
    });
    expect(seeds).toEqual([
      { ledgerType: 'kasa', kasaType: 'nakit', categoryId: null, contactId: null, amount: 1000 },
      { ledgerType: 'category', kasaType: null, categoryId: CATEGORY, contactId: null, amount: -1000 },
    ]);
  });

  it('raises what a customer owes on a veresiye sale without touching cash', () => {
    const seeds = buildEntries({
      kind: 'credit_sale',
      amount: 500,
      kasaType: null,
      categoryId: CATEGORY,
      contactId: CONTACT,
    });
    expect(seeds.some((s) => s.ledgerType === 'kasa')).toBe(false);
    expect(seeds.find((s) => s.ledgerType === 'contact')?.amount).toBe(500);
  });

  /**
   * Settling a debt is not new income. If a collection booked a category the
   * monthly income figure would count the same sale twice.
   */
  it.each(['collect_customer', 'pay_supplier'] as const)('%s books no category', (kind) => {
    const seeds = buildEntries({
      kind,
      amount: 500,
      kasaType: 'nakit',
      categoryId: CATEGORY,
      contactId: CONTACT,
    });
    expect(seeds.some((s) => s.ledgerType === 'category')).toBe(false);
  });

  it('lowers what the customer owes when they pay us', () => {
    const seeds = buildEntries({
      kind: 'collect_customer',
      amount: 500,
      kasaType: 'nakit',
      categoryId: null,
      contactId: CONTACT,
    });
    expect(seeds.find((s) => s.ledgerType === 'kasa')?.amount).toBe(500);
    expect(seeds.find((s) => s.ledgerType === 'contact')?.amount).toBe(-500);
  });

  /**
   * A transfer is the movement the app could not record before: money leaves one
   * cash box and lands in another, the business neither gains nor loses. Booking
   * it as an expense plus an income — the only way to express it previously —
   * inflated both sides of the month while leaving the difference looking right,
   * so the error went unnoticed.
   */
  describe('transfer', () => {
    const transfer = buildEntries({
      kind: 'transfer',
      amount: 1000000,
      kasaType: 'nakit',
      toKasaType: 'banka',
      categoryId: null,
      contactId: null,
    });

    it('moves the amount between two cash boxes and nothing else', () => {
      expect(transfer).toEqual([
        { ledgerType: 'kasa', kasaType: 'nakit', categoryId: null, contactId: null, amount: -1000000 },
        { ledgerType: 'kasa', kasaType: 'banka', categoryId: null, contactId: null, amount: 1000000 },
      ]);
    });

    it('books no category, so it never reaches the income/expense report', () => {
      expect(transfer.some((s) => s.ledgerType === 'category')).toBe(false);
    });

    it('leaves the account total untouched', () => {
      expect(kasaDelta(transfer)).toBe(0);
    });

    it('needs a destination', () => {
      expect(() =>
        buildEntries({
          kind: 'transfer',
          amount: 100,
          kasaType: 'nakit',
          toKasaType: null,
          categoryId: null,
          contactId: null,
        }),
      ).toThrow();
    });

    it('refuses to move money to the box it came from', () => {
      expect(() =>
        buildEntries({
          kind: 'transfer',
          amount: 100,
          kasaType: 'nakit',
          toKasaType: 'nakit',
          categoryId: null,
          contactId: null,
        }),
      ).toThrow();
    });
  });

  describe('refuses input it cannot balance', () => {
    it.each([0, -1, 12.5, NaN])('rejects amount %p', (amount) => {
      expect(() =>
        buildEntries({
          kind: 'cash_in',
          amount,
          kasaType: 'nakit',
          categoryId: CATEGORY,
          contactId: null,
        }),
      ).toThrow();
    });

    it('rejects a cash movement with no cash box', () => {
      expect(() =>
        buildEntries({
          kind: 'cash_in',
          amount: 100,
          kasaType: null,
          categoryId: CATEGORY,
          contactId: null,
        }),
      ).toThrow();
    });

    it('rejects a booked movement with no category', () => {
      expect(() =>
        buildEntries({
          kind: 'cash_out',
          amount: 100,
          kasaType: 'nakit',
          categoryId: null,
          contactId: null,
        }),
      ).toThrow();
    });

    it('rejects a veresiye with no contact', () => {
      expect(() =>
        buildEntries({
          kind: 'credit_sale',
          amount: 100,
          kasaType: null,
          categoryId: CATEGORY,
          contactId: null,
        }),
      ).toThrow();
    });
  });
});

describe('deriveKind', () => {
  it('treats veresiye as a credit sale or purchase', () => {
    expect(deriveKind('in', 'veresiye', true)).toBe('credit_sale');
    expect(deriveKind('out', 'veresiye', true)).toBe('credit_purchase');
  });

  /** A cash movement naming a person is settling a debt — a walk-in sale would
   *  not be tracked per person. This is the modelling call the app rests on. */
  it('treats cash with a person as a settlement', () => {
    expect(deriveKind('in', 'nakit', true)).toBe('collect_customer');
    expect(deriveKind('out', 'banka', true)).toBe('pay_supplier');
  });

  it('treats cash with no person as booked income or expense', () => {
    expect(deriveKind('in', 'nakit', false)).toBe('cash_in');
    expect(deriveKind('out', 'kredi_karti', false)).toBe('cash_out');
  });
});

describe('kind predicates', () => {
  it('agrees with what buildEntries actually requires', () => {
    for (const kind of TX_KINDS) {
      const withoutCategory = () => buildEntries({ ...anyInput(kind, 100), categoryId: null });
      const withoutContact = () => buildEntries({ ...anyInput(kind, 100), contactId: null });

      if (kindNeedsCategory(kind)) expect(withoutCategory).toThrow();
      else expect(withoutCategory).not.toThrow();

      if (kindNeedsContact(kind)) expect(withoutContact).toThrow();
      else expect(withoutContact).not.toThrow();
    }
  });

  it('marks money coming in green and going out red', () => {
    expect(directionForKind('cash_in')).toBe('in');
    expect(directionForKind('credit_sale')).toBe('in');
    expect(directionForKind('collect_customer')).toBe('in');
    expect(directionForKind('cash_out')).toBe('out');
    expect(directionForKind('credit_purchase')).toBe('out');
    expect(directionForKind('pay_supplier')).toBe('out');
  });

  /** Every kind must have an answer — a missing case would throw at render time. */
  it.each(TX_KINDS)('has a direction for %s', (kind) => {
    expect(['in', 'out']).toContain(directionForKind(kind));
  });
});

/**
 * The day headers in the transaction list use `cashEffect` because they only have
 * a row, not its postings. If the two ever disagree, a day header would claim the
 * till moved by an amount the ledger does not back up — so tie them together here.
 */
describe('cashEffect', () => {
  it.each(TX_KINDS)('matches what %s actually does to the cash boxes', (kind) => {
    const seeds = buildEntries(anyInput(kind, 100));
    expect(cashEffect(kind, 100)).toBe(kasaDelta(seeds));
  });

  it('ignores a veresiye sale, which puts no money in the till', () => {
    expect(cashEffect('credit_sale', 50000)).toBe(0);
  });

  it('ignores a transfer, which only moves money between the shop`s own boxes', () => {
    expect(cashEffect('transfer', 50000)).toBe(0);
  });
});

describe('kasaDelta', () => {
  it('counts only cash-box postings', () => {
    const seeds = buildEntries({
      kind: 'cash_out',
      amount: 700,
      kasaType: 'nakit',
      categoryId: CATEGORY,
      contactId: null,
    });
    expect(kasaDelta(seeds)).toBe(-700);
  });

  it('is zero for a veresiye, which never touches cash', () => {
    const seeds = buildEntries({
      kind: 'credit_sale',
      amount: 700,
      kasaType: null,
      categoryId: CATEGORY,
      contactId: CONTACT,
    });
    expect(kasaDelta(seeds)).toBe(0);
  });
});
