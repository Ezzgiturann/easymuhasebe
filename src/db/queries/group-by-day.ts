import { cashEffect } from '../postings';
import type { TransactionRow } from './transactions';

/**
 * Kept out of `transactions.ts` because that module opens the native database on
 * import. This one is pure — the type import above is erased at runtime — so the
 * day-net rule can be tested without a device.
 */

export interface DaySection {
  day: string; // 'YYYY-MM-DD'
  /**
   * Signed kuruş the cash boxes actually moved that day. A veresiye sale and a
   * transfer between two of the shop's own boxes both count as 0 — "+2.400"
   * means there are 2.400 lira more on hand than at the start of the day, which
   * is the number that can be checked against the till.
   */
  net: number;
  data: TransactionRow[];
}

/** Group newest-first rows into day sections with each day's net cash movement. */
export function groupByDay(rows: TransactionRow[]): DaySection[] {
  const sections: DaySection[] = [];
  let current: DaySection | null = null;
  for (const row of rows) {
    if (!current || current.day !== row.txDate) {
      current = { day: row.txDate, net: 0, data: [] };
      sections.push(current);
    }
    current.data.push(row);
    current.net += cashEffect(row.kind, row.amount);
  }
  return sections;
}
