import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type Collision,
  type CollisionDetection,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import type { ColumnWithCards, Card } from '../../shared/types'
import {
  COLUMN_PREFIX,
  columnIdFromDrag,
  containerOf,
  isColumnDrag,
  pastMidpoint,
  previewMove,
  resolveCommit,
  sameOrder,
} from './boardDnd'
import { suppressNextClick } from './suppressNextClick'

/**
 * Place the dragged card in the preview relative to the card/column under the pointer:
 * - crossing *into* another column → immediately before the hovered card (so hovering its
 *   first card lands the card first — every slot, including the top, stays reachable), or
 *   at the end when hovering the column's empty space;
 * - within its current column → by the pointer's side of the hovered card: below its
 *   midpoint lands after, above lands before.
 * Hovering its own placeholder (`id === overId`) leaves the preview untouched, which keeps
 * a cross-column drop pinned at the first slot instead of drifting. Returns the same array
 * reference when nothing changed, to skip a re-render.
 */
function reposition(cols: ColumnWithCards[], id: string, overId: string, after: boolean): ColumnWithCards[] {
  if (id === overId) return cols
  const overCol = containerOf(cols, overId)
  if (!overCol) return cols
  const next = previewMove(cols, id, overId, containerOf(cols, id) === overCol && after)
  return sameOrder(next, cols) ? cols : next
}

/**
 * Whether the dragged card should land after the hovered card — from the live pointer
 * (drag-start pointer + accumulated delta) versus the hovered card's rect midpoint. Uses
 * the pointer, never the dragged rect, so it can't oscillate on a reflow (the flicker fix).
 */
function afterFromEvent(e: DragMoveEvent): boolean {
  const activator = e.activatorEvent as PointerEvent | null
  const rect = e.over?.rect
  if (!rect || activator?.clientY == null) return false
  return pastMidpoint(activator.clientY + e.delta.y, rect)
}

/**
 * The board's drag-and-drop.
 *
 * One idea, one source of truth: while a card is dragged we keep a `preview` of the board
 * and follow a single rule — **the card goes immediately before whatever card the pointer
 * is over** (or at the end of a column when the pointer is in its empty space). What you
 * see (the dashed placeholder is the card's slot in the preview) is exactly what gets
 * saved on drop — the commit *is* the preview — so the placeholder can never lie and every
 * slot, including the first, is reachable. The only board-specific bit is turning the final
 * slot into a fractional rank (`resolveCommit`).
 */
export function useKanbanDnd(
  columns: ColumnWithCards[],
  commit: (cardId: string, toColumnId: string, rank: string) => void | Promise<void>,
  fullColumns: ColumnWithCards[] = columns,
  /** Reordering columns. Omitted where columns are fixed (the harness). */
  commitColumn?: (columnId: string, index: number) => void | Promise<void>,
) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ColumnWithCards[] | null>(null)
  // Mouse: drag starts after a 5px nudge (a plain click still opens the card). Touch: a
  // 200ms long-press picks the card up, so a quick swipe scrolls the column instead of
  // hijacking into a drag — the standard mobile DnD split. (Separate Mouse/Touch sensors,
  // not one PointerSensor, so touch can require the press-delay while mouse stays instant.)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  // Coalesce drag-over updates to one per animation frame. dnd-kit re-measures the dragged
  // card's scrollable ancestors on every relocation; doing that synchronously inside each
  // onDragOver, cross-column and with many cards, sets up a measure→re-render→measure
  // cascade that trips React's update limit (#185). Deferring the relocation to a rAF
  // decouples our re-render from dnd-kit's measure pass, so the cascade can't build.
  const rafRef = useRef(0)
  const pendingRef = useRef<{ id: string; overId: string; after: boolean } | null>(null)
  // The before/after decision for the current `over`, computed in collisionDetection where
  // dnd-kit gives the pointer and the card rect in one coordinate space (reliable inside a
  // scrollable column). onDragMove reads it back for that same over id.
  const afterRef = useRef(false)
  const afterOverRef = useRef<string | null>(null)
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const rendered = preview ?? columns
  const activeCard: Card | null = activeId
    ? (rendered.flatMap((c) => c.cards).find((t) => t.id === activeId) ?? null)
    : null
  /** The column being reordered, so the board can float it like Trello lifts a list. */
  const activeColumn: ColumnWithCards | null =
    activeId && isColumnDrag(activeId)
      ? (rendered.find((c) => c.id === columnIdFromDrag(activeId)) ?? null)
      : null

  // `over` = the card under the pointer, preferring a real card over the dragged card's own
  // placeholder, and a card over its column. If only the placeholder is under the pointer,
  // `over` is the dragged card itself → the preview is left untouched (no jitter). If only
  // the column is under the pointer (its empty tail) → drop at the end.
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      /*
       * Reordering a column is a different problem from moving a card — one
       * horizontal list, no containers to cross, no before/after within an item
       * — so it gets its own path rather than being folded into the card logic
       * below, and the card path stays untouched.
       *
       * It used dnd-kit's stock `closestCenter`, on the reasoning that a
       * horizontal list of equal-width items is exactly what the stock strategy
       * is for. That was wrong for the reason below, and the two paths now agree
       * on the one rule that matters: the pointer decides.
       */
      if (activeId && isColumnDrag(activeId)) {
        const columnDroppables = args.droppableContainers.filter((c) => isColumnDrag(String(c.id)))
        const px = args.pointerCoordinates?.x
        /*
         * The column you are POINTING AT, not the one your dragged rect happens
         * to centre on — the same rule the card path already follows, and for
         * the same reason.
         *
         * This was `closestCenter`, which measures from the dragged element's
         * translated centre. A column is 288px wide and you grab it by its
         * header, usually near the left edge, so that centre sits ~100px to the
         * RIGHT of your pointer. Aiming at the first column therefore put the
         * measured centre almost exactly on the boundary between the first and
         * second — a tie, decided by whatever the rects happened to be that
         * frame.
         *
         * And they moved between frames: the board scrolls horizontally, the
         * pointer at the left edge sits inside the auto-scroll band, and every
         * column's rect slides while the pointer is perfectly still. Traced, on
         * a stationary pointer: the first column's centre swung from -26 to +5
         * across consecutive collision passes. So the tie broke whichever way
         * the scroll happened to be mid-flight at the moment of release —
         * dropping a column at the front landed it second about three times in
         * five, on a board wide enough to scroll.
         *
         * Horizontal distance from the pointer to each column's box (zero when
         * the pointer is inside it) has neither problem: it is what the user
         * sees, it does not care where you gripped, and a 100px scroll drift
         * cannot flip a decision separated by a column's full width.
         */
        if (px != null) {
          let best: { id: UniqueIdentifier; dist: number } | null = null
          for (const c of columnDroppables) {
            const r = args.droppableRects.get(c.id)
            if (!r) continue
            const dist = px < r.left ? r.left - px : px > r.left + r.width ? px - (r.left + r.width) : 0
            if (!best || dist < best.dist) best = { id: c.id, dist }
          }
          if (best) return [{ id: best.id }]
        }
        // No pointer (a keyboard drag) — the dragged rect is all there is.
        return closestCenter({ ...args, droppableContainers: columnDroppables })
      }

      const hits = pointerWithin(args)
      /*
       * Anything that isn't a column droppable is a card — so both column id
       * shapes have to be excluded, not just `col:`. Making columns sortable
       * registers a second droppable per column (`coldrag:`), and because that
       * does not start with `col:` it was being treated as a card: hovering an
       * empty column resolved to the column's own drag handle and the drop went
       * nowhere. The harness caught it.
       */
      const cards = hits.filter(
        (h) => !String(h.id).startsWith(COLUMN_PREFIX) && !isColumnDrag(String(h.id)),
      )
      let over: Collision | undefined = cards.find((h) => String(h.id) !== activeId) ?? cards[0]
      if (!over) {
        // The pointer isn't directly over a card — it's over a column droppable, which means a
        // GAP between cards (pointerWithin misses the 8px gaps), an empty column, or the tail
        // below the last card. Snap to the nearest card *in that column* by the pointer's
        // distance to each card's vertical centre, so a mid-list drop in a gap lands between
        // cards instead of appending to the end. (Done by hand from the pointer + measured
        // rects — closestCenter measures from the dragged card's offset rect, which resolved a
        // gap to the column.) With no other card (empty column) the column droppable stands.
        const colHit = hits.find((h) => String(h.id).startsWith(COLUMN_PREFIX))
        const py = args.pointerCoordinates?.y
        if (colHit && py != null) {
          const colId = String(colHit.id).slice(COLUMN_PREFIX.length)
          let best: { id: string; dist: number } | null = null
          for (const t of columns.find((c) => c.id === colId)?.cards ?? []) {
            const r = t.id === activeId ? undefined : args.droppableRects.get(t.id)
            if (!r) continue
            const dist = Math.abs(py - (r.top + r.height / 2))
            if (!best || dist < best.dist) best = { id: t.id, dist }
          }
          over = best ? { id: best.id } : colHit
        } else {
          over = colHit
        }
      }
      if (over) {
        // Decide land-before vs land-after here, from the pointer and the hovered card's rect
        // as dnd-kit measured them together — one coordinate space, so it's correct even when
        // the card sits inside a scrollable column (reconstructing from delta wasn't).
        const rect = args.droppableRects.get(over.id)
        const py = args.pointerCoordinates?.y
        afterRef.current = rect && py != null ? pastMidpoint(py, rect) : false
        afterOverRef.current = String(over.id)
      }
      return over ? [over] : []
    },
    [activeId, columns],
  )

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id)
    setActiveId(id)
    // A column drag has no card preview to build — dnd-kit's sortable transform
    // shows the reorder directly.
    if (!isColumnDrag(id)) setPreview(columns)
  }

  // Driven by onDragMove (fires on *every* pointer move), not onDragOver (fires only when the
  // hovered card changes) — because before/after flips as the pointer crosses a card's
  // midpoint *within* the same card, which onDragOver would never re-report.
  function onDragMove(e: DragMoveEvent) {
    const { active, over } = e
    if (!over || isColumnDrag(String(active.id))) return
    const overId = String(over.id)
    const after = afterOverRef.current === overId ? afterRef.current : afterFromEvent(e)
    // Remember the latest target and apply it at most once per frame (see rafRef above).
    pendingRef.current = { id: String(active.id), overId, after }
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const p = pendingRef.current
      pendingRef.current = null // applied — so onDragEnd only flushes an un-applied target
      if (p) setPreview((prev) => reposition(prev ?? columns, p.id, p.overId, p.after))
    })
  }

  function onDragEnd(e: DragEndEvent) {
    // Something was dragged — swallow the trailing `click` the browser fires on release, so
    // the drop never also fires the dragged element's own handler (opening a card's detail,
    // or putting a column header into rename mode). A plain click never starts a drag (5px
    // sensor), so onDragEnd doesn't run and the click does what it should.
    suppressNextClick()

    const activeIdString = String(e.active.id)
    if (isColumnDrag(activeIdString)) {
      setActiveId(null)
      const overId = e.over ? String(e.over.id) : null
      if (overId && overId !== activeIdString) {
        const index = columns.findIndex((c) => c.id === columnIdFromDrag(overId))
        if (index >= 0) void commitColumn?.(columnIdFromDrag(activeIdString), index)
      }
      return
    }

    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    // Flush the last pending relocation so the drop lands exactly where the pointer is,
    // even if its rAF hadn't fired yet.
    const pending = pendingRef.current
    pendingRef.current = null
    let base = preview ?? columns
    if (pending) base = reposition(base, pending.id, pending.overId, pending.after)
    const id = String(e.active.id)
    setActiveId(null)
    setPreview(null)
    // Commit exactly the preview the user saw — the card lands precisely at the dashed
    // placeholder. Guard the whole thing: computing a rank between two neighbours throws if
    // their ranks aren't strictly increasing (e.g. duplicate ranks in the data). A throw here
    // escapes into dnd-kit's batched drag-end and cascades into a React render loop (error
    // #185) that white-screens the app — so we never let it out.
    try {
      const move = resolveCommit(columns, base, id, fullColumns)
      if (move) void commit(id, move.toColumnId, move.rank)
    } catch (err) {
      console.error('[crunchy] drag drop failed — likely degenerate/duplicate ranks', {
        activeId: id,
        columns: base.map((c) => ({ column: c.id, ranks: c.cards.map((t) => `${t.id}:${t.rank}`) })),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  function onDragCancel() {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    pendingRef.current = null
    setActiveId(null)
    setPreview(null)
  }

  return {
    columns: rendered,
    activeCard,
    activeColumn,
    dndProps: {
      sensors,
      collisionDetection,
      onDragStart,
      onDragMove,
      onDragEnd,
      onDragCancel,
      /*
       * Auto-scroll, tuned. dnd-kit enables it by default but with a narrow
       * activation band, which on a horizontally scrolling board means dragging
       * a card to an off-screen column mostly doesn't work — you hit the edge
       * and nothing happens. A wider threshold and gentler acceleration is
       * closer to Trello, where approaching the edge reliably pulls the board
       * along.
       */
      autoScroll: { threshold: { x: 0.2, y: 0.2 }, acceleration: 12, interval: 5 },
    },
  }
}
