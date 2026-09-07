import { getCurrentUserId } from '@/auth/current-user';

import { getDeviceId } from './device';

/**
 * The "who and when" columns, in one place.
 *
 * Every table carries `createdBy`/`updatedBy`/`deviceId`/`updatedAt` (see
 * `schema/_common.ts`), and sync depends on all four being filled: Row Level
 * Security decides who may read a row from the user id, last-write-wins picks a
 * winner from `updatedAt`, and `deviceId` breaks the tie when two phones wrote in
 * the same millisecond.
 *
 * They live here rather than being spelled out at each call site because a single
 * mutation that forgets one produces rows that look fine locally and lose their
 * edit the first time they meet another device — a silent failure, and the kind
 * that only appears once two people are already relying on the data.
 */

/** Columns every INSERT carries. `createdAt`/`updatedAt` default in the schema. */
export function insertStamp(): {
  createdBy: string | null;
  updatedBy: string | null;
  deviceId: string | null;
} {
  const userId = getCurrentUserId();
  return { createdBy: userId, updatedBy: userId, deviceId: getDeviceId() };
}

/**
 * Columns every UPDATE carries, including the clock.
 *
 * `updatedAt` is listed explicitly because the schema's default only fires on
 * insert — an UPDATE that omits it leaves the row advertising its old write time,
 * and sync would hand the round to the stale copy on the other phone.
 *
 * Pass `now` when several statements belong to one logical change, so they carry
 * the same timestamp instead of straddling a millisecond boundary.
 */
export function updateStamp(now: number = Date.now()): {
  updatedBy: string | null;
  deviceId: string | null;
  updatedAt: number;
} {
  return { updatedBy: getCurrentUserId(), deviceId: getDeviceId(), updatedAt: now };
}
