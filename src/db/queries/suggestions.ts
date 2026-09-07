import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../client';
import { normalizeDescription } from '../normalize';
import { descriptionSuggestions } from '../schema';

export interface Suggestion {
  categoryId: string | null;
  contactId: string | null;
  kasaType: string | null;
  useCount: number;
}

/**
 * Look up the remembered category/contact/kasa for a typed description.
 * Returns a match only once it has been used at least twice (`useCount >= 2`),
 * so by the 3rd identical description the fields prefill silently and the user
 * just types the number.
 */
export function lookupSuggestion(accountId: string, description: string): Suggestion | null {
  const norm = normalizeDescription(description);
  if (!norm) return null;

  const rows = db
    .select({
      categoryId: descriptionSuggestions.categoryId,
      contactId: descriptionSuggestions.contactId,
      kasaType: descriptionSuggestions.kasaType,
      useCount: descriptionSuggestions.useCount,
    })
    .from(descriptionSuggestions)
    .where(
      and(
        eq(descriptionSuggestions.accountId, accountId),
        eq(descriptionSuggestions.descriptionNorm, norm),
        isNull(descriptionSuggestions.deletedAt),
      ),
    )
    .limit(1)
    .all();

  const row = rows[0];
  if (!row || row.useCount < 2) return null;
  return row;
}
