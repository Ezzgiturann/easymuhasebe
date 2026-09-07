/**
 * How much of a conversation is replayed to the model.
 *
 * Split out from `history.ts` because that module reaches for AsyncStorage and
 * cannot run under jest — the same split `proposal-parse.ts` and
 * `queries/group-by-day.ts` use. The whole history goes to the model on every
 * send, so this is what stops an old thread from slowly inflating the cost of
 * each question until the context overflows.
 */

import type { ChatTurn } from '@/ai/client';

/**
 * A turn plus what to show for it. The API needs the model's reply verbatim —
 * strip the proposal block from history and the model loses sight of what it
 * just offered — but the bubble must not display raw JSON.
 */
export interface Message extends ChatTurn {
  display?: string;
}

/** ~15 exchanges. Enough to hold a thread, short enough to stay cheap. */
export const MAX_MESSAGES = 30;

/**
 * Keep the most recent messages, and never let the result open on an assistant
 * turn — a replayed history that starts mid-answer reads as if the user's
 * question went missing.
 */
export function trimHistory(messages: Message[]): Message[] {
  const recent = messages.slice(-MAX_MESSAGES);
  const firstUser = recent.findIndex((m) => m.role === 'user');
  return firstUser <= 0 ? recent : recent.slice(firstUser);
}

/** Shape check for something read back out of storage, which may be anything. */
export function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string';
}
