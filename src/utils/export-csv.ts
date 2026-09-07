/**
 * The file the accountant actually opens.
 *
 * The JSON backup already exists but is only good for restoring into this app —
 * nobody's mali müşavir reads it. This produces a spreadsheet.
 *
 * Two things are non-negotiable for Excel in a Turkish locale, and both are
 * silent failures if you get them wrong:
 *
 *  - **Semicolon, not comma.** Turkish Windows uses `,` as the decimal mark, so
 *    a comma-separated file puts "1.250,00" in two columns and every amount is
 *    destroyed.
 *  - **UTF-8 BOM.** Without it Excel reads the bytes as its legacy code page and
 *    "Kırtasiye" arrives as "KÄ±rtasiye".
 *
 * Pure and string-based so it can be tested without a device.
 */

import { TX_KIND_LABELS, KASA_LABELS } from '@/constants/labels';
import type { KasaType, TxKind } from '@/db/schema/transactions';

/** Byte-order mark. Excel needs it; every other tool ignores it. */
const BOM = '﻿';
const SEP = ';';

export const CSV_HEADERS = [
  'Tarih',
  'Tür',
  'Tutar',
  'Yön',
  'Kasa',
  'Kategori',
  'Cari',
  'Açıklama',
  'Not',
] as const;

/** One transaction as the export needs it. */
export interface ExportRow {
  txDate: string;
  kind: TxKind;
  /** SIGNED kuruş is not used here — the headline amount stays unsigned and
   *  `Yön` carries the direction, which is how a bookkeeper reads a statement. */
  amount: number;
  kasaType: KasaType | null;
  toKasaType?: KasaType | null;
  categoryName: string | null;
  contactName: string | null;
  description: string | null;
  note?: string | null;
}

/**
 * Escape one cell.
 *
 * A leading `=`, `+`, `-` or `@` makes Excel treat the text as a formula — a
 * cari named "=SUM(A1)" would execute rather than display. Prefixing a
 * apostrophe is the standard defence and is invisible in the sheet.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  // Quote when the cell could otherwise break the row apart.
  if (/[";\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

/** Kuruş as Excel-friendly Turkish decimal: 125000 → "1250,00". */
export function csvAmount(kurus: number): string {
  const sign = kurus < 0 ? '-' : '';
  const abs = Math.abs(Math.round(kurus));
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** "Nakit", or "Nakit → Banka" for a transfer, or "Veresiye" when no box moved. */
function kasaCell(row: ExportRow): string {
  if (row.kind === 'transfer') {
    const from = row.kasaType ? KASA_LABELS[row.kasaType] : '?';
    const to = row.toKasaType ? KASA_LABELS[row.toKasaType] : '?';
    return `${from} → ${to}`;
  }
  return row.kasaType ? KASA_LABELS[row.kasaType] : 'Veresiye';
}

/**
 * Money in or out, in words. A transfer is neither, and saying "Çıkan" would
 * make the accountant book a loss the business never had.
 */
function directionCell(kind: TxKind): string {
  if (kind === 'transfer') return 'Aktarım';
  return kind === 'cash_in' || kind === 'credit_sale' || kind === 'collect_customer'
    ? 'Giren'
    : 'Çıkan';
}

/** The whole file, ready to write to disk. */
export function buildCsv(rows: ExportRow[]): string {
  const lines = [CSV_HEADERS.join(SEP)];

  for (const row of rows) {
    lines.push(
      [
        csvCell(row.txDate),
        csvCell(TX_KIND_LABELS[row.kind]),
        csvCell(csvAmount(row.amount)),
        csvCell(directionCell(row.kind)),
        csvCell(kasaCell(row)),
        csvCell(row.categoryName),
        csvCell(row.contactName),
        csvCell(row.description),
        csvCell(row.note),
      ].join(SEP),
    );
  }

  // CRLF: Excel on Windows is the target reader and it is the safest line ending
  // for it; every other tool copes.
  return BOM + lines.join('\r\n') + '\r\n';
}

/** `easy-hesap-Dukkan-2026-03.csv` — sortable, and says what is inside. */
export function csvFileName(accountName: string, start: string, end: string): string {
  const slug =
    accountName
      .toLocaleLowerCase('tr-TR')
      .replace(/[ğ]/g, 'g')
      .replace(/[ü]/g, 'u')
      .replace(/[ş]/g, 's')
      .replace(/[ı]/g, 'i')
      .replace(/[ö]/g, 'o')
      .replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'hesap';
  return `easy-hesap-${slug}-${start}_${end}.csv`;
}
