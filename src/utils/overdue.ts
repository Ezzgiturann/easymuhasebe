/**
 * Working out how much of a cari's debt is actually late.
 *
 * The ledger has no link between a veresiye sale and the payment that settles
 * it — `collect_customer` just lowers the contact's balance. So "which debt is
 * still open" has to be derived, and the rule used here is the one the trade
 * already assumes: **a payment clears the oldest debt first.**
 *
 * Pure and date-string based so it can be tested without a device or a clock.
 */

import { addDays, daysBetween } from '@/db/dates';

/** An unpaid slice of debt, with the day it arose. */
export interface DebtLot {
  /** null for the opening balance, which has no date and so can never be judged late. */
  date: string | null;
  amount: number;
}

/** One statement line: signed kuruş, positive = they owe us more. */
export interface StatementLine {
  txDate: string;
  contactAmount: number;
}

/**
 * Replay the statement, applying every payment to the oldest outstanding debt,
 * and return what is left unpaid. Overpayments become credit that absorbs the
 * next debts rather than showing up as negative lots.
 */
export function outstandingLots(openingBalance: number, rows: StatementLine[]): DebtLot[] {
  const lots: DebtLot[] = [];
  let credit = 0;

  if (openingBalance > 0) lots.push({ date: null, amount: openingBalance });
  else if (openingBalance < 0) credit = -openingBalance;

  for (const row of rows) {
    if (row.contactAmount > 0) {
      let amount = row.contactAmount;
      const absorbed = Math.min(credit, amount);
      credit -= absorbed;
      amount -= absorbed;
      if (amount > 0) lots.push({ date: row.txDate, amount });
    } else if (row.contactAmount < 0) {
      let payment = -row.contactAmount;
      while (payment > 0 && lots.length > 0) {
        const lot = lots[0];
        const used = Math.min(lot.amount, payment);
        lot.amount -= used;
        payment -= used;
        if (lot.amount === 0) lots.shift();
      }
      credit += payment;
    }
  }

  return lots;
}

export interface OverdueInfo {
  /** Kuruş whose agreed term has passed. Zero when nothing is late. */
  amount: number;
  /** Days since the oldest late slice fell due. Zero when nothing is late. */
  daysLate: number;
}

export const NOT_OVERDUE: OverdueInfo = { amount: 0, daysLate: 0 };

/**
 * Which of those lots are past the agreed term.
 *
 * A contact with no term is never late — an esnaf who never agreed a date should
 * not be nagged by the app about one it invented.
 */
export function computeOverdue(
  lots: DebtLot[],
  paymentTermDays: number | null,
  today: string,
): OverdueInfo {
  if (paymentTermDays === null || paymentTermDays < 0) return NOT_OVERDUE;

  let amount = 0;
  let daysLate = 0;

  for (const lot of lots) {
    // No date means it came from the opening balance; we cannot say when it was due.
    if (!lot.date) continue;
    const due = addDays(lot.date, paymentTermDays);
    // 'YYYY-MM-DD' compares correctly as a string.
    if (due < today) {
      amount += lot.amount;
      daysLate = Math.max(daysLate, daysBetween(due, today));
    }
  }

  return amount > 0 ? { amount, daysLate } : NOT_OVERDUE;
}
