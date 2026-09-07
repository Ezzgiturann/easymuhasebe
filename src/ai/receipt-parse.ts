/**
 * Reading what the model saw on a receipt.
 *
 * Pure — no database, no network — so it runs under jest and so the rules that
 * decide whether a number is trustworthy live somewhere they can be tested
 * without a phone. The scanning half is in `receipt-scan.ts`.
 *
 * Every field is optional on purpose. A receipt where only the amount is legible
 * is still worth four taps of the user's time; refusing the whole read because
 * the date was smudged would throw that away.
 */

/** What a scan can contribute to the form. Absent means "could not read it". */
export interface ReceiptReading {
  /** INTEGER kuruş, like everywhere else in the app. */
  amountKurus: number | null;
  /** Matched against the account's own categories by the caller. */
  categoryName: string | null;
  /** The merchant, headed for the description field. */
  description: string | null;
  /** 'YYYY-MM-DD'. */
  txDate: string | null;
}

export const EMPTY_READING: ReceiptReading = {
  amountKurus: null,
  categoryName: null,
  description: null,
  txDate: null,
};

/**
 * A receipt total nobody in this app will legitimately reach.
 *
 * Its job is to catch a misread rather than to limit the user: a scanner that
 * turns "50,00" into "5000000" produces a number that looks like money and is
 * off by five orders of magnitude. 10 million lira is far above a shop's single
 * purchase and far below what a decimal-point slip produces.
 */
const MAX_AMOUNT_KURUS = 1_000_000_000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DESCRIPTION_MAX = 60;

/** The model is told to answer with bare JSON; some models still fence it. */
function stripFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

/**
 * Turn the model's reply into a reading.
 *
 * Never throws and never returns a partial number: anything that fails a check is
 * dropped to null, field by field. An unreadable reply is the same as an empty
 * receipt, which the caller already has to handle.
 */
export function parseReceiptReply(raw: string): ReceiptReading {
  let data: unknown;
  try {
    data = JSON.parse(stripFence(raw));
  } catch {
    return EMPTY_READING;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return EMPTY_READING;

  const { amount, category, description, date } = data as Record<string, unknown>;

  return {
    amountKurus: readAmount(amount),
    categoryName: readText(category),
    description: readText(description, DESCRIPTION_MAX),
    txDate: readDate(date),
  };
}

/**
 * Lira → kuruş, refusing anything that is not a usable amount.
 *
 * Rounding is the only place a fraction may be lost, and it happens after the
 * multiplication so 12.345 lira becomes 1235 kuruş rather than 1234 — the same
 * rule `parseAmountToKurus` uses for typed input.
 */
function readAmount(value: unknown): number | null {
  const lira = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(lira) || lira <= 0) return null;

  const kurus = Math.round(lira * 100);
  if (kurus <= 0 || kurus > MAX_AMOUNT_KURUS) return null;
  return kurus;
}

function readText(value: unknown, max = 120): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * A date only counts if it is a real calendar day and not in the future.
 *
 * A receipt dated tomorrow is a misread year or a swapped day/month, and either
 * would file the expense into a month the user never looks at again.
 */
function readDate(value: unknown, todayIso?: string): string | null {
  const text = readText(value, 10);
  if (!text || !ISO_DATE.test(text)) return null;

  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip guard: '2026-02-31' parses, but not back to itself.
  if (parsed.toISOString().slice(0, 10) !== text) return null;

  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  if (text > today) return null;

  return text;
}

/** Exposed for tests, which must not depend on the real clock. */
export const _readDate = readDate;

/**
 * Match a scanned category name against the account's own.
 *
 * Case- and space-insensitive, but never fuzzy: "Market" matching "Market Gideri"
 * would file the expense somewhere the user did not choose, and they would have
 * no reason to look. An unmatched name is dropped, and the form keeps whatever
 * category it already had.
 */
export function matchCategory(scanned: string | null, available: string[]): string | null {
  if (!scanned) return null;
  const norm = (s: string) => s.trim().toLocaleLowerCase('tr-TR');
  const target = norm(scanned);
  return available.find((name) => norm(name) === target) ?? null;
}
