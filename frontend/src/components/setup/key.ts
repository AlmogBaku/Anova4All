const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const KEY_LENGTH = 10;
/** Largest multiple of 36 that fits in a byte: bytes >= 252 are rejected (no modulo bias). */
const LIMIT = 256 - (256 % ALPHABET.length);

/**
 * A fresh 10-character [a-z0-9] cooker key from crypto.getRandomValues with
 * rejection sampling. The caller keeps it in memory only: never store or log it.
 */
export function generateKey(
  random: (buf: Uint8Array<ArrayBuffer>) => Uint8Array = (buf) =>
    crypto.getRandomValues(buf),
): string {
  let key = "";
  while (key.length < KEY_LENGTH) {
    const bytes = random(new Uint8Array(16));
    for (const b of bytes) {
      if (b >= LIMIT) continue;
      key += ALPHABET[b % ALPHABET.length];
      if (key.length === KEY_LENGTH) break;
    }
  }
  return key;
}
