import { randomBytes } from 'node:crypto'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const LENGTH = 12

/**
 * A short, URL-safe id. 12 base-62 characters is ~71 bits — far past any
 * collision risk at this scale, and short enough to keep URLs readable.
 *
 * Rejection-samples so every character is uniformly distributed: taking a raw
 * byte modulo 62 would make the first few letters slightly more likely.
 */
export function newId(): string {
  const max = 256 - (256 % ALPHABET.length)
  let out = ''
  while (out.length < LENGTH) {
    for (const byte of randomBytes(LENGTH)) {
      if (byte >= max) continue
      out += ALPHABET[byte % ALPHABET.length]
      if (out.length === LENGTH) break
    }
  }
  return out
}
