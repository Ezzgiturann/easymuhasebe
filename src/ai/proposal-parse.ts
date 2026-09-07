/**
 * Reading what the model proposed, without touching the database.
 *
 * Split out from `proposal.ts` so it can be tested: that module reaches for
 * `@/db/client` to write, which drags in native expo-sqlite and cannot run under
 * jest. Everything here is pure — the same split `utils/overdue.ts` uses.
 */

import { KASA_LABELS } from '@/constants/labels';
import { today } from '@/db/dates';
import { deriveKind, kindNeedsCategory, kindNeedsContact, type PaymentMethod } from '@/db/postings';
import { KASA_TYPES, type KasaType } from '@/db/schema/transactions';
import { formatTRY } from '@/utils/money';

/** What the model is allowed to propose. Amounts are already in kuruş here. */
export interface TransactionProposal {
  amount: number;
  direction: 'in' | 'out';
  /** For a transfer this is the cash box the money leaves from. */
  method: PaymentMethod;
  /** Set only for a transfer: where the money lands. */
  toMethod: KasaType | null;
  categoryName: string | null;
  contactName: string | null;
  description: string | null;
  txDate: string;
}

export interface ParsedReply {
  /** What to show as the assistant's message; never contains the raw block. */
  message: string;
  proposal: TransactionProposal | null;
  /** Set when a block was present but unusable — shown instead of a card. */
  error: string | null;
}

const METHODS: PaymentMethod[] = ['nakit', 'banka', 'kredi_karti', 'veresiye'];

/** The fence the model wraps a proposal in. */
const BLOCK = /```kayit\s*([\s\S]*?)```/;

/** True for a proposal that moves money between the shop's own cash boxes. */
export function isTransferProposal(p: TransactionProposal): boolean {
  return p.toMethod !== null;
}

/**
 * Split a model reply into prose and an optional proposal.
 *
 * A malformed block is reported, never silently dropped: the model said it
 * intended to record something, and swallowing that would leave the user
 * believing a transaction is on its way when nothing is.
 */
export function parseReply(raw: string): ParsedReply {
  const match = raw.match(BLOCK);
  const message = (match ? raw.replace(BLOCK, '') : raw).trim();

  if (!match) return { message, proposal: null, error: null };

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return { message, proposal: null, error: 'İşlem önerisi okunamadı, tekrar söyler misin?' };
  }

  const result = validateProposal(data);
  if ('error' in result) return { message, proposal: null, error: result.error };
  return { message, proposal: result.proposal, error: null };
}

type ValidationResult = { proposal: TransactionProposal } | { error: string };

const text = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** Everything the model sends is untrusted; nothing here is assumed well-formed. */
export function validateProposal(data: unknown): ValidationResult {
  if (typeof data !== 'object' || data === null) return { error: 'İşlem önerisi boş geldi.' };
  const raw = data as Record<string, unknown>;

  // Amount arrives in lira because that's how the user says it out loud.
  const lira = typeof raw.amount === 'number' ? raw.amount : Number(raw.amount);
  if (!Number.isFinite(lira) || lira <= 0) return { error: 'Tutar anlaşılmadı.' };
  const amount = Math.round(lira * 100);
  if (amount <= 0) return { error: 'Tutar anlaşılmadı.' };

  const txDate =
    typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : today();

  // A `toMethod` is what makes this a transfer. Checked before `direction`
  // because a transfer has no direction to speak of — nothing enters or leaves.
  if (raw.toMethod !== undefined && raw.toMethod !== null) {
    return validateTransfer(raw, amount, txDate);
  }

  const direction = raw.direction === 'in' ? 'in' : raw.direction === 'out' ? 'out' : null;
  if (!direction) return { error: 'Para girdi mi çıktı mı anlaşılmadı.' };

  const method = METHODS.find((m) => m === raw.method);
  if (!method) return { error: 'Ödeme yöntemi anlaşılmadı.' };

  const contactName = text(raw.contact);
  const kind = deriveKind(direction, method, !!contactName);

  // buildEntries throws on a kind whose required side is missing, and that would
  // surface as a crash at save time — catch it here instead.
  if (kindNeedsContact(kind) && !contactName) return { error: 'Bu işlem için kişi adı gerekiyor.' };

  const categoryName = text(raw.category);
  if (kindNeedsCategory(kind) && !categoryName) return { error: 'Bu işlem için kategori gerekiyor.' };

  return {
    proposal: {
      amount,
      direction,
      method,
      toMethod: null,
      categoryName: kindNeedsCategory(kind) ? categoryName : null,
      contactName,
      description: text(raw.description),
      txDate,
    },
  };
}

/**
 * "Kasadan bankaya 5.000 yatırdım" — the movement the assistant used to book as
 * an expense, inflating the month on both sides while the difference still
 * looked right.
 */
function validateTransfer(
  raw: Record<string, unknown>,
  amount: number,
  txDate: string,
): ValidationResult {
  const from = KASA_TYPES.find((k) => k === raw.method);
  if (!from) return { error: 'Paranın hangi kasadan çıktığı anlaşılmadı.' };

  const to = KASA_TYPES.find((k) => k === raw.toMethod);
  if (!to) return { error: 'Paranın hangi kasaya gittiği anlaşılmadı.' };

  if (from === to) return { error: 'Aktarımın iki ucu aynı kasa olamaz.' };

  return {
    proposal: {
      amount,
      // Stored as 'out' because the column needs a value; nothing in the UI
      // renders a transfer as money leaving.
      direction: 'out',
      method: from,
      toMethod: to,
      // A transfer is neither income nor expense and belongs to no one, so any
      // category or contact the model attached is dropped rather than saved.
      categoryName: null,
      contactName: null,
      description: text(raw.description),
      txDate,
    },
  };
}

/** One-line summary for the confirmation card. */
export function describeProposal(p: TransactionProposal): string {
  if (p.toMethod) {
    return `Aktarım ${formatTRY(p.amount)} · ${KASA_LABELS[p.method as KasaType]} → ${KASA_LABELS[p.toMethod]}`;
  }

  const parts = [
    `${p.direction === 'in' ? 'Giren' : 'Çıkan'} ${formatTRY(p.amount)}`,
    p.method === 'veresiye' ? 'Veresiye' : KASA_LABELS[p.method as KasaType],
  ];
  if (p.contactName) parts.push(p.contactName);
  if (p.categoryName) parts.push(p.categoryName);
  return parts.join(' · ');
}
