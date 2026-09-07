import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '../client';
import { getDeviceId } from '../device';
import { newId } from '../ids';
import { accountMembers, accounts } from '../schema';
import { insertStamp, updateStamp } from '../stamp';

/**
 * Tables whose rows hang off an account and are synced.
 *
 * `description_suggestions` is absent on purpose: it is a local cache rebuilt
 * from the transactions, so it never travels and has no author worth recording.
 */
const OWNED_TABLES = ['categories', 'contacts', 'transactions', 'entries', 'account_members'];

/** The handle drizzle hands a `db.transaction` callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Hand the pre-account ledger to whoever signs in first.
 *
 * The app kept books for a long time before accounts existed, so those rows have
 * `ownerUserId = NULL`. Once the home screen started scoping by owner, an
 * unclaimed ledger would simply vanish for its only user — data still on the
 * phone, invisible to the person who wrote it.
 *
 * Runs on every sign-in but only ever does something once: after the first pass
 * there are no unowned accounts left. A second user signing into the same phone
 * therefore finds nothing to claim and starts with an empty ledger, which is
 * exactly right — that ledger is not theirs.
 *
 * Also fills in the authorship the pre-account rows never had. Every row carries
 * `createdBy`/`updatedBy`/`deviceId`, and rows written before sign-in existed
 * left all three NULL. A row with nobody's name on it is a row Row Level Security
 * cannot decide who may read, so the server would either reject it or, worse,
 * accept it as belonging to no one — the ledger would upload and come back empty.
 *
 * Returns how many accounts changed hands, so the caller can say so if it wants.
 */
export function claimUnownedAccounts(userId: string): number {
  return db.transaction((tx) => {
    const unowned = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(isNull(accounts.ownerUserId), isNull(accounts.deletedAt)))
      .all();

    const now = Date.now();
    for (const { id } of unowned) {
      tx.update(accounts)
        .set({ ownerUserId: userId, ...updateStamp(now) })
        .where(eq(accounts.id, id))
        .run();

      // The owner needs a membership row like anyone else — it is what the
      // sharing rules, and later Row Level Security, will actually read.
      tx.insert(accountMembers)
        .values({
          id: newId(),
          accountId: id,
          userId,
          role: 'owner',
          status: 'active',
          invitedBy: userId,
          ...insertStamp(),
        })
        .run();
    }

    // Deliberately outside the `unowned.length` check above. Accounts claimed by
    // an earlier version of this function already have an owner, but the rows
    // underneath them were never stamped — gating the backfill on "was anything
    // claimed just now" would skip exactly the ledgers that need it.
    backfillAuthorship(tx, userId);
    adoptLocalProfile(tx, userId);

    return unowned.length;
  });
}

/**
 * Hand the pre-account profile row to whoever signs in first.
 *
 * The name and phone used to live under a fixed `'local-user'` id. Keying the
 * profile by real user id would have made that row invisible — the owner would
 * open Profil and find the fields they had filled in blank.
 *
 * Only when this user has no profile of their own, and only once: after the
 * rename there is no `'local-user'` row left for the next person to inherit,
 * which is the point — their name is not this one's.
 */
function adoptLocalProfile(tx: Tx, userId: string): void {
  tx.run(sql`
    UPDATE users
       SET id = ${userId}, updated_at = ${Date.now()}
     WHERE id = 'local-user'
       AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ${userId})
  `);
}

/**
 * Stamp this user onto every unstamped row of the ledgers they own.
 *
 * Only touches rows where `created_by` is still NULL, so it is safe to run on
 * every sign-in and cannot overwrite an author recorded on another device.
 *
 * `updated_at` is left alone. This fills in who wrote a row, not what it says;
 * moving the last-write-wins clock would announce an edit that never happened and
 * let this phone win a merge it has no claim to.
 */
function backfillAuthorship(tx: Tx, userId: string): void {
  const deviceId = getDeviceId();

  tx.run(sql`
    UPDATE accounts
    SET created_by = ${userId},
        updated_by = COALESCE(updated_by, ${userId}),
        device_id  = COALESCE(device_id, ${deviceId})
    WHERE created_by IS NULL AND owner_user_id = ${userId}
  `);

  for (const table of OWNED_TABLES) {
    tx.run(sql`
      UPDATE ${sql.raw(table)}
      SET created_by = ${userId},
          updated_by = COALESCE(updated_by, ${userId}),
          device_id  = COALESCE(device_id, ${deviceId})
      WHERE created_by IS NULL
        AND account_id IN (SELECT id FROM accounts WHERE owner_user_id = ${userId})
    `);
  }
}
