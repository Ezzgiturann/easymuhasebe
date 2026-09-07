/**
 * Money is stored as INTEGER kuruş everywhere. These helpers convert to/from the
 * user-facing lira string. Turkish formatting: '.' thousands, ',' decimals.
 */

/** Format kuruş as a Turkish lira string, e.g. 68000 -> "680,00". */
export function formatKurus(kurus: number): string {
  const negative = kurus < 0;
  const abs = Math.abs(kurus);
  const lira = Math.floor(abs / 100);
  const cents = abs % 100;
  const liraStr = lira.toLocaleString('tr-TR');
  const centsStr = cents < 10 ? `0${cents}` : String(cents);
  return `${negative ? '-' : ''}${liraStr},${centsStr}`;
}

/** Format kuruş with the ₺ suffix, e.g. 68000 -> "680,00 ₺". */
export function formatTRY(kurus: number): string {
  return `${formatKurus(kurus)} ₺`;
}

/**
 * Kuruş back into what an amount input contains, so it round-trips through
 * `parseAmountToKurus`. Deliberately NOT `formatKurus` — its thousand separators
 * parse back as NaN, which would silently zero an amount on edit.
 *
 * The sign is peeled off first. Working on the raw value made `Math.floor` round
 * a negative *away* from zero while `%` kept its sign, so -2599 came out as
 * "-26,-99" — which parses back to 0 and quietly erased the amount being edited.
 */
export function kurusToInput(kurus: number): string {
  const negative = kurus < 0;
  const abs = Math.abs(Math.round(kurus));
  const lira = Math.floor(abs / 100);
  const cents = abs % 100;
  const body = cents === 0 ? String(lira) : `${lira},${String(cents).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/**
 * Parse a user-typed amount string into kuruş. Accepts digits with an optional
 * ',' or '.' decimal separator (max 2 fraction digits). Returns integer kuruş.
 */
export function parseAmountToKurus(input: string): number {
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}
