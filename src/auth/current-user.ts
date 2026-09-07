/**
 * "Who am I", readable synchronously.
 *
 * The session lives behind an async API, but the mutation layer is synchronous —
 * `createAccount` cannot await anything. So the id is cached here the moment the
 * session provider learns it, and read back without a round trip.
 *
 * Why it matters: every row carries `createdBy`/`updatedBy`, and an account
 * carries `ownerUserId`. Those columns are what Row Level Security will stand on
 * in the sync phase — a row with nobody's name on it belongs to nobody, and the
 * database cannot decide who may read it.
 */

let userId: string | null = null;

/** Set by the session provider on sign-in, cleared on sign-out. */
export function setCurrentUserId(id: string | null): void {
  userId = id;
}

/** Null before sign-in, and in the local-only phase of the app's history. */
export function getCurrentUserId(): string | null {
  return userId;
}
