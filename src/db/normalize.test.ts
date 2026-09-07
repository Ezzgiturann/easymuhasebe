import { normalizeDescription } from './normalize';

describe('normalizeDescription', () => {
  /**
   * The whole point: JS `toLowerCase()` mangles the dotted/dotless i pair, so
   * "İstanbul", "ISTANBUL" and "ıstanbul" would otherwise become three different
   * keys — and a user searching one would never find the others.
   */
  it('folds the entire i family to a plain i', () => {
    const forms = ['İstanbul', 'ISTANBUL', 'ıstanbul', 'istanbul', 'İSTANBUL'];
    for (const form of forms) expect(normalizeDescription(form)).toBe('istanbul');
  });

  it('folds the other Turkish letters', () => {
    expect(normalizeDescription('ÇAY ŞEKER GÜNLÜK')).toBe('cay seker gunluk');
    expect(normalizeDescription('Köfteci Yusuf')).toBe('kofteci yusuf');
    expect(normalizeDescription('Öğle')).toBe('ogle');
  });

  it('collapses surrounding and repeated whitespace', () => {
    expect(normalizeDescription('  Işık   Ticaret ')).toBe('isik ticaret');
  });

  it('returns an empty string for nothing at all', () => {
    expect(normalizeDescription(null)).toBe('');
    expect(normalizeDescription(undefined)).toBe('');
    expect(normalizeDescription('')).toBe('');
  });

  it('leaves digits and punctuation alone — it folds letters, it does not clean', () => {
    expect(normalizeDescription('A-101')).toBe('a-101');
    expect(normalizeDescription('ekmek, süt')).toBe('ekmek, sut');
  });

  it('is idempotent, so normalising a stored key again is safe', () => {
    const once = normalizeDescription('İşçi Ücreti');
    expect(normalizeDescription(once)).toBe(once);
  });
});
