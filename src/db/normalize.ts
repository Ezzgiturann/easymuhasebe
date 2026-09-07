/**
 * Fold a free-text description into a stable key for auto-recognition.
 *
 * Lowercase + trim + collapse whitespace, then fold Turkish diacritics
 * (ç→c, ş→s, ı/İ→i, ğ→g, ö→o, ü→u). We fold the Turkish letters explicitly
 * BEFORE lowercasing because JS `toLowerCase()` mishandles the dotted/dotless
 * i pair ('İ'→'i̇' with a combining dot, 'I'→'i'), which would split otherwise
 * identical descriptions into different keys.
 */
export function normalizeDescription(input: string | null | undefined): string {
  if (!input) return '';
  const folded = input
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'u')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i');
  return folded.toLowerCase().trim().replace(/\s+/g, ' ');
}
