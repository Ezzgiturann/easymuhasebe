import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../client';
import { newId } from '../ids';
import { normalizeDescription } from '../normalize';
import { contacts } from '../schema';
import { insertStamp, updateStamp } from '../stamp';

export interface CreateContactInput {
  accountId: string;
  name: string;
  phone?: string | null;
  openingBalance?: number;
  /** Days after a veresiye this contact is expected to pay. Null = no term. */
  paymentTermDays?: number | null;
}

/** Create a cari (contact). Returns the new id. */
export function createContact(input: CreateContactInput): string {
  const id = newId();
  db.insert(contacts)
    .values({
      id,
      accountId: input.accountId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      openingBalance: input.openingBalance ?? 0,
      paymentTermDays: input.paymentTermDays ?? null,
      ...insertStamp(),
    })
    .run();
  return id;
}

export interface UpdateContactInput {
  name: string;
  phone?: string | null;
  note?: string | null;
  /** Signed kuruş. Positive = the contact owes us. */
  openingBalance?: number;
  /** Days after a veresiye this contact is expected to pay. Null = no term. */
  paymentTermDays?: number | null;
}

/**
 * Edit a cari. `openingBalance` is editable on purpose — it feeds every balance
 * this contact shows, so a typo there would otherwise be permanent.
 *
 * Only the keys actually passed are written. Setting every column unconditionally
 * would let a caller that omits `note` or `openingBalance` silently wipe them.
 */
export function updateContact(id: string, input: UpdateContactInput): void {
  const set: Record<string, unknown> = { name: input.name.trim(), ...updateStamp() };
  if ('phone' in input) set.phone = input.phone?.trim() || null;
  if ('note' in input) set.note = input.note?.trim() || null;
  if (input.openingBalance !== undefined) set.openingBalance = input.openingBalance;
  if ('paymentTermDays' in input) set.paymentTermDays = input.paymentTermDays ?? null;

  db.update(contacts).set(set).where(eq(contacts.id, id)).run();
}

/**
 * Soft-delete a cari. Their transactions stay in the ledger — only the contact
 * card goes away, so the kasa balance is unaffected. The caller is expected to
 * warn first when the contact still carries a balance, because that debt then
 * stops being counted in the alacak/borç totals.
 */
export function deleteContact(id: string): void {
  const now = Date.now();
  db.update(contacts)
    .set({ deletedAt: now, ...updateStamp(now) })
    .where(eq(contacts.id, id))
    .run();
}

/**
 * Resolve a typed contact name to an existing cari (matched case/diacritic-
 * insensitively) or create a new one. Returns the contact id, or null for an
 * empty name.
 */
export function resolveContactByName(accountId: string, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const norm = normalizeDescription(trimmed);
  const existing = db
    .select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(and(eq(contacts.accountId, accountId), isNull(contacts.deletedAt)))
    .all();

  const match = existing.find((c) => normalizeDescription(c.name) === norm);
  if (match) return match.id;

  return createContact({ accountId, name: trimmed });
}
