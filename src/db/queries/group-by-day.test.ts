import { groupByDay } from './group-by-day';
import type { TransactionRow } from './transactions';

/**
 * `groupByDay` only reads five of the row's fields; the rest exist to satisfy the
 * type. Building them here keeps each case down to what it is actually testing.
 */
function row(partial: Partial<TransactionRow> & Pick<TransactionRow, 'txDate' | 'kind' | 'amount'>): TransactionRow {
  return {
    id: `tx-${partial.txDate}-${partial.amount}-${partial.kind}`,
    direction: 'in',
    kasaType: 'nakit',
    toKasaType: null,
    categoryId: null,
    description: null,
    note: null,
    createdAt: 0,
    categoryName: null,
    categoryIcon: null,
    contactName: null,
    ...partial,
  };
}

describe('groupByDay', () => {
  it('returns nothing for an empty list', () => {
    expect(groupByDay([])).toEqual([]);
  });

  it('starts a new section on each new day, keeping the incoming order', () => {
    const sections = groupByDay([
      row({ txDate: '2026-03-10', kind: 'cash_in', amount: 100 }),
      row({ txDate: '2026-03-10', kind: 'cash_in', amount: 200 }),
      row({ txDate: '2026-03-09', kind: 'cash_in', amount: 300 }),
    ]);
    expect(sections.map((s) => s.day)).toEqual(['2026-03-10', '2026-03-09']);
    expect(sections[0].data).toHaveLength(2);
    expect(sections[1].data).toHaveLength(1);
  });

  /**
   * Rows arrive sorted by day, so the same day never appears twice. Asserting the
   * behaviour anyway records what happens if that ever changes: the day splits
   * rather than silently merging into one section with a wrong total.
   */
  it('does not merge days that are not adjacent', () => {
    const sections = groupByDay([
      row({ txDate: '2026-03-10', kind: 'cash_in', amount: 100 }),
      row({ txDate: '2026-03-09', kind: 'cash_in', amount: 100 }),
      row({ txDate: '2026-03-10', kind: 'cash_in', amount: 100 }),
    ]);
    expect(sections).toHaveLength(3);
  });

  describe("the day's net is what the till actually did", () => {
    it('adds cash income and subtracts cash expense', () => {
      const [day] = groupByDay([
        row({ txDate: '2026-03-10', kind: 'cash_in', amount: 250000 }),
        row({ txDate: '2026-03-10', kind: 'cash_out', amount: 100000 }),
      ]);
      expect(day.net).toBe(150000);
    });

    it('counts a collection, which is real money coming in', () => {
      const [day] = groupByDay([
        row({ txDate: '2026-03-10', kind: 'collect_customer', amount: 80000, direction: 'in' }),
        row({ txDate: '2026-03-10', kind: 'pay_supplier', amount: 30000, direction: 'out' }),
      ]);
      expect(day.net).toBe(50000);
    });

    /**
     * The bug this replaces: `credit_sale` is stored with direction 'in', so the
     * old net added it and a day of pure veresiye read "+1.500" while the till
     * had not moved at all. The shopkeeper counting cash at closing time would
     * find 1.500 lira missing that were never there.
     */
    it('ignores a veresiye sale — the goods left, the money did not arrive', () => {
      const [day] = groupByDay([
        row({ txDate: '2026-03-10', kind: 'credit_sale', amount: 150000, direction: 'in', kasaType: null }),
      ]);
      expect(day.net).toBe(0);
    });

    it('ignores a veresiye purchase for the same reason', () => {
      const [day] = groupByDay([
        row({ txDate: '2026-03-10', kind: 'credit_purchase', amount: 150000, direction: 'out', kasaType: null }),
      ]);
      expect(day.net).toBe(0);
    });

    /** Moving the till's cash to the bank leaves the shop with exactly as much. */
    it('ignores a transfer between the shop`s own cash boxes', () => {
      const [day] = groupByDay([
        row({
          txDate: '2026-03-10',
          kind: 'transfer',
          amount: 500000,
          direction: 'out',
          kasaType: 'nakit',
          toKasaType: 'banka',
        }),
      ]);
      expect(day.net).toBe(0);
    });

    it('still counts the cash movements on a day that also has veresiye and a transfer', () => {
      const [day] = groupByDay([
        row({ txDate: '2026-03-10', kind: 'cash_in', amount: 240000 }),
        row({ txDate: '2026-03-10', kind: 'credit_sale', amount: 900000, direction: 'in', kasaType: null }),
        row({
          txDate: '2026-03-10',
          kind: 'transfer',
          amount: 200000,
          direction: 'out',
          toKasaType: 'banka',
        }),
      ]);
      expect(day.net).toBe(240000);
    });
  });
});
