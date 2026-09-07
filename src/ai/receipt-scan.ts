import { readReceiptBase64 } from '@/utils/receipt';

import { ask } from './client';
import { EMPTY_READING, matchCategory, parseReceiptReply, type ReceiptReading } from './receipt-parse';
import { buildReceiptInstruction } from './receipt-prompt';

/**
 * Look at a receipt photo and report what is on it.
 *
 * The I/O half; the rules about what counts as a readable number are in
 * `receipt-parse.ts`, which is pure and tested.
 *
 * Throws only what the user could act on — no connection, not signed in — and
 * those come straight from `ask` as `AskError`. An unreadable photo is not an
 * error: it returns a reading with every field null, and the form leaves itself
 * alone. The user attached a picture and can still type.
 */
export async function scanReceipt(uri: string, categoryNames: string[]): Promise<ReceiptReading> {
  const data = await readReceiptBase64(uri);
  // The file is gone or unreadable. Nothing to send, and nothing worth an error:
  // the photo is still attached to the transaction either way.
  if (!data) return EMPTY_READING;

  const reply = await ask(
    [
      {
        role: 'user',
        // The instruction carries the real task; this line only gives the image
        // something to be attached to, since a turn needs text.
        text: 'Bu fişi oku.',
        image: { data, mimeType: 'image/jpeg' },
      },
    ],
    buildReceiptInstruction(categoryNames),
  );

  const reading = parseReceiptReply(reply);
  return {
    ...reading,
    // Matched here rather than trusted from the model: it was given the list, but
    // a name that is not on it must not reach the form.
    categoryName: matchCategory(reading.categoryName, categoryNames),
  };
}
