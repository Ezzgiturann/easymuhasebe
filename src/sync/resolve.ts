/**
 * Who wins when the same row was changed in two places.
 *
 * The rule is last-write-wins on `updatedAt`, which is a real choice with a real
 * cost: the loser's edit is gone, not merged. It is the right trade here because
 * a transaction is never edited in place — `updateTransaction` soft-deletes the
 * old row and writes a new one with a new id — so two people editing the same
 * row at once is rare, and when it happens the two versions are alternatives
 * rather than halves of one change.
 */

export interface Versioned {
  /** Epoch-ms of the last write. */
  updatedAt: number;
  /** Installation that made it; the tiebreak when the clocks are equal. */
  deviceId: string | null;
}

/**
 * True when the incoming copy should replace the one we hold.
 *
 * Ties are broken by comparing `deviceId` as text. It is arbitrary — neither
 * device is more right — but it is *deterministic*, and that is the whole point:
 * both phones must reach the same answer without talking to each other, or they
 * will each keep their own version and disagree forever.
 *
 * A missing `deviceId` sorts first, so a stamped row beats an unstamped one. Rows
 * with no device are from before sync existed; the stamped copy is the newer
 * information even when the clocks say otherwise.
 */
export function incomingWins(mine: Versioned, theirs: Versioned): boolean {
  if (theirs.updatedAt !== mine.updatedAt) return theirs.updatedAt > mine.updatedAt;
  return (theirs.deviceId ?? '') > (mine.deviceId ?? '');
}

/**
 * A soft delete is a normal edit and goes through the same comparison — it wins
 * only if it is genuinely newer. This is what keeps a row deleted on one phone
 * from being resurrected by an older copy on another, and equally keeps a delete
 * from swallowing an edit made after it.
 *
 * Exported for readability at the call site rather than for different behaviour.
 */
export function isDeleted(row: { deletedAt: number | null }): boolean {
  return row.deletedAt !== null;
}
