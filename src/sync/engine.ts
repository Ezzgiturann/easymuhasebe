import { sql } from 'drizzle-orm';

import { recomputeCachedBalances } from '@/db/backup';
import { db } from '@/db/client';
import { supabase } from '@/server/supabase';

import { marksFor, readCursor, writeCursor, type Cursor } from './cursor';
import { incomingWins } from './resolve';
import { isPushable, toLocal, toServer, type Row } from './serialize';
import { SYNC_TABLES, type SyncTable } from './tables';

/**
 * Reconciling the phone's ledger with the server's.
 *
 * The order is pull, then push, and it is not interchangeable. Pulling first
 * lets last-write-wins run locally, on rows we can see both versions of; what
 * survives is then safe to send. Pushing first would mean uploading a copy that
 * a newer edit on another phone had already replaced, and the server has no way
 * to know it should refuse.
 *
 * A small race remains: another device can write between our pull and our push.
 * Its change lands afterwards and wins on the next pass, so the two phones still
 * converge — one round later.
 *
 * Nothing here throws. A sync that cannot reach the server is a sync that did not
 * happen, not an error the user should see: the ledger on the phone is complete
 * and usable either way, which is the whole point of keeping it local.
 */

/** Rows per request. Small enough to survive a weak connection, large enough to
 *  not spend a round trip per transaction. */
const PAGE = 500;

export interface SyncResult {
  ok: boolean;
  pulled: number;
  pushed: number;
  /** Set when the run stopped early; for logs, not for the user. */
  reason?: string;
}

export async function sync(): Promise<SyncResult> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, pulled: 0, pushed: 0, reason: 'signed out' };

  const userId = data.session.user.id;
  const cursor = await readCursor(userId);
  let pulled = 0;
  let pushed = 0;

  // Per table, not around the whole run. One table the server refuses used to
  // abort everything after it — and because `account_members` is pushed last,
  // a single row the phone had no right to write killed every later sync
  // silently. A ledger that cannot be shared is a nuisance; a ledger that stops
  // syncing because of it is data loss waiting to happen.
  const failed: string[] = [];

  for (const table of SYNC_TABLES) {
    try {
      pulled += await pullTable(table, cursor);
    } catch (e) {
      failed.push(`pull ${table.name}: ${e}`);
    }
  }
  for (const table of SYNC_TABLES) {
    try {
      pushed += await pushTable(table, userId, cursor);
    } catch (e) {
      failed.push(`push ${table.name}: ${e}`);
    }
  }

  await writeCursor(userId, cursor);

  // Only now, and only once: the cached balances are derived from the rows that
  // just arrived. Recomputing per table would leave the totals wrong in between.
  if (pulled > 0) recomputeCachedBalances();

  return failed.length
    ? { ok: false, pulled, pushed, reason: failed.join(' | ') }
    : { ok: true, pulled, pushed };
}

/** Take everything the server has that is newer than our mark. */
async function pullTable(table: SyncTable, cursor: Cursor): Promise<number> {
  let mark = marksFor(cursor, table.name).pulled;
  let applied = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table.name)
      .select('*')
      .gt('updated_at', mark)
      .order('updated_at', { ascending: true })
      .limit(PAGE);

    if (error) throw new Error(`pull ${table.name}: ${error.message}`);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;

    for (const remote of rows) {
      if (applyRemote(table, remote)) applied++;
      const at = Number(remote.updated_at);
      if (at > mark) mark = at;
    }

    cursor[table.name] = { ...marksFor(cursor, table.name), pulled: mark };
    if (rows.length < PAGE) break;
  }

  return applied;
}

/**
 * Write one server row into SQLite, unless what we hold is newer.
 *
 * Returns whether anything changed, so the caller knows if the balances need
 * recomputing.
 */
function applyRemote(table: SyncTable, remote: Row): boolean {
  const id = remote.id;
  if (typeof id !== 'string') return false;

  const mine = db
    .all<{ updated_at: number; device_id: string | null }>(
      sql`SELECT updated_at, device_id FROM ${sql.identifier(table.name)} WHERE id = ${id}`,
    )
    .at(0);

  if (
    mine &&
    !incomingWins(
      { updatedAt: Number(mine.updated_at), deviceId: mine.device_id },
      { updatedAt: Number(remote.updated_at), deviceId: asText(remote.device_id) },
    )
  ) {
    return false;
  }

  upsertLocal(table.name, toLocal(remote, table));
  return true;
}

/** Send everything of ours the server has not seen. */
async function pushTable(table: SyncTable, userId: string, cursor: Cursor): Promise<number> {
  const mark = marksFor(cursor, table.name).pushed;

  // Two tables only this user's own rows may be written to, and both are refused
  // wholesale by the server otherwise.
  //
  // The cost of finding that out from a 403 is higher than it looks: a push goes
  // up as one batch, so a single row we have no right to write takes the whole
  // batch down with it — including the rows we do own. That is exactly what
  // happened here. A member of a shared ledger pulled the owner's account row,
  // then offered it straight back on the next push; the batch was refused, and
  // their own newly created ledger never reached the server. The invite function
  // then answered, correctly, that no such account existed.
  const ownedOnly =
    table.name === 'accounts'
      ? sql` AND owner_user_id = ${userId}`
      : table.name === 'account_members'
        ? sql` AND account_id IN (SELECT id FROM accounts WHERE owner_user_id = ${userId})`
        : // Everything else belongs to an account, and only an owner or an editor
          // may write to one. A 'viewer' used to offer the shared ledger's rows on
          // every single sync, collect a 403, and log a failure — forever, without
          // anything being wrong. Asking the same question the server would answer
          // costs one subquery and removes a permanent error.
          sql` AND account_id IN (
            SELECT id FROM accounts WHERE owner_user_id = ${userId}
            UNION
            SELECT account_id FROM account_members
             WHERE user_id = ${userId}
               AND status = 'active'
               AND role IN ('owner', 'editor')
               AND deleted_at IS NULL
          )`;

  const mine = db.all<Row>(
    sql`SELECT * FROM ${sql.identifier(table.name)}
        WHERE updated_at > ${mark}${ownedOnly}
        ORDER BY updated_at ASC`,
  );
  if (mine.length === 0) return 0;

  // A row whose account was never claimed by a signed-in user would be refused by
  // Row Level Security. Dropping it here turns a rejected batch into a skipped
  // row — it stays on the phone and starts travelling once its account is owned.
  const sendable = mine.filter((row) => isPushable(row, table));
  let sent = 0;

  for (let i = 0; i < sendable.length; i += PAGE) {
    const page = sendable.slice(i, i + PAGE).map((row) => toServer(row, table));
    const { error } = await supabase.from(table.name).upsert(page, { onConflict: 'id' });
    if (error) throw new Error(`push ${table.name}: ${error.message}`);
    sent += page.length;

    const last = page.at(-1)?.updated_at;
    cursor[table.name] = { ...marksFor(cursor, table.name), pushed: Number(last ?? mark) };
  }

  return sent;
}

/**
 * INSERT ... ON CONFLICT(id) DO UPDATE, over whatever columns the row happens to
 * have.
 *
 * Built from the row rather than from a fixed column list on purpose: a column
 * added to the schema later then syncs without anyone remembering to add it here.
 * Columns the server does not send — `cached_balance` — are absent from the
 * object and so are left untouched, which is exactly right for a derived value.
 */
function upsertLocal(table: string, row: Row): void {
  const cols = Object.keys(row);
  if (cols.length === 0) return;

  const names = sql.join(
    cols.map((c) => sql.identifier(c)),
    sql`, `,
  );
  const values = sql.join(
    cols.map((c) => sql`${row[c] as never}`),
    sql`, `,
  );
  const assignments = sql.join(
    cols
      .filter((c) => c !== 'id')
      .map((c) => sql`${sql.identifier(c)} = excluded.${sql.identifier(c)}`),
    sql`, `,
  );

  db.run(
    sql`INSERT INTO ${sql.identifier(table)} (${names}) VALUES (${values})
        ON CONFLICT(id) DO UPDATE SET ${assignments}`,
  );
}

function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
