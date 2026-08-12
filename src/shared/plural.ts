/**
 * "1 card" / "2 cards" / "0 cards".
 *
 * Tolerates a missing count deliberately. A running server can be older than
 * the assets it serves — Node loads the compiled server once at boot, while
 * static files are read per request — so a field the UI expects can genuinely be
 * absent, and `undefined cards` is exactly the kind of thing that makes software
 * look broken. Absent reads as zero.
 */
export function plural(count: number | null | undefined, word: string): string {
  const n = typeof count === 'number' && Number.isFinite(count) ? count : 0
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
