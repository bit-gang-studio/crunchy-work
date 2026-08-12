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
 */
export function rankForIndex(ranks: string[], index: number): string {
  const clamped = Math.max(0, Math.min(index, ranks.length))
  return rankBetween(ranks[clamped - 1] ?? null, ranks[clamped] ?? null)
}
