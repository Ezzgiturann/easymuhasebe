import { describeProposal, isTransferProposal, parseReply, validateProposal } from './proposal-parse';
import { today } from '@/db/dates';

/** Narrow a result that the test expects to have succeeded. */
function ok(data: unknown) {
  const result = validateProposal(data);
  if ('error' in result) throw new Error(`beklenmedik hata: ${result.error}`);
  return result.proposal;
}

function err(data: unknown): string {
  const result = validateProposal(data);
  if (!('error' in result)) throw new Error('hata bekleniyordu, öneri geldi');
  return result.error;
}

const CASH_IN = { amount: 500, direction: 'in', method: 'nakit', category: 'Satış' };

describe('validateProposal — amount', () => {
  /** Lira in, kuruş out. Getting this backwards would be a 100× error. */
  it('converts lira to kuruş', () => {
    expect(ok({ ...CASH_IN, amount: 12.5 }).amount).toBe(1250);
  });

  it('accepts a numeric string, which JSON often carries', () => {
    expect(ok({ ...CASH_IN, amount: '250' }).amount).toBe(25000);
  });

  it('rounds rather than truncating a third decimal', () => {
    expect(ok({ ...CASH_IN, amount: 10.005 }).amount).toBe(1001);
  });

  it.each([0, -5, 'abc', null, undefined, NaN, Infinity])('rejects amount %p', (amount) => {
    expect(err({ ...CASH_IN, amount })).toMatch(/Tutar/);
  });
});

describe('validateProposal — ordinary movements', () => {
  it('reads a cash sale', () => {
    const p = ok(CASH_IN);
    expect(p).toMatchObject({ direction: 'in', method: 'nakit', categoryName: 'Satış', toMethod: null });
  });

  it('defaults the date to today when none is given', () => {
    expect(ok(CASH_IN).txDate).toBe(today());
  });

  it('keeps a well-formed date', () => {
    expect(ok({ ...CASH_IN, date: '2026-03-10' }).txDate).toBe('2026-03-10');
  });

  it('falls back to today on a malformed date rather than storing nonsense', () => {
    expect(ok({ ...CASH_IN, date: '10/03/2026' }).txDate).toBe(today());
  });

  it.each([undefined, 'sideways', 'IN'])('rejects direction %p', (direction) => {
    expect(err({ ...CASH_IN, direction })).toMatch(/girdi mi/);
  });

  it.each([undefined, 'kripto', 'cash'])('rejects method %p', (method) => {
    expect(err({ ...CASH_IN, method })).toMatch(/Ödeme yöntemi/);
  });

  /**
   * A veresiye needs both sides. Letting either through would crash in
   * `buildEntries` at save time, after the user already tapped Kaydet.
   */
  it('rejects a veresiye with no contact', () => {
    expect(err({ amount: 500, direction: 'out', method: 'veresiye', category: 'Mal Alımı' })).toMatch(
      /kişi/,
    );
  });

  it('rejects a booked movement with no category', () => {
    expect(err({ amount: 500, direction: 'out', method: 'nakit' })).toMatch(/kategori/);
  });

  /** Settling a debt is not new income; a category here would double-count it. */
  it('drops a category the model attached to a collection', () => {
    const p = ok({ amount: 500, direction: 'in', method: 'nakit', contact: 'Ahmet', category: 'Satış' });
    expect(p.categoryName).toBeNull();
    expect(p.contactName).toBe('Ahmet');
  });

  it('treats a blank string as an absent field', () => {
    expect(err({ amount: 500, direction: 'out', method: 'nakit', category: '   ' })).toMatch(/kategori/);
  });
});

/**
 * The gap this closes: the assistant had no way to say "money changed pocket",
 * so "kasayı bankaya yatırdım" came back as an expense — the same double-count
 * the entry form was fixed for.
 */
describe('validateProposal — transfer', () => {
  const TRANSFER = { amount: 5000, method: 'nakit', toMethod: 'banka' };

  it('reads a transfer with no direction at all', () => {
    const p = ok(TRANSFER);
    expect(p).toMatchObject({ amount: 500000, method: 'nakit', toMethod: 'banka' });
    expect(isTransferProposal(p)).toBe(true);
  });

  it('books no category and no contact, whatever the model attached', () => {
    const p = ok({ ...TRANSFER, category: 'Satış', contact: 'Ahmet' });
    expect(p.categoryName).toBeNull();
    expect(p.contactName).toBeNull();
  });

  it('keeps the description, which is the only free text worth having', () => {
    expect(ok({ ...TRANSFER, description: 'akşam hasılatı' }).description).toBe('akşam hasılatı');
  });

  it('refuses the two ends being the same box', () => {
    expect(err({ ...TRANSFER, toMethod: 'nakit' })).toMatch(/aynı kasa/);
  });

  it.each(['veresiye', 'kripto', 5])('refuses %p as a destination', (toMethod) => {
    expect(err({ ...TRANSFER, toMethod })).toMatch(/hangi kasaya/);
  });

  it('refuses veresiye as a source — a debt is not a cash box', () => {
    expect(err({ ...TRANSFER, method: 'veresiye' })).toMatch(/hangi kasadan/);
  });

  /** An explicit null must read as "not a transfer", not as a broken one. */
  it('treats a null toMethod as an ordinary movement', () => {
    expect(ok({ ...CASH_IN, toMethod: null }).toMethod).toBeNull();
  });
});

describe('parseReply', () => {
  it('returns prose untouched when there is no block', () => {
    expect(parseReply('Ahmet sana 250 lira borçlu.')).toEqual({
      message: 'Ahmet sana 250 lira borçlu.',
      proposal: null,
      error: null,
    });
  });

  it('strips the block out of the message', () => {
    const parsed = parseReply(
      'Şunu kaydedeyim mi?\n```kayit\n{"amount":500,"direction":"in","method":"nakit","category":"Satış"}\n```',
    );
    expect(parsed.message).toBe('Şunu kaydedeyim mi?');
    expect(parsed.proposal?.amount).toBe(50000);
  });

  /**
   * A block the model meant as a record must never vanish quietly — the user
   * would sit waiting for a confirmation card that is never coming.
   */
  it('reports unparseable JSON instead of dropping it', () => {
    const parsed = parseReply('Tamam.\n```kayit\n{bozuk json\n```');
    expect(parsed.proposal).toBeNull();
    expect(parsed.error).toMatch(/okunamadı/);
    expect(parsed.message).toBe('Tamam.');
  });

  it('reports a block that parses but cannot be used', () => {
    const parsed = parseReply('Tamam.\n```kayit\n{"amount":0}\n```');
    expect(parsed.error).toMatch(/Tutar/);
  });
});

describe('describeProposal', () => {
  it('names the two cash boxes for a transfer, with no plus or minus', () => {
    const p = ok({ amount: 5000, method: 'nakit', toMethod: 'banka' });
    expect(describeProposal(p)).toBe('Aktarım 5.000,00 ₺ · Nakit → Banka');
  });

  it('reads a cash sale as money coming in', () => {
    expect(describeProposal(ok(CASH_IN))).toBe('Giren 500,00 ₺ · Nakit · Satış');
  });

  it('includes the person on a veresiye', () => {
    const p = ok({ amount: 100, direction: 'out', method: 'veresiye', contact: 'Ahmet', category: 'Mal Alımı' });
    expect(describeProposal(p)).toBe('Çıkan 100,00 ₺ · Veresiye · Ahmet · Mal Alımı');
  });
});
