import { computeOverdue, outstandingLots, type StatementLine } from './overdue';

const TODAY = '2026-08-06';
const line = (txDate: string, contactAmount: number): StatementLine => ({ txDate, contactAmount });

/**
 * The ledger never records which payment settled which sale, so these lots are
 * derived by replaying the statement oldest-debt-first. Every number the
 * collections screen shows comes from here.
 */
describe('outstandingLots', () => {
  it('clears the oldest debt first', () => {
    const lots = outstandingLots(0, [
      line('2026-06-01', 1000),
      line('2026-07-01', 500),
      line('2026-07-15', -1000),
    ]);
    expect(lots).toEqual([{ date: '2026-07-01', amount: 500 }]);
  });

  it('leaves the remainder on the oldest debt when a payment falls short', () => {
    const lots = outstandingLots(0, [line('2026-06-01', 1000), line('2026-07-15', -400)]);
    expect(lots).toEqual([{ date: '2026-06-01', amount: 600 }]);
  });

  it('carries an overpayment forward against later debts', () => {
    const lots = outstandingLots(0, [
      line('2026-06-01', 1000),
      line('2026-07-15', -1500),
      line('2026-08-01', 900),
    ]);
    expect(lots).toEqual([{ date: '2026-08-01', amount: 400 }]);
  });

  it('reports nothing outstanding when everything is paid', () => {
    expect(outstandingLots(0, [line('2026-06-01', 1000), line('2026-07-15', -1000)])).toEqual([]);
  });

  it('keeps the opening balance as a dateless lot', () => {
    expect(outstandingLots(2000, [])).toEqual([{ date: null, amount: 2000 }]);
  });

  it('treats a negative opening balance as credit already in hand', () => {
    expect(outstandingLots(-500, [line('2026-07-01', 800)])).toEqual([
      { date: '2026-07-01', amount: 300 },
    ]);
  });

  it('is empty for a contact with no history', () => {
    expect(outstandingLots(0, [])).toEqual([]);
  });
});

describe('computeOverdue', () => {
  const lotsFrom = (rows: StatementLine[], opening = 0) => outstandingLots(opening, rows);

  it('reports a debt past its term', () => {
    const result = computeOverdue(lotsFrom([line('2026-06-01', 1000)]), 30, TODAY);
    expect(result).toEqual({ amount: 1000, daysLate: 36 });
  });

  it('says nothing about a debt still inside its term', () => {
    expect(computeOverdue(lotsFrom([line('2026-08-01', 1000)]), 30, TODAY).amount).toBe(0);
  });

  /** The due date itself is not late — the customer still has that day. */
  it('is not late on the due date, and is late the day after', () => {
    expect(computeOverdue(lotsFrom([line('2026-07-07', 100)]), 30, TODAY).amount).toBe(0);
    expect(computeOverdue(lotsFrom([line('2026-07-06', 100)]), 30, TODAY)).toEqual({
      amount: 100,
      daysLate: 1,
    });
  });

  /**
   * No agreed term means no deadline. The app must not invent one and then
   * nag a customer about it.
   */
  it('never reports a contact with no term', () => {
    expect(computeOverdue(lotsFrom([line('2020-01-01', 999)]), null, TODAY).amount).toBe(0);
  });

  it('supports a same-day term', () => {
    expect(computeOverdue(lotsFrom([line('2026-08-05', 100)]), 0, TODAY).amount).toBe(100);
    expect(computeOverdue(lotsFrom([line('2026-08-06', 100)]), 0, TODAY).amount).toBe(0);
  });

  /** An opening balance has no date, so there is no honest way to age it. */
  it('cannot age the opening balance and does not pretend to', () => {
    expect(computeOverdue(lotsFrom([], 5000), 30, TODAY).amount).toBe(0);
  });

  it('counts only the slices that are late, not the whole balance', () => {
    const lots = lotsFrom([
      line('2026-05-01', 2000),
      line('2026-06-10', -2000),
      line('2026-06-15', 1500),
      line('2026-08-04', 700),
    ]);
    const result = computeOverdue(lots, 30, TODAY);
    expect(result.amount).toBe(1500);
    expect(result.daysLate).toBe(22);
  });

  it('ages by the oldest late slice when several are overdue', () => {
    const lots = lotsFrom([line('2026-05-01', 100), line('2026-06-01', 100)]);
    const result = computeOverdue(lots, 30, TODAY);
    expect(result.amount).toBe(200);
    expect(result.daysLate).toBe(67);
  });
});
