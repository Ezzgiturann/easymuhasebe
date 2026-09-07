/**
 * The rules of the entry form, with no React and no database in sight.
 *
 * `transaction/new.tsx` is the app's most-edited screen and the one where a
 * mistake writes a wrong number into the ledger. Keeping the decisions here
 * means they can be tested without a device — and it is what stopped an expense
 * from being bookable against an income category.
 */

import { kindNeedsCategory, kindNeedsContact } from '@/db/postings';
import { normalizeDescription } from '@/db/normalize';
import type { KasaType, TxKind } from '@/db/schema/transactions';

/** What the user is doing, as a shopkeeper would say it. */
export type TxMode = 'in' | 'out' | 'transfer';

/** A category as the form needs it: enough to tell income from expense. */
export interface FormCategory {
  id: string;
  kind: 'income' | 'expense';
}

/**
 * The category currently in effect, or undefined.
 *
 * A category only counts while it matches the direction on screen. The prefill
 * comes from the last transaction, so an income category could sit there under
 * "Verdim" — and an expense booked against an income category is *subtracted*
 * from that month's income rather than added to its spending, which hides the
 * expense and shrinks the income in one move.
 */
export function effectiveCategory<T extends FormCategory>(
  categories: T[],
  categoryId: string | null,
  mode: TxMode,
): T | undefined {
  if (!categoryId || mode === 'transfer') return undefined;
  const wanted = mode === 'in' ? 'income' : 'expense';
  const found = categories.find((c) => c.id === categoryId);
  return found && found.kind === wanted ? found : undefined;
}

export interface BlockerInput {
  kind: TxKind;
  mode: TxMode;
  /** Kuruş; zero or less means nothing has been typed yet. */
  amount: number;
  hasCategory: boolean;
  hasContact: boolean;
  /** Transfer only. */
  fromKasa: KasaType | 'veresiye' | null;
  toKasa: KasaType | null;
}

/**
 * The first thing standing between the user and Kaydet, in their own words.
 *
 * Returning a sentence rather than a boolean is the point: a greyed-out button
 * with no reason is indistinguishable from a broken one, and that is exactly
 * how "gelir ekleyemiyorum" started.
 */
export function saveBlocker(input: BlockerInput): string | null {
  const { kind, mode, amount, hasCategory, hasContact, fromKasa, toKasa } = input;

  if (amount <= 0) return 'Tutar gir.';

  if (kindNeedsCategory(kind) && !hasCategory) {
    return `Kategori seç — ${mode === 'in' ? 'bu para ne için geldi' : 'bu para ne için gitti'}?`;
  }

  if (kindNeedsContact(kind) && !hasContact) return 'Kimden / kime olduğunu yaz.';

  if (mode === 'transfer' && (fromKasa === 'veresiye' || !toKasa || fromKasa === toKasa)) {
    return 'Aktarımın iki ucu farklı kasa olmalı.';
  }

  return null;
}

/** A cari as the autocomplete needs it. */
export interface MatchableContact {
  id: string;
  name: string;
}

/** How many suggestions fit under the field without pushing the form around. */
export const MAX_CONTACT_MATCHES = 4;

/**
 * Existing cariler worth offering for what is being typed.
 *
 * Without this the field was free text: the save path fuzzy-matches and silently
 * creates a new cari when it misses, so "Ahmet" and "Ahmet Y." quietly became
 * two people owing two halves of one debt. Folded through
 * `normalizeDescription` so Turkish İ/ı and case never hide a real match.
 *
 * An exact match returns nothing: the user has already landed on the person and
 * a list repeating their name is noise over the next field.
 */
export function matchContacts<T extends MatchableContact>(contacts: T[], typed: string): T[] {
  const needle = normalizeDescription(typed);
  if (!needle) return [];

  const exact = contacts.some((c) => normalizeDescription(c.name) === needle);
  if (exact) return [];

  return contacts
    .filter((c) => normalizeDescription(c.name).includes(needle))
    .slice(0, MAX_CONTACT_MATCHES);
}
