import { contactMatches, prepareTerm, transactionMatches, type SearchTerm } from './search';

const term = (query: string): SearchTerm => {
  const prepared = prepareTerm(query);
  if (!prepared) throw new Error(`"${query}" was rejected as too short`);
  return prepared;
};

const tx = (over: Partial<Parameters<typeof transactionMatches>[1]> = {}) => ({
  amount: 0,
  description: null,
  note: null,
  categoryName: null,
  contactName: null,
  ...over,
});

describe('prepareTerm', () => {
  it('rejects a single letter, which would match half the ledger', () => {
    expect(prepareTerm('a')).toBeNull();
    expect(prepareTerm('')).toBeNull();
    expect(prepareTerm('   ')).toBeNull();
  });

  it('accepts a single digit, because amounts are worth searching', () => {
    expect(prepareTerm('5')).not.toBeNull();
  });

  it('accepts two letters', () => {
    expect(prepareTerm('ab')).not.toBeNull();
  });
});

describe('transactionMatches', () => {
  /** Same folding as the auto-recognition keys, so search finds what the user typed. */
  it.each(['istanbul', 'İSTANBUL', 'ıstanbul', 'İstanbul'])(
    '"%s" finds a description written as "İstanbul Nakliye"',
    (query) => {
      expect(transactionMatches(term(query), tx({ description: 'İstanbul Nakliye' }))).toBe(true);
    },
  );

  it('searches the note, category and contact as well as the description', () => {
    const row = tx({ note: 'Kapora ödendi', categoryName: 'Mal Alımı', contactName: 'Köfteci Yusuf' });
    expect(transactionMatches(term('kapora'), row)).toBe(true);
    expect(transactionMatches(term('MAL ALIMI'), row)).toBe(true);
    expect(transactionMatches(term('köfteci'), row)).toBe(true);
    expect(transactionMatches(term('kofteci'), row)).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(transactionMatches(term('ankara'), tx({ description: 'İstanbul Nakliye' }))).toBe(false);
  });

  describe('amount matching works on the lira part', () => {
    it('finds an amount by its digits', () => {
      expect(transactionMatches(term('1250'), tx({ amount: 125000 }))).toBe(true);
      expect(transactionMatches(term('500'), tx({ amount: 50000 }))).toBe(true);
    });

    /** Deliberately a substring: someone half-remembering an amount types the
     *  digits they recall, so 500 surfacing 1.500,00 ₺ is the intended trade. */
    it('is loose on purpose', () => {
      expect(transactionMatches(term('500'), tx({ amount: 150000 }))).toBe(true);
    });

    it('still rules out unrelated amounts', () => {
      expect(transactionMatches(term('500'), tx({ amount: 30000 }))).toBe(false);
    });

    it('ignores the kuruş part', () => {
      expect(transactionMatches(term('1250'), tx({ amount: 1250 }))).toBe(false);
    });
  });
});

describe('contactMatches', () => {
  const ahmet = { name: 'Ahmet Yılmaz', phone: '0555 123 45 67' };

  it('matches either part of the name, folded', () => {
    expect(contactMatches(term('ahmet'), ahmet)).toBe(true);
    expect(contactMatches(term('YILMAZ'), ahmet)).toBe(true);
    expect(contactMatches(term('mehmet'), ahmet)).toBe(false);
  });

  it('matches a phone number regardless of how it is spaced', () => {
    expect(contactMatches(term('0555'), ahmet)).toBe(true);
    expect(contactMatches(term('05551234567'), ahmet)).toBe(true);
    expect(contactMatches(term('1234567'), ahmet)).toBe(true);
  });

  it('does not match digits against a contact with no phone', () => {
    expect(contactMatches(term('555'), { name: 'Veli', phone: null })).toBe(false);
  });
});
