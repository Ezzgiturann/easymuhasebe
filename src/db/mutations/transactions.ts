import { and, eq, sql } from 'drizzle-orm';

import { db } from '../client';
import { today } from '../dates';
import { newId } from '../ids';
import { normalizeDescription } from '../normalize';
import { buildEntries, directionForKind, kasaDelta } from '../postings';
import {
  accounts,
  descriptionSuggestions,
  entries,
  transactions,
} from '../schema';
import { deleteReceipt } from '@/utils/receipt';

import { insertStamp, updateStamp } from '../stamp';
import type { KasaType, TxKind } from '../schema/transactions';

/** Transaction handle passed into `db.transaction((tx) => ...)`. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CreateTransactionInput {
  accountId: string;
  kind: TxKind;
  /** UNSIGNED amount in kuruş. */
  amount: number;
  kasaType?: KasaType | null;
  /** Only for `transfer`: the cash box the money lands in. */
  toKasaType?: KasaType | null;
  categoryId?: string | null;
  contactId?: string | null;
  description?: string | null;
  note?: string | null;
  /** Local file URI of an attached receipt photo. */
  receiptUri?: string | null;
  /** 'YYYY-MM-DD' local day; defaults to today. */
  txDate?: string;
}

/** Insert a transaction + its balanced entries, keep cachedBalance and the
 *  auto-recognition cache in sync. Runs inside the caller's tx handle. */
function insertTransactionTx(tx: Tx, input: CreateTransactionInput): string {
  const kasaType = input.kasaType ?? null;
  const toKasaType = input.toKasaType ?? null;
  const categoryId = input.categoryId ?? null;
  const contactId = input.contactId ?? null;
  const txDate = input.txDate ?? today();
  const direction = directionForKind(input.kind);
  const descriptionNorm = normalizeDescription(input.description);

  const seeds = buildEntries({
    kind: input.kind,
    amount: input.amount,
    kasaType,
    toKasaType,
    categoryId,
    contactId,
  });

  const txId = newId();
  tx.insert(transactions)
    .values({
      id: txId,
      accountId: input.accountId,
      txDate,
      kind: input.kind,
      direction,
      amount: input.amount,
      kasaType,
      toKasaType,
      categoryId,
      contactId,
      description: input.description?.trim() || null,
      descriptionNorm: descriptionNorm || null,
      note: input.note?.trim() || null,
      receiptUri: input.receiptUri ?? null,
      ...insertStamp(),
    })
    .run();

  for (const s of seeds) {
    tx.insert(entries)
      .values({
        id: newId(),
        transactionId: txId,
        accountId: input.accountId,
        txDate,
        ledgerType: s.ledgerType,
        kasaType: s.kasaType,
        categoryId: s.categoryId,
        contactId: s.contactId,
        amount: s.amount,
        ...insertStamp(),
      })
      .run();
  }

  const delta = kasaDelta(seeds);
  if (delta !== 0) {
    // `updatedAt` deliberately untouched. The cached balance is derived from the
    // transactions, never synced, and recomputed locally after every pull — so
    // this write is not a change to the account. Bumping the clock would make a
    // phone that merely recorded a sale look like it had just edited the account,
    // and last-write-wins would let it overwrite a rename made on another phone.
    tx.update(accounts)
      .set({ cachedBalance: sql`${accounts.cachedBalance} + ${delta}` })
      .where(eq(accounts.id, input.accountId))
      .run();
  }

  // Auto-recognition: bump the suggestion for this normalized description so the
  // 3rd identical entry prefills category/contact/kasa on its own.
  if (descriptionNorm) {
    tx.insert(descriptionSuggestions)
      .values({
        id: newId(),
        accountId: input.accountId,
        descriptionNorm,
        categoryId,
        contactId,
        kasaType,
        useCount: 1,
        ...insertStamp(),
      })
      .onConflictDoUpdate({
        target: [descriptionSuggestions.accountId, descriptionSuggestions.descriptionNorm],
        set: {
          useCount: sql`${descriptionSuggestions.useCount} + 1`,
          categoryId,
          contactId,
          kasaType,
          lastUsedAt: Date.now(),
          // No `updatedAt`: this whole table is a local cache. Every column in it
          // is derived from the transactions — `useCount` in particular is an
          // incrementing counter, and two phones each adding 1 offline cannot be
          // merged by picking a winner, since the answer is 2 and only a recount
          // produces it. The table is rebuilt from history after a pull rather
          // than synced row by row.
        },
      })
      .run();
  }

  return txId;
}

/** Soft-delete a transaction and its entries, reversing the cached balance. */
function softDeleteTransactionTx(tx: Tx, id: string): void {
  const rows = tx
    .select({ accountId: entries.accountId, ledgerType: entries.ledgerType, amount: entries.amount })
    .from(entries)
    .where(and(eq(entries.transactionId, id), sql`${entries.deletedAt} IS NULL`))
    .all();

  if (rows.length === 0) return;

  const accountId = rows[0].accountId;
  const delta = rows
    .filter((r) => r.ledgerType === 'kasa')
    .reduce((acc, r) => acc + r.amount, 0);

  const now = Date.now();
  const stamp = updateStamp(now);
  tx.update(transactions)
    .set({ deletedAt: now, ...stamp })
    .where(eq(transactions.id, id))
    .run();
  tx.update(entries)
    .set({ deletedAt: now, ...stamp })
    .where(eq(entries.transactionId, id))
    .run();

  if (delta !== 0) {
    tx.update(accounts)
      .set({ cachedBalance: sql`${accounts.cachedBalance} - ${delta}` })
      .where(eq(accounts.id, accountId))
      .run();
  }
}

/** Public: create a transaction (the big + button). Returns its id. */
export function createTransaction(input: CreateTransactionInput): string {
  return db.transaction((tx) => insertTransactionTx(tx, input));
}

/** Public: soft-delete a transaction (nothing is physically removed). */
export function deleteTransaction(id: string): void {
  // Read before the row is marked gone: the queries below filter deleted rows,
  // so afterwards there is nothing left pointing at the file.
  const receiptUri = db
    .select({ uri: transactions.receiptUri })
    .from(transactions)
    .where(eq(transactions.id, id))
    .all()
    .at(0)?.uri;

  db.transaction((tx) => softDeleteTransactionTx(tx, id));

  // Fire and forget, deliberately. The row is what the ledger is made of; a photo
  // that outlives it costs disk space, and waiting for the filesystem before the
  // list updates would make deleting feel slow for no gain.
  void deleteReceipt(receiptUri ?? null);
}

/**
 * Public: edit a transaction. We never mutate postings in place — the old
 * transaction + entries are soft-deleted and a fresh one is written, so a shared
 * account keeps a full audit trail and sync stays an insert/soft-delete stream.
 */
export function updateTransaction(id: string, input: CreateTransactionInput): string {
  return db.transaction((tx) => {
    softDeleteTransactionTx(tx, id);
    return insertTransactionTx(tx, input);
  });
}
