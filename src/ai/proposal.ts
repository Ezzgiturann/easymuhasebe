/**
 * Turning "Ahmet'e 500 lira veresiye verdim" into a transaction the user can save.
 *
 * The model never writes. It emits a proposal, the chat renders it as a card, and
 * only an explicit tap calls `createTransaction`. A model that mishears an amount
 * should cost the user one glance, not a corrupted ledger — and everything it
 * proposes still has to pass `buildEntries`, which refuses postings that don't
 * balance.
 *
 * Reading a proposal lives in `proposal-parse.ts` and is pure; this file is the
 * only part that touches the database.
 */

import { resolveContactByName } from '@/db/mutations/contacts';
import { createTransaction } from '@/db/mutations/transactions';
import { deriveKind, kindNeedsCategory, kindNeedsContact } from '@/db/postings';
import { normalizeDescription } from '@/db/normalize';
import { categoriesQuery } from '@/db/queries/categories';
import type { KasaType } from '@/db/schema/transactions';
import type { TransactionProposal } from './proposal-parse';

// Re-exported so callers have one import for the whole proposal flow.
export {
  describeProposal,
  isTransferProposal,
  parseReply,
  validateProposal,
  type ParsedReply,
  type TransactionProposal,
} from './proposal-parse';

/**
 * Write the proposal. Called only from an explicit tap.
 *
 * The category is matched against the account's existing ones rather than
 * created: a model inventing "Nakliye Giderleri" alongside the user's "Nakliye"
 * would quietly fragment their reports. An unmatched name is an error, not a new
 * category. Contacts are the opposite — `resolveContactByName` already creates
 * them on normal entry, so the same rule applies here.
 */
export function commitProposal(accountId: string, p: TransactionProposal): void {
  if (p.toMethod) {
    createTransaction({
      accountId,
      kind: 'transfer',
      amount: p.amount,
      kasaType: p.method as KasaType,
      toKasaType: p.toMethod,
      categoryId: null,
      contactId: null,
      description: p.description,
      txDate: p.txDate,
    });
    return;
  }

  const kind = deriveKind(p.direction, p.method, !!p.contactName);

  let categoryId: string | null = null;
  if (kindNeedsCategory(kind)) {
    const wanted = normalizeDescription(p.categoryName);
    const match = categoriesQuery(accountId, p.direction === 'in' ? 'income' : 'expense')
      .all()
      .find((c) => normalizeDescription(c.name) === wanted);
    if (!match) throw new Error(`"${p.categoryName}" diye bir kategori yok.`);
    categoryId = match.id;
  }

  const contactId = p.contactName ? resolveContactByName(accountId, p.contactName) : null;
  if (kindNeedsContact(kind) && !contactId) throw new Error('Kişi çözümlenemedi.');

  createTransaction({
    accountId,
    kind,
    amount: p.amount,
    kasaType: p.method === 'veresiye' ? null : (p.method as KasaType),
    categoryId,
    contactId,
    description: p.description,
    txDate: p.txDate,
  });
}
