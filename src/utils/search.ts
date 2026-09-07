/**
 * Text matching for the search screen.
 *
 * Matching happens in JS rather than SQL on purpose. SQLite's `LOWER()` does not
 * fold Turkish İ/ı, and only `transactions.descriptionNorm` has a normalised
 * column at all — `note`, `contacts.name` and `categories.name` do not. Running
 * everything through `normalizeDescription` on both sides is the only way "İSTANBUL",
 * "istanbul" and "ıstanbul" all match each other consistently across every field.
 *
 * The cost is loading the account's rows into memory, which the İşlemler tab
 * already does. If a ledger ever grows past a few thousand transactions this
 * should move into SQL with `*_norm` columns and an FTS5 table.
 */

import { normalizeDescription } from '@/db/normalize';

/** A term the user typed, prepared once and reused across every candidate row. */
export interface SearchTerm {
  /** Turkish-folded, lowercased text. Empty when the query is only punctuation. */
  text: string;
  /** Digits only, for amount matching. Empty when the query has no digits. */
  digits: string;
}

/** Below this we don't search at all — one letter matches most of the ledger. */
export const MIN_QUERY_LENGTH = 2;

export function prepareTerm(query: string): SearchTerm | null {
  const text = normalizeDescription(query);
  const digits = query.replace(/\D/g, '');
  if (text.length < MIN_QUERY_LENGTH && digits.length === 0) return null;
  return { text, digits };
}

/** Does any of these fields contain the term? Nulls are skipped, not matched. */
function matchesText(term: SearchTerm, fields: (string | null | undefined)[]): boolean {
  if (!term.text) return false;
  return fields.some((field) => field && normalizeDescription(field).includes(term.text));
}

/**
 * Amount matching on the lira part: typing "1250" finds 1.250,00 ₺.
 *
 * Deliberately a substring, not equality — someone half-remembering an amount
 * types the digits they recall. It does mean "500" also surfaces 1.500,00 ₺,
 * which is the right trade for a "hani 500 liralık bir şey vardı" search.
 */
function matchesAmount(term: SearchTerm, amountKurus: number): boolean {
  if (!term.digits) return false;
  const lira = Math.floor(Math.abs(amountKurus) / 100);
  return String(lira).includes(term.digits);
}

/** The transaction fields search looks at. Matches `TransactionRow` structurally. */
export interface SearchableTransaction {
  amount: number;
  description: string | null;
  note: string | null;
  categoryName: string | null;
  contactName: string | null;
}

export function transactionMatches(term: SearchTerm, row: SearchableTransaction): boolean {
  return (
    matchesText(term, [row.description, row.note, row.categoryName, row.contactName]) ||
    matchesAmount(term, row.amount)
  );
}

/** The contact fields search looks at. */
export interface SearchableContact {
  name: string;
  phone: string | null;
}

/**
 * Phone matching ignores formatting so "0555" finds "0555 123 45 67" and
 * "05551234567" alike.
 */
export function contactMatches(term: SearchTerm, row: SearchableContact): boolean {
  if (matchesText(term, [row.name])) return true;
  if (term.digits && row.phone) {
    return row.phone.replace(/\D/g, '').includes(term.digits);
  }
  return false;
}
