import { isStoredPin, isValidPin, isWeakPin, pinRejectionReason, PIN_LENGTH } from './pin';

describe('isValidPin', () => {
  it('accepts exactly four digits', () => {
    expect(isValidPin('4907')).toBe(true);
    expect(PIN_LENGTH).toBe(4);
  });

  it.each(['', '123', '12345', 'abcd', '12a4', '12 4', '１２３４'])('rejects %p', (pin) => {
    expect(isValidPin(pin)).toBe(false);
  });

  /** `\d` would otherwise let a trailing newline slip past a lazy anchor. */
  it('rejects digits with a newline glued on', () => {
    expect(isValidPin('1357\n')).toBe(false);
  });
});

describe('isWeakPin', () => {
  it.each(['0000', '1234', '4321', '1111', '2580'])('flags %s', (pin) => {
    expect(isWeakPin(pin)).toBe(true);
  });

  it('leaves an ordinary PIN alone', () => {
    expect(isWeakPin('4907')).toBe(false);
  });
});

describe('pinRejectionReason', () => {
  it('passes a good PIN', () => {
    expect(pinRejectionReason('4907')).toBeNull();
  });

  it('explains a wrong length before anything else', () => {
    expect(pinRejectionReason('12')).toMatch(/rakam/);
  });

  it('explains a guessable PIN', () => {
    expect(pinRejectionReason('1234')).toMatch(/tahmin/);
  });
});

describe('isStoredPin', () => {
  it('accepts a complete record', () => {
    expect(isStoredPin({ salt: 'aa', hash: 'bb' })).toBe(true);
  });

  /**
   * Storage can hand back anything — a half-written record, a value from an
   * older version, null. A missing field must read as "no PIN set" rather than
   * hashing against `undefined` and locking the owner out of their own ledger.
   */
  it.each([null, undefined, 'salt', 42, {}, { salt: 'aa' }, { hash: 'bb' }, { salt: '', hash: 'bb' }])(
    'rejects %p',
    (value) => {
      expect(isStoredPin(value)).toBe(false);
    },
  );
});
