import { eq, sql } from 'drizzle-orm';

import { getCurrentUserId } from '@/auth/current-user';
import { ACCOUNT_COLORS, DEFAULT_CATEGORIES } from '@/constants/categories';
import { db } from '../client';
import { newId } from '../ids';
import { accountMembers, accounts, categories } from '../schema';
import { insertStamp, updateStamp } from '../stamp';
import type { KasaType } from '../schema/transactions';

export interface CreateAccountInput {
  name: string;
  color?: string;
  /** UNSIGNED kuruş already in the till when the account is opened. */
  openingBalance?: number;
  openingKasaType?: KasaType | null;
}

/**
 * Create an account and seed its default categories in one transaction.
 * Categories are account-scoped, so seeding happens here (not at app first-run).
 */
export function createAccount(input: CreateAccountInput): string {
  const accountId = newId();
  const color = input.color ?? ACCOUNT_COLORS[0];
  const openingBalance = input.openingBalance ?? 0;
  const openingKasaType = openingBalance !== 0 ? (input.openingKasaType ?? 'nakit') : null;
  const ownerUserId = getCurrentUserId();

  db.transaction((tx) => {
    tx.insert(accounts)
      .values({
        id: accountId,
        name: input.name.trim(),
        color,
        // Written now, not later: this is the anchor Row Level Security will
        // stand on. A ledger with no owner is a ledger the database cannot
        // decide who may read, and backfilling ownership after the fact means
        // guessing.
        ownerUserId,
        ...insertStamp(),
        openingBalance,
        openingKasaType,
        // Seeded, not left at zero: the cached total is opening + movements, and
        // there are no movements yet.
        cachedBalance: openingBalance,
      })
      .run();

    // The owner gets a membership row like everybody else. Without it the
    // sharing rules would need a special case for "the person who made it",
    // and special cases in access control are where holes come from.
    if (ownerUserId) {
      tx.insert(accountMembers)
        .values({
          id: newId(),
          accountId,
          userId: ownerUserId,
          role: 'owner',
          status: 'active',
          invitedBy: ownerUserId,
          ...insertStamp(),
        })
        .run();
    }
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const c = DEFAULT_CATEGORIES[i];
      tx.insert(categories)
        .values({
          id: newId(),
          accountId,
          name: c.name,
          icon: c.icon,
          kind: c.kind,
          sortOrder: i,
          ...insertStamp(),
        })
        .run();
    }
  });

  return accountId;
}

export interface UpdateAccountInput {
  name: string;
  color: string;
  openingBalance?: number;
  openingKasaType?: KasaType | null;
}

/**
 * Rename or recolour an account, and correct its opening balance. Movements,
 * categories and contacts are untouched — before this existed, fixing a typo in
 * a name meant deleting the account and losing every movement in it.
 *
 * The cached total is shifted by exactly the change in the opening balance, so
 * correcting "5.000" to "4.800" moves the balance by 200 rather than rebuilding
 * it from scratch.
 */
export function updateAccount(id: string, input: UpdateAccountInput): void {
  db.transaction((tx) => {
    const current = tx
      .select({ openingBalance: accounts.openingBalance })
      .from(accounts)
      .where(eq(accounts.id, id))
      .all()[0];
    if (!current) return;

    const openingBalance = input.openingBalance ?? current.openingBalance;
    const openingKasaType = openingBalance !== 0 ? (input.openingKasaType ?? 'nakit') : null;
    const delta = openingBalance - current.openingBalance;

    tx.update(accounts)
      .set({
        name: input.name.trim(),
        color: input.color,
        openingBalance,
        openingKasaType,
        // Unlike the balance-only writes elsewhere, this one does bump the clock
        // via updateStamp: the opening balance is a real edit the user made, and
        // the cached total only moves because of it.
        cachedBalance: sql`${accounts.cachedBalance} + ${delta}`,
        ...updateStamp(),
      })
      .where(eq(accounts.id, id))
      .run();
  });
}

/** Open or close an account for sharing (moves it in/out of "Paylaşılan Hesaplar"). */
export function setAccountShared(id: string, shared: boolean): void {
  db.update(accounts)
    .set({ isShared: shared, ...updateStamp() })
    .where(eq(accounts.id, id))
    .run();
}

/** Soft-delete an account (removed from the list; nothing is physically erased). */
export function deleteAccount(id: string): void {
  const now = Date.now();
  db.update(accounts)
    .set({ deletedAt: now, ...updateStamp(now) })
    .where(eq(accounts.id, id))
    .run();
}
