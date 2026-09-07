import { buildCsv, csvAmount, csvCell, csvFileName, CSV_HEADERS, type ExportRow } from './export-csv';

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  txDate: '2026-03-10',
  kind: 'cash_in',
  amount: 125000,
  kasaType: 'nakit',
  categoryName: 'Satış',
  contactName: null,
  description: null,
  ...over,
});

const lines = (rows: ExportRow[]) => buildCsv(rows).split('\r\n');

/**
 * A real quote-aware split, not `String.split(';')` — otherwise a correctly
 * quoted cell containing a semicolon would look like a broken row and the test
 * would be checking the wrong thing. Doubles as proof the output parses back.
 */
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') {
      out.push(cell);
      cell = '';
    } else cell += ch;
  }
  out.push(cell);
  return out;
}

const cells = (rows: ExportRow[], i = 1) => parseLine(lines(rows)[i]);

describe('csvAmount', () => {
  /** Turkish Excel reads "," as the decimal mark; a dot would land as text. */
  it('writes kuruş as a Turkish decimal', () => {
    expect(csvAmount(125000)).toBe('1250,00');
    expect(csvAmount(5)).toBe('0,05');
    expect(csvAmount(50)).toBe('0,50');
    expect(csvAmount(0)).toBe('0,00');
  });

  it('keeps the sign on a negative', () => {
    expect(csvAmount(-2599)).toBe('-25,99');
  });

  it('never loses a kuruş to floating point', () => {
    expect(csvAmount(999999999)).toBe('9999999,99');
  });
});

describe('csvCell', () => {
  it('leaves ordinary text alone', () => {
    expect(csvCell('Ahmet Yılmaz')).toBe('Ahmet Yılmaz');
  });

  it('renders null and undefined as empty', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  /** A raw semicolon would split one cell into two and shift the whole row. */
  it('quotes a value containing the separator', () => {
    expect(csvCell('kira; mart')).toBe('"kira; mart"');
  });

  it('quotes and doubles an embedded quote', () => {
    expect(csvCell('12" boru')).toBe('"12"" boru"');
  });

  it('quotes a value containing a newline', () => {
    expect(csvCell('birinci\nikinci')).toBe('"birinci\nikinci"');
  });

  /**
   * Excel executes a cell starting with = + - or @. A description typed as
   * "=1+1" — or a hostile one — must arrive as text, not as a formula.
   */
  it.each(['=SUM(A1)', '+1', '-1', '@cmd'])('defuses the formula %p', (value) => {
    expect(csvCell(value)).toBe(`'${value}`);
  });

  it('still quotes a defused value that also holds a separator', () => {
    expect(csvCell('=a;b')).toBe(`"'=a;b"`);
  });
});

describe('buildCsv', () => {
  it('starts with a BOM so Excel reads Turkish characters', () => {
    expect(buildCsv([]).charCodeAt(0)).toBe(0xfeff);
  });

  it('writes the header even with no rows', () => {
    expect(lines([])[0]).toBe('﻿' + CSV_HEADERS.join(';'));
  });

  it('writes one line per transaction and ends with a newline', () => {
    const csv = buildCsv([row(), row()]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.trimEnd().split('\r\n')).toHaveLength(3);
  });

  it('lays a cash sale out in the documented column order', () => {
    expect(cells([row({ description: 'ekmek' })])).toEqual([
      '2026-03-10',
      'Gelir',
      '1250,00',
      'Giren',
      'Nakit',
      'Satış',
      '',
      'ekmek',
      '',
    ]);
  });

  it('names the person on a veresiye and says no cash box moved', () => {
    const c = cells([
      row({ kind: 'credit_sale', kasaType: null, contactName: 'Ahmet', categoryName: 'Satış' }),
    ]);
    expect(c[1]).toBe('Veresiye satış');
    expect(c[4]).toBe('Veresiye');
    expect(c[6]).toBe('Ahmet');
  });

  /**
   * A transfer is neither income nor expense. Printing "Çıkan" would have the
   * accountant book a loss the business never had.
   */
  it('marks a transfer as Aktarım and names both boxes', () => {
    const c = cells([
      row({ kind: 'transfer', kasaType: 'nakit', toKasaType: 'banka', categoryName: null }),
    ]);
    expect(c[3]).toBe('Aktarım');
    expect(c[4]).toBe('Nakit → Banka');
  });

  it('calls a collection money coming in', () => {
    expect(cells([row({ kind: 'collect_customer', contactName: 'Ahmet', categoryName: null })])[3]).toBe(
      'Giren',
    );
  });

  it('calls a payment to a supplier money going out', () => {
    expect(cells([row({ kind: 'pay_supplier', contactName: 'Toptancı', categoryName: null })])[3]).toBe(
      'Çıkan',
    );
  });

  it('keeps a row intact when the description holds a semicolon', () => {
    const c = cells([row({ description: 'kira; mart ayı' })]);
    expect(c).toHaveLength(CSV_HEADERS.length);
    expect(c[7]).toBe('kira; mart ayı');
  });

  it('round-trips a description containing a quote', () => {
    expect(cells([row({ description: '12" boru' })])[7]).toBe('12" boru');
  });
});

describe('csvFileName', () => {
  it('folds Turkish characters and spaces into a safe slug', () => {
    expect(csvFileName('Dükkan Şubesi', '2026-03-01', '2026-03-31')).toBe(
      'easy-hesap-dukkan-subesi-2026-03-01_2026-03-31.csv',
    );
  });

  it('falls back when the name has nothing usable in it', () => {
    expect(csvFileName('!!!', '2026-03-01', '2026-03-31')).toBe(
      'easy-hesap-hesap-2026-03-01_2026-03-31.csv',
    );
  });

  it('does not run away with a very long account name', () => {
    const name = csvFileName('a'.repeat(100), '2026-03-01', '2026-03-31');
    expect(name.length).toBeLessThan(70);
  });
});
