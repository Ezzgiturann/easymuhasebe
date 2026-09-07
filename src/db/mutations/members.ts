import { eq } from 'drizzle-orm';

import { getCurrentUserId } from '@/auth/current-user';

import { db } from '../client';
import { newId } from '../ids';
import { accountMembers } from '../schema';
import { insertStamp, updateStamp } from '../stamp';

export type MemberRole = 'editor' | 'viewer';

export interface InviteInput {
  accountId: string;
  displayName: string | null;
  phone: string | null;
  role: MemberRole;
}

/** Create a pending invite for an account. Returns the member id. */
export function inviteMember({ accountId, displayName, phone, role }: InviteInput): string {
  const id = newId();
  db.insert(accountMembers)
    .values({
      id,
      accountId,
      userId: null,
      displayName: displayName?.trim() || null,
      phone: phone?.trim() || null,
      role,
      status: 'pending',
      // The signed-in user, not the 'local-user' placeholder this carried before
      // accounts existed. Sharing will ask who sent an invite in order to decide
      // who may withdraw it, and a user id that exists on no server answers
      // nothing.
      invitedBy: getCurrentUserId(),
      ...insertStamp(),
    })
    .run();
  return id;
}

/** Soft-remove a member / cancel an invite. */
export function removeMember(id: string): void {
  const now = Date.now();
  db.update(accountMembers)
    .set({ deletedAt: now, status: 'revoked', ...updateStamp(now) })
    .where(eq(accountMembers.id, id))
    .run();
}
