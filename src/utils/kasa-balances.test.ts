import { kasaBalances, kasaTotal, type AccountOpening } from './kasa-balances';
import { KASA_TYPES } from '@/db/schema/transactions';

const NO_OPENING: AccountOpening = { openingBalance: 0, openingKasaType: null };

const totalOf = (rows: Parameters<typeof kasaBalances>[0], opening = NO_OPENING) =>
  Object.fromEntries(kasaBalances(rows, opening).map((b) => [b.kasaType, b.total]));

describe('kasaBalances', () => {
  it('returns every box even when nothing has been recorded', () => {
    const balances = kasaBalances([], NO_OPENING);
    expect(balances.map((b) => b.kasaType)).toEqual([...KASA_TYPES]);
    expect(balances.every((b) => b.total === 0)).toBe(true);
  });

  it('keeps each box separate', () => {
    expect(
      totalOf([
        { kasaType: 'nakit', total: 80000 },
        { kasaType: 'banka', total: 42000 },
      ]),
    ).toEqual({ nakit: 80000, banka: 42000, kredi_karti: 0 });
  });

  it('adds up repeated rows for the same box', () => {
    expect(
      totalOf([
        { kasaType: 'nakit', total: 1000 },
        { kasaType: 'nakit', total: -400 },
      ]).nakit,
    ).toBe(600);
  });

  /** A category or contact posting has no box; guessing one would misreport cash. */
  it('ignores a row with no kasaType', () => {
    expect(totalOf([{ kasaType: null, total: 99999 }])).toEqual({
      nakit: 0,
      banka: 0,
      kredi_karti: 0,
    });
  });

  /**
   * The gap this closes: a shopkeeper who already had 5.000 in the till had no
   * way to say so except by inventing an income, which inflated that month's
   * takings for good.
   */
  describe('opening balance', () => {
    it('lands in the box it was recorded against', () => {
      expect(totalOf([], { openingBalance: 500000, openingKasaType: 'nakit' })).toEqual({
        nakit: 500000,
        banka: 0,
        kredi_karti: 0,
      });
    });

    it('adds to what that box has since moved', () => {
      const totals = totalOf([{ kasaType: 'nakit', total: -120000 }], {
        openingBalance: 500000,
        openingKasaType: 'nakit',
      });
      expect(totals.nakit).toBe(380000);
    });

    it('can be a bank balance rather than cash', () => {
      const totals = totalOf([], { openingBalance: 1200000, openingKasaType: 'banka' });
      expect(totals).toEqual({ nakit: 0, banka: 1200000, kredi_karti: 0 });
    });

    /** A card box can legitimately be negative — it is a debt, not a stash. */
    it('accepts a negative opening balance', () => {
      expect(totalOf([], { openingBalance: -25000, openingKasaType: 'kredi_karti' }).kredi_karti).toBe(
        -25000,
      );
    });

    it('is ignored when no box was chosen for it', () => {
      expect(totalOf([], { openingBalance: 500000, openingKasaType: null })).toEqual({
        nakit: 0,
        banka: 0,
        kredi_karti: 0,
      });
    });
  });
});

describe('kasaTotal', () => {
  it('is what the account holds across every box', () => {
    const balances = kasaBalances(
      [
        { kasaType: 'nakit', total: 80000 },
        { kasaType: 'kredi_karti', total: -25000 },
      ],
      { openingBalance: 500000, openingKasaType: 'banka' },
    );
    expect(kasaTotal(balances)).toBe(555000);
  });

  it('is zero for an untouched account', () => {
    expect(kasaTotal(kasaBalances([], NO_OPENING))).toBe(0);
  });
});
