import {
  effectiveCategory,
  matchContacts,
  MAX_CONTACT_MATCHES,
  saveBlocker,
  type BlockerInput,
} from './tx-form';

const CATEGORIES = [
  { id: 'satis', kind: 'income' as const },
  { id: 'kira', kind: 'expense' as const },
];

describe('effectiveCategory', () => {
  it('accepts a category that matches the direction', () => {
    expect(effectiveCategory(CATEGORIES, 'satis', 'in')?.id).toBe('satis');
    expect(effectiveCategory(CATEGORIES, 'kira', 'out')?.id).toBe('kira');
  });

  /**
   * The mis-booking this closes: the prefill comes from the last transaction, so
   * an income category could sit under "Verdim". `monthlyTotalsQuery` flips the
   * sign by the CATEGORY's kind, so that expense would be subtracted from the
   * month's income — hiding the spending and shrinking the takings at once.
   */
  it('refuses an income category while money is going out', () => {
    expect(effectiveCategory(CATEGORIES, 'satis', 'out')).toBeUndefined();
  });

  it('refuses an expense category while money is coming in', () => {
    expect(effectiveCategory(CATEGORIES, 'kira', 'in')).toBeUndefined();
  });

  it('has no category at all during a transfer', () => {
    expect(effectiveCategory(CATEGORIES, 'kira', 'transfer')).toBeUndefined();
  });

  it('returns undefined for nothing selected or an id that no longer exists', () => {
    expect(effectiveCategory(CATEGORIES, null, 'in')).toBeUndefined();
    expect(effectiveCategory(CATEGORIES, 'silinmis', 'in')).toBeUndefined();
  });
});

describe('saveBlocker', () => {
  const base: BlockerInput = {
    kind: 'cash_in',
    mode: 'in',
    amount: 25000,
    hasCategory: true,
    hasContact: false,
    fromKasa: 'nakit',
    toKasa: null,
  };

  it('lets a complete cash sale through', () => {
    expect(saveBlocker(base)).toBeNull();
  });

  it('asks for an amount before anything else', () => {
    expect(saveBlocker({ ...base, amount: 0, hasCategory: false })).toBe('Tutar gir.');
  });

  it('treats a negative amount as no amount', () => {
    expect(saveBlocker({ ...base, amount: -1 })).toBe('Tutar gir.');
  });

  it('asks for a category in the words of the direction', () => {
    expect(saveBlocker({ ...base, hasCategory: false })).toMatch(/ne için geldi/);
    expect(saveBlocker({ ...base, kind: 'cash_out', mode: 'out', hasCategory: false })).toMatch(
      /ne için gitti/,
    );
  });

  /** Labelled "(opsiyonel)" on screen for years while silently blocking Kaydet. */
  it('asks for the person on a veresiye', () => {
    expect(
      saveBlocker({ ...base, kind: 'credit_sale', hasCategory: true, hasContact: false }),
    ).toMatch(/Kimden/);
  });

  it('wants no category on a settlement', () => {
    expect(
      saveBlocker({
        ...base,
        kind: 'collect_customer',
        hasCategory: false,
        hasContact: true,
      }),
    ).toBeNull();
  });

  describe('transfer', () => {
    const transfer: BlockerInput = {
      ...base,
      kind: 'transfer',
      mode: 'transfer',
      hasCategory: false,
      fromKasa: 'nakit',
      toKasa: 'banka',
    };

    it('lets two different boxes through', () => {
      expect(saveBlocker(transfer)).toBeNull();
    });

    it('refuses the same box on both ends', () => {
      expect(saveBlocker({ ...transfer, toKasa: 'nakit' })).toMatch(/farklı kasa/);
    });

    it('refuses veresiye as a source — a debt is not a cash box', () => {
      expect(saveBlocker({ ...transfer, fromKasa: 'veresiye' })).toMatch(/farklı kasa/);
    });

    it('refuses a missing destination', () => {
      expect(saveBlocker({ ...transfer, toKasa: null })).toMatch(/farklı kasa/);
    });
  });
});

describe('matchContacts', () => {
  const CONTACTS = [
    { id: '1', name: 'Ahmet Yılmaz' },
    { id: '2', name: 'Ayşe Demir' },
    { id: '3', name: 'Mehmet Ahmetoğlu' },
  ];

  it('offers nothing until something is typed', () => {
    expect(matchContacts(CONTACTS, '')).toEqual([]);
    expect(matchContacts(CONTACTS, '   ')).toEqual([]);
  });

  it('matches anywhere in the name, not just the start', () => {
    expect(matchContacts(CONTACTS, 'ahmet').map((c) => c.id)).toEqual(['1', '3']);
  });

  /**
   * The Turkish trap: a plain `toLowerCase()` turns "Yılmaz" and "YILMAZ" into
   * different strings, so the real cari would stay hidden and the user would
   * create a duplicate.
   */
  it('finds a name whatever the case, including İ and ı', () => {
    expect(matchContacts(CONTACTS, 'YILMAZ').map((c) => c.id)).toEqual(['1']);
    expect(matchContacts(CONTACTS, 'ayşe').map((c) => c.id)).toEqual(['2']);
    expect(matchContacts(CONTACTS, 'AYŞE').map((c) => c.id)).toEqual(['2']);
  });

  /** Once they have landed on the person, repeating the name is noise. */
  it('goes quiet on an exact match', () => {
    expect(matchContacts(CONTACTS, 'Ahmet Yılmaz')).toEqual([]);
    expect(matchContacts(CONTACTS, '  ahmet yilmaz  ')).toEqual([]);
  });

  it('never returns more than fits under the field', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `Ahmet ${i}` }));
    expect(matchContacts(many, 'ahmet')).toHaveLength(MAX_CONTACT_MATCHES);
  });

  it('returns nothing when nobody matches', () => {
    expect(matchContacts(CONTACTS, 'zzz')).toEqual([]);
  });
});
