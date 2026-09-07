/**
 * Narrowing the transaction list down to what the user asked for.
 *
 * Pure, and shared by the İşlemler tab's filter sheet and the category
 * drill-down from Özet — one rule set, so "Kira 3.000" on the summary and the
 * list it opens can never disagree about which movements are in it.
 */

import type { KasaType, TxKind } from '@/db/schema/transactions';

/** The groupings a shopkeeper thinks in, not the seven internal kinds. */
export type TxGroup = 'income' | 'expense' | 'credit' | 'settlement' | 'transfer';

const GROUP_KINDS: Record<TxGroup, TxKind[]> = {
  income: ['cash_in'],
  expense: ['cash_out'],
  credit: ['credit_sale', 'credit_purchase'],
  settlement: ['collect_customer', 'pay_supplier'],
  transfer: ['transfer'],
};

export const TX_GROUP_LABELS: Record<TxGroup, string> = {
  income: 'Gelir',
  expense: 'Gider',
  credit: 'Veresiye',
  settlement: 'Tahsilat / Ödeme',
  transfer: 'Aktarım',
};

export const TX_GROUPS = Object.keys(GROUP_KINDS) as TxGroup[];

export interface TransactionFilter {
  /** Null means every kind. */
  group: TxGroup | null;
  /** Null means every cash box, including veresiye movements that touch none. */
  kasaType: KasaType | null;
  /** Inclusive 'YYYY-MM-DD' bounds. Null means unbounded on that side. */
  start: string | null;
  end: string | null;
  categoryId: string | null;
}

export const NO_FILTER: TransactionFilter = {
  group: null,
  kasaType: null,
  start: null,
  end: null,
  categoryId: null,
};

/** True when nothing is narrowed — the list is showing everything. */
export function isEmptyFilter(f: TransactionFilter): boolean {
  return !f.group && !f.kasaType && !f.start && !f.end && !f.categoryId;
}

/** How many separate conditions are on, for the badge on the filter button. */
export function activeFilterCount(f: TransactionFilter): number {
  let n = 0;
  if (f.group) n++;
  if (f.kasaType) n++;
  if (f.start || f.end) n++;
  if (f.categoryId) n++;
  return n;
}

/** The subset of a transaction row this module needs; anything wider also fits. */
export interface FilterableRow {
  kind: TxKind;
  kasaType: KasaType | null;
  categoryId?: string | null;
  txDate: string;
}

/**
 * Keep the rows that match every condition set.
 *
 * A transfer is matched by EITHER end: filtering by "Banka" has to show the
 * money that arrived there, and only `kasaType` records where it left from.
 */
export function matchesFilter(
  row: FilterableRow & { toKasaType?: KasaType | null },
  f: TransactionFilter,
): boolean {
  if (f.group && !GROUP_KINDS[f.group].includes(row.kind)) return false;

  if (f.kasaType && row.kasaType !== f.kasaType && row.toKasaType !== f.kasaType) return false;

  if (f.categoryId && row.categoryId !== f.categoryId) return false;

  // 'YYYY-MM-DD' compares correctly as a string.
  if (f.start && row.txDate < f.start) return false;
  if (f.end && row.txDate > f.end) return false;

  return true;
}

export function filterTransactions<T extends FilterableRow & { toKasaType?: KasaType | null }>(
  rows: T[],
  f: TransactionFilter,
): T[] {
  if (isEmptyFilter(f)) return rows;
  return rows.filter((row) => matchesFilter(row, f));
}
