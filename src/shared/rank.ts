import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

/**
 * Fractional ranks (LexoRank-style): ordering is a string key between its
 * neighbours, so moving one card rewrites one row instead of renumbering a
 * column. Sort by `rank` ascending, always.
 *
 * These keys compare **by code point**. SQLite's default BINARY collation is
 * exactly that, so nothing special is needed here — but it is the one thing
 * that bit Crunchy Team, whose Postgres was created `en_US.utf8` and therefore
 * sorted case-insensitively. A key like `Z…` (a card dragged to the very top)
 * then sorted after `a…` on the server and before it on the client, the drop
 * computed a key "between" two out-of-order neighbours, and the generator threw
 * and took the board down with it. If a rank column is ever added on Postgres,
 * pin it to `C` collation.
 */

/** The rank for a single item appended after `last` (or the first, if none). */
export function rankAfter(last: string | null): string {
  return generateKeyBetween(last ?? null, null)
}

/** The rank for an item placed before `first` (or the first, if none). */
export function rankBefore(first: string | null): string {
  return generateKeyBetween(null, first ?? null)
}

/** The rank for an item dropped between two neighbours; either may be absent at an edge. */
export function rankBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before ?? null, after ?? null)
}

/** `n` evenly spaced ranks, for seeding a list in one go. */
export function initialRanks(n: number): string[] {
  return generateNKeysBetween(null, null, n)
}

/**
 * Resolve the rank for an item moved to `index` within `ranks` — the ranks of
 * the items it will sit among, in order, *excluding* the item being moved.
 *
 * `index` is floored and coerced, not trusted. It arrives from a model over
 * MCP, and a model asked to put something "between 1 and 2" will quite
 * reasonably send `1.5`. That used to clamp but never floor, so `ranks[1.5]`
 * was `undefined` on both sides and the generator regenerated the *first* key —
 * producing two rows with the identical rank, silent misplacement, and a
 * poisoned column whose next legitimate move died with an error reading, in
 * full, ">=".
 */
export function rankForIndex(ranks: string[], index: number): string {
  // Only NaN needs special handling — every comparison against it is false, so
  // the clamp below would pass it straight through. ±Infinity clamps correctly
  // on its own, and "position: Infinity" meaning "the end" is the right reading.
  const wanted = Math.floor(Number(index))
  const clamped = Number.isNaN(wanted) ? 0 : Math.max(0, Math.min(wanted, ranks.length))
  const before = ranks[clamped - 1] ?? null
  const after = ranks[clamped] ?? null

  /*
   * Neighbours that are equal or out of order make `generateKeyBetween` throw,
   * and its entire message is ">=" — which reaches the user as a crashed board
   * or an MCP reply saying nothing at all. A column can only be in that state
   * from data written before the flooring above existed, but it must still be
   * recoverable: append after the earlier neighbour instead of failing.
   */
  if (before !== null && after !== null && before >= after) return rankAfter(before)
  return rankBetween(before, after)
}
