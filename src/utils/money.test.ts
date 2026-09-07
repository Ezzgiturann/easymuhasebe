import { formatKurus, formatTRY, kurusToInput, parseAmountToKurus } from './money';

describe('formatKurus', () => {
  it('uses Turkish separators', () => {
    expect(formatKurus(125000)).toBe('1.250,00');
    expect(formatKurus(7)).toBe('0,07');
    expect(formatKurus(0)).toBe('0,00');
  });

  it('keeps the sign in front', () => {
    expect(formatKurus(-125000)).toBe('-1.250,00');
  });

  it('appends the lira sign in formatTRY', () => {
    expect(formatTRY(50000)).toBe('500,00 ₺');
  });
});

describe('parseAmountToKurus', () => {
  it('accepts either decimal separator', () => {
    expect(parseAmountToKurus('12,5')).toBe(1250);
    expect(parseAmountToKurus('12.5')).toBe(1250);
  });

  it('treats unparseable input as zero rather than NaN', () => {
    expect(parseAmountToKurus('abc')).toBe(0);
    expect(parseAmountToKurus('')).toBe(0);
  });

  it('ignores spaces', () => {
    expect(parseAmountToKurus(' 1 2 ')).toBe(1200);
  });
});

/**
 * The pairing that matters: an amount read out of the database, put back into a
 * form field, and saved again must come back unchanged.
 *
 * Using `formatKurus` here instead of `kurusToInput` was a real bug — its
 * thousand separators parse back as NaN, so editing a 1.250,00 ₺ transaction
 * would have silently saved it as zero.
 */
describe('kurusToInput round-trips through parseAmountToKurus', () => {
  const cases = [1, 5, 50, 99, 100, 101, 150, 999, 1000, 12345, 68000, 100000, 123456789, 200000000];

  it.each(cases)('%i kuruş survives the round trip', (kurus) => {
    expect(parseAmountToKurus(kurusToInput(kurus))).toBe(kurus);
  });

  it('drops the decimals when there are no kuruş', () => {
    expect(kurusToInput(68000)).toBe('680');
  });

  it('pads a single-digit kuruş', () => {
    expect(kurusToInput(105)).toBe('1,05');
  });

  /**
   * The bug this covers: `Math.floor` rounds a negative AWAY from zero while `%`
   * keeps its sign, so -2599 came out as "-26,-99". That parses back to 0, so
   * editing a negative amount — a credit-card box carrying a debt, or a restored
   * backup — silently erased it.
   */
  it.each([-1, -5, -99, -100, -105, -2599, -123456789])(
    '%i kuruş survives the round trip too',
    (kurus) => {
      expect(parseAmountToKurus(kurusToInput(kurus))).toBe(kurus);
    },
  );

  it('writes a negative as one minus in front, not one per part', () => {
    expect(kurusToInput(-2599)).toBe('-25,99');
    expect(kurusToInput(-100)).toBe('-1');
  });

  it('has no negative zero', () => {
    expect(kurusToInput(-0)).toBe('0');
  });

  it('emits no thousand separator, which is what makes the round trip work', () => {
    expect(kurusToInput(123456789)).toBe('1234567,89');
    expect(formatKurus(123456789)).toBe('1.234.567,89');
  });
});
