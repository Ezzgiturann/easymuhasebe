import {
  activeFilterCount,
  filterTransactions,
  isEmptyFilter,
  NO_FILTER,
  TX_GROUPS,
  TX_GROUP_LABELS,
  type FilterableRow,
  type TransactionFilter,
} from './tx-filter';
import { TX_KINDS, type KasaType, type TxKind } from '@/db/schema/transactions';

type Row = FilterableRow & { toKasaType?: KasaType | null; id: string };

const row = (id: string, kind: TxKind, over: Partial<Row> = {}): Row => ({
  id,
  kind,
  kasaType: 'nakit',
  categoryId: null,
  txDate: '2026-03-10',
  ...over,
});

const ids = (rows: Row[], f: Partial<TransactionFilter>) =>
  filterTransactions(rows, { ...NO_FILTER, ...f }).map((r) => r.id);

describe('groups', () => {
  /** Every kind must fall in exactly one group, or it becomes unreachable. */
  it('covers all seven kinds exactly once', () => {
    const seen = TX_GROUPS.flatMap((g) =>
      TX_KINDS.filter((k) => filterTransactions([row('x', k)], { ...NO_FILTER, group: g }).length),
    );
    expect(seen.sort()).toEqual([...TX_KINDS].sort());
  });

  it('has a Turkish label for every group', () => {
    for (const g of TX_GROUPS) expect(TX_GROUP_LABELS[g]).toBeTruthy();
  });
});

describe('filterTransactions', () => {
  const rows: Row[] = [
    row('sale', 'cash_in', { categoryId: 'satis' }),
    row('rent', 'cash_out', { categoryId: 'kira', kasaType: 'banka' }),
    row('veresiye', 'credit_sale', { categoryId: 'satis', kasaType: null }),
    row('tahsilat', 'collect_customer'),
    row('aktarim', 'transfer', { kasaType: 'nakit', toKasaType: 'banka' }),
  ];

  it('returns everything when nothing is set', () => {
    expect(filterTransactions(rows, NO_FILTER)).toBe(rows);
  });

  it('narrows by group', () => {
    expect(ids(rows, { group: 'expense' })).toEqual(['rent']);
    expect(ids(rows, { group: 'credit' })).toEqual(['veresiye']);
    expect(ids(rows, { group: 'settlement' })).toEqual(['tahsilat']);
  });

  it('narrows by category', () => {
    expect(ids(rows, { categoryId: 'satis' })).toEqual(['sale', 'veresiye']);
  });

  it('narrows by cash box', () => {
    expect(ids(rows, { kasaType: 'nakit' })).toEqual(['sale', 'tahsilat', 'aktarim']);
  });

  /**
   * The subtle one: a transfer only stores where the money LEFT from. Filtering
   * by "Banka" and not seeing the 5.000 that landed there would read as missing
   * money.
   */
  it('matches a transfer on the box it arrived in, not just the one it left', () => {
    expect(ids(rows, { kasaType: 'banka' })).toEqual(['rent', 'aktarim']);
  });

  it('leaves out a veresiye when a cash box is chosen — it touched none', () => {
    expect(ids(rows, { kasaType: 'nakit' })).not.toContain('veresiye');
  });

  it('combines conditions rather than widening', () => {
    expect(ids(rows, { group: 'income', kasaType: 'banka' })).toEqual([]);
  });

  describe('dates', () => {
    const dated: Row[] = [
      row('feb', 'cash_in', { txDate: '2026-02-28' }),
      row('mar1', 'cash_in', { txDate: '2026-03-01' }),
      row('mar31', 'cash_in', { txDate: '2026-03-31' }),
      row('apr', 'cash_in', { txDate: '2026-04-01' }),
    ];

    it('includes both ends of the range', () => {
      expect(ids(dated, { start: '2026-03-01', end: '2026-03-31' })).toEqual(['mar1', 'mar31']);
    });

    it('accepts an open start', () => {
      expect(ids(dated, { end: '2026-03-01' })).toEqual(['feb', 'mar1']);
    });

    it('accepts an open end', () => {
      expect(ids(dated, { start: '2026-03-31' })).toEqual(['mar31', 'apr']);
    });
  });
});

describe('isEmptyFilter / activeFilterCount', () => {
  it('reads a fresh filter as empty', () => {
    expect(isEmptyFilter(NO_FILTER)).toBe(true);
    expect(activeFilterCount(NO_FILTER)).toBe(0);
  });

  it('counts a date range as one condition, not two', () => {
    expect(activeFilterCount({ ...NO_FILTER, start: '2026-03-01', end: '2026-03-31' })).toBe(1);
  });

  it('counts each other condition separately', () => {
    expect(activeFilterCount({ ...NO_FILTER, group: 'expense', kasaType: 'banka' })).toBe(2);
  });
});
