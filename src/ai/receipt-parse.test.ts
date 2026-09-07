import { _readDate, EMPTY_READING, matchCategory, parseReceiptReply } from './receipt-parse';

describe('parseReceiptReply', () => {
  it('reads a complete receipt', () => {
    expect(
      parseReceiptReply('{"amount": 50.00, "category": "Market", "description": "A101", "date": "2020-08-11"}'),
    ).toEqual({
      amountKurus: 5000,
      categoryName: 'Market',
      description: 'A101',
      txDate: '2020-08-11',
    });
  });

  it('reads kuruş without losing the last one', () => {
    expect(parseReceiptReply('{"amount": 12.5}').amountKurus).toBe(1250);
    expect(parseReceiptReply('{"amount": 1234.56}').amountKurus).toBe(123456);
  });

  /** Floating point: 19.99 * 100 is 1998.9999999999998. */
  it('does not lose a kuruş to binary rounding', () => {
    expect(parseReceiptReply('{"amount": 19.99}').amountKurus).toBe(1999);
    expect(parseReceiptReply('{"amount": 0.07}').amountKurus).toBe(7);
  });

  it('keeps the fields it could read and drops the rest', () => {
    expect(parseReceiptReply('{"amount": 50}')).toEqual({
      ...EMPTY_READING,
      amountKurus: 5000,
    });
  });

  it('treats an empty object as an unreadable receipt', () => {
    expect(parseReceiptReply('{}')).toEqual(EMPTY_READING);
  });

  it.each([
    ['not json at all', 'Bu bir fiş değil gibi görünüyor.'],
    ['an array', '[1,2,3]'],
    ['null', 'null'],
    ['empty', ''],
  ])('survives %s', (_label, raw) => {
    expect(parseReceiptReply(raw)).toEqual(EMPTY_READING);
  });

  it('unwraps a fenced reply', () => {
    expect(parseReceiptReply('```json\n{"amount": 7}\n```').amountKurus).toBe(700);
  });

  /**
   * The whole point of the module: a number it cannot stand behind is dropped,
   * because a blank field costs four taps and a wrong one costs money.
   */
  it.each([
    ['zero', '{"amount": 0}'],
    ['negative', '{"amount": -50}'],
    ['a word', '{"amount": "elli"}'],
    ['null', '{"amount": null}'],
    ['absurd', '{"amount": 99999999}'],
  ])('refuses %s as an amount', (_label, raw) => {
    expect(parseReceiptReply(raw).amountKurus).toBeNull();
  });

  it('accepts a numeric string, since models quote numbers', () => {
    expect(parseReceiptReply('{"amount": "50.00"}').amountKurus).toBe(5000);
  });

  it('caps a runaway description rather than dropping it', () => {
    const long = 'A'.repeat(500);
    expect(parseReceiptReply(`{"description": "${long}"}`).description).toHaveLength(60);
  });
});

describe('date reading', () => {
  it('accepts a past date', () => {
    expect(_readDate('2026-08-11', '2026-08-11')).toBe('2026-08-11');
    expect(_readDate('2020-01-01', '2026-08-11')).toBe('2020-01-01');
  });

  /** A receipt dated tomorrow is a misread year or a swapped day/month. */
  it('refuses a future date', () => {
    expect(_readDate('2026-08-12', '2026-08-11')).toBeNull();
  });

  it('refuses a day that does not exist', () => {
    expect(_readDate('2026-02-31', '2026-12-31')).toBeNull();
  });

  it.each(['11.08.2026', '2026/08/11', '11 Ağustos', '', 'yesterday'])(
    'refuses the malformed %p',
    (value) => {
      expect(_readDate(value, '2026-12-31')).toBeNull();
    },
  );
});

describe('matchCategory', () => {
  const available = ['Market', 'Akaryakıt', 'Kira'];

  it('matches ignoring case and spacing', () => {
    expect(matchCategory('  market ', available)).toBe('Market');
  });

  /** Turkish casing: 'AKARYAKIT'.toLowerCase() is 'akaryakit' in en-US. */
  it('matches Turkish letters correctly', () => {
    expect(matchCategory('AKARYAKIT', available)).toBe('Akaryakıt');
  });

  /**
   * Never fuzzy: filing an expense under a category the user did not choose is
   * worse than leaving the one already on the form.
   */
  it('refuses a near miss', () => {
    expect(matchCategory('Market Gideri', available)).toBeNull();
    expect(matchCategory('Marketler', available)).toBeNull();
  });

  it('handles nothing scanned', () => {
    expect(matchCategory(null, available)).toBeNull();
  });
});
