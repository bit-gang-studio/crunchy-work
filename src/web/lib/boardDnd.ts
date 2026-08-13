import type { SortingStrategy } from '@dnd-kit/sortable'
import type { ColumnWithCards } from '../../shared/types'
import { rankBetween } from '../../shared/rank'

/**
 * Ported from Crunchy Team, comments and all. This is browser behaviour that
 * was arrived at by fixing real bugs — a mid-drag flicker, a dead zone in the
 * gaps between cards, a render loop that white-screened the board — and none of
 * it is obvious from reading the happy path. Re-deriving it would mean
 * re-earning those bugs.
 */

/** Droppable id prefix for a column itself (vs. a card, whose id is the card id). Lets a
 * card be dropped into an empty column or the space below the last card. */
export const COLUMN_PREFIX = 'col:'

/**
 * Droppable id for a column being *reordered*, as opposed to a column being
 * dropped *into* (`col:`). They have to be different ids: the same column is
 * simultaneously a target for cards and a draggable item itself, and dnd-kit
 * identifies both by id alone.
 */
export const COLUMN_DRAG_PREFIX = 'coldrag:'

export const isColumnDrag = (id: string) => id.startsWith(COLUMN_DRAG_PREFIX)
export const columnIdFromDrag = (id: string) => id.slice(COLUMN_DRAG_PREFIX.length)

/** The preview array is the single source of truth for card order, so the sortable context
 * must NOT independently re-position cards — that's what fought the preview and made the
 * placeholder disagree with the drop. Cards move only when the array re-renders. */
export const noSort: SortingStrategy = () => null

/**
 * Whether the dragged card should land *after* the hovered card — decided by the pointer's
 * vertical position relative to that card's midpoint: below the midpoint → after, above →
 * before. Using the **pointer** (not the dragged card's rect) is what makes this stable:
 * once a swap reflows the column, the pointer stays put, so placement can't oscillate the
 * way the old index-direction rule did when two cards had different heights (the mid-drag
 * flicker). It's also why we avoid the *dragged rect*, whose lag caused an earlier snap-back.
 */
export function pastMidpoint(pointerY: number, rect: { top: number; height: number }): boolean {
  return pointerY > rect.top + rect.height / 2
}

/** The column a drag target belongs to — a `col:<id>` droppable, or the column holding
 * a card id. Used to tell a cross-column move from a same-column reorder. */
export function containerOf(cols: ColumnWithCards[], id: string): string | null {
  if (id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length)
  return cols.find((c) => c.cards.some((t) => t.id === id))?.id ?? null
}

/** Whether two column layouts hold the same cards in the same order — so a preview update
 * that changed nothing can return the previous array and skip a re-render. */
export function sameOrder(a: ColumnWithCards[], b: ColumnWithCards[]): boolean {
  return (
    a.length === b.length &&
    a.every((col, i) => {
      const other = b[i]
      return (
        !!other &&
        col.id === other.id &&
        col.cards.length === other.cards.length &&
        col.cards.every((t, j) => t.id === other.cards[j]?.id)
      )
    })
  )
}

/** The destination column index for an over-target (a card id or `col:<id>`). */
function destColumnIndex(cols: ColumnWithCards[], overId: string): number {
  return overId.startsWith(COLUMN_PREFIX)
    ? cols.findIndex((c) => c.id === overId.slice(COLUMN_PREFIX.length))
    : cols.findIndex((c) => c.cards.some((t) => t.id === overId))
}

/**
 * Drag-preview reducer: return a new set of columns with `activeId` relocated next to
 * `overId` (or appended when `overId` is a column). Pure — the working copy the board
 * renders while a drag is in flight, so it visibly opens a gap where the card will land.
 */
export function previewMove(
  cols: ColumnWithCards[],
  activeId: string,
  overId: string,
  after: boolean,
): ColumnWithCards[] {
  const destIdx = destColumnIndex(cols, overId)
  if (destIdx === -1) return cols

  const moved = cols.flatMap((c) => c.cards).find((t) => t.id === activeId)
  if (!moved) return cols
  const stripped = cols.map((c) =>
    c.cards.some((t) => t.id === activeId) ? { ...c, cards: c.cards.filter((t) => t.id !== activeId) } : c,
  )

  const dest = stripped[destIdx]!
  let index: number
  if (overId.startsWith(COLUMN_PREFIX)) {
    index = dest.cards.length // into a (possibly empty) column → the end
  } else {
    const oi = dest.cards.findIndex((t) => t.id === overId)
    index = oi < 0 ? dest.cards.length : oi + (after ? 1 : 0)
  }
  const cards = [...dest.cards.slice(0, index), moved, ...dest.cards.slice(index)]
  return stripped.map((c, i) => (i === destIdx ? { ...c, cards } : c))
}

/** Where a card sits: its column and its neighbours' ids — for detecting a no-op drop. */
function locate(
  cols: ColumnWithCards[],
  id: string,
): { colId: string; prevId: string | null; nextId: string | null } | null {
  for (const c of cols) {
    const i = c.cards.findIndex((t) => t.id === id)
    if (i >= 0) {
      return { colId: c.id, prevId: c.cards[i - 1]?.id ?? null, nextId: c.cards[i + 1]?.id ?? null }
    }
  }
  return null
}

/** Compare two fractional ranks by code point (binary) — matching SQLite's default
 * collation and `fractional-indexing`'s own ordering. */
function byRank(a: { rank: string }, b: { rank: string }): number {
  return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0
}

/**
 * The rank for the active card at its drop slot, bounded by its *real* neighbours in the
 * destination column: `lower` is the previous card's rank, `upper` the first card ranked
 * strictly above it. Because those two are adjacent real ranks, the generated key is
 * strictly between them and cannot collide with an existing card's key.
 *
 * The `full` column set is separate from the visible one so this stays correct if a filter
 * is ever added — dropping above the first *visible* card must not reuse a key a hidden card
 * already holds. Crunchy has no filters yet, so it defaults to the visible set.
 */
function rankAtSlot(
  full: ColumnWithCards[],
  colId: string,
  activeId: string,
  prevVisibleId: string | null,
): string {
  const others = (full.find((c) => c.id === colId)?.cards ?? [])
    .filter((t) => t.id !== activeId)
    .slice()
    .sort(byRank)
  const lower = prevVisibleId ? (others.find((t) => t.id === prevVisibleId)?.rank ?? null) : null
  const upper = lower == null ? (others[0]?.rank ?? null) : (others.find((t) => t.rank > lower)?.rank ?? null)
  return rankBetween(lower, upper)
}

/**
 * Resolve the move to persist from a finished drag preview: the destination column and
 * the rank between the card's new neighbours. Returns null when the card ended exactly
 * where it began (same column, same neighbours) — nothing to save.
 */
export function resolveCommit(
  original: ColumnWithCards[],
  preview: ColumnWithCards[],
  activeId: string,
  full: ColumnWithCards[] = preview,
): { toColumnId: string; rank: string } | null {
  const to = locate(preview, activeId)
  if (!to) return null
  const from = locate(original, activeId)
  if (from && from.colId === to.colId && from.prevId === to.prevId && from.nextId === to.nextId) {
    return null // dropped back in place
  }
  const dest = preview.find((c) => c.id === to.colId)!
  const idx = dest.cards.findIndex((t) => t.id === activeId)
  const prevVisibleId = dest.cards[idx - 1]?.id ?? null
  return { toColumnId: to.colId, rank: rankAtSlot(full, to.colId, activeId, prevVisibleId) }
}
