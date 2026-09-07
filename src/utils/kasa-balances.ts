/**
 * Turning kasa postings plus an account's starting balance ("başlangıç
 * bakiyesi") into "how much is in each box right now".
 *
 * Pure so it can be tested without a device, and shared so the account screen,
 * the summary and the assistant can never disagree about the same number — the
 * starting balance being counted in one place and not another is exactly the
 * kind of drift a shopkeeper would find while counting the till and could not
 * explain.
 */

import { KASA_TYPES, type KasaType } from '@/db/schema/transactions';

/** One row as `kasaBalancesQuery` returns it: a box and its posting total. */
export interface KasaMovementRow {
  kasaType: KasaType | null;
  total: number;
}

export interface AccountOpening {
  openingBalance: number;
  openingKasaType: KasaType | null;
}

export interface KasaBalance {
  kasaType: KasaType;
  total: number;
}

/**
 * Every box, in a fixed order, with the opening balance folded into the one it
 * belongs to. Boxes with nothing in them come back as zero rather than missing —
 * an absent row reads as a bug, a zero reads as an answer.
 */
export function kasaBalances(rows: KasaMovementRow[], opening: AccountOpening): KasaBalance[] {
  const totals = new Map<KasaType, number>(KASA_TYPES.map((k) => [k, 0]));

  for (const row of rows) {
    // A posting with no kasaType is not a cash-box posting; ignore rather than
    // guess which box it meant.
    if (!row.kasaType) continue;
    totals.set(row.kasaType, (totals.get(row.kasaType) ?? 0) + row.total);
  }

  if (opening.openingBalance !== 0 && opening.openingKasaType) {
    const k = opening.openingKasaType;
    totals.set(k, (totals.get(k) ?? 0) + opening.openingBalance);
  }

  return KASA_TYPES.map((kasaType) => ({ kasaType, total: totals.get(kasaType) ?? 0 }));
}

/** What the whole account holds — the figure the home screen shows. */
export function kasaTotal(balances: KasaBalance[]): number {
  return balances.reduce((sum, b) => sum + b.total, 0);
}
