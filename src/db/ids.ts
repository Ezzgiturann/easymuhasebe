import * as Crypto from 'expo-crypto';

/**
 * Generate a time-ordered UUID (v7-style): 48-bit big-endian millisecond
 * timestamp prefix + random tail, laid over a random v4 UUID. Time-ordered ids
 * keep list ordering and last-write-wins tiebreaks sensible even though ids are
 * minted on-device with no server coordination.
 *
 * `expo-crypto` provides native randomness, so no `crypto.getRandomValues`
 * polyfill is required on React Native.
 */
export function newId(): string {
  // Start from a random v4 UUID for the random bits.
  const base = Crypto.randomUUID().replace(/-/g, '').split('');

  // Overwrite the first 48 bits with the current time in ms (12 hex chars).
  const ts = Date.now().toString(16).padStart(12, '0').slice(-12);
  for (let i = 0; i < 12; i++) base[i] = ts[i];

  // Set version (7) and variant (10xx) nibbles.
  base[12] = '7';
  base[16] = ((parseInt(base[16], 16) & 0x3) | 0x8).toString(16);

  const hex = base.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
