/**
 * Comparison shared by the PIN and the account password. Pure, so both can be
 * tested without a device.
 */

/**
 * Constant-time-ish comparison. JS string `===` short-circuits on the first
 * differing character, and the difference is measurable across enough attempts;
 * this compares every character regardless.
 */
export function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
