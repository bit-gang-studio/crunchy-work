import { useCallback, useEffect, useState } from 'react'
import type { ColumnWithCards } from '../../shared/types'

const KEY = 'crunchy.showCompleted'

/** Columns with completed cards removed, and the number removed. */
export function withoutCompleted(columns: ColumnWithCards[]): {
  columns: ColumnWithCards[]
  hidden: number
} {
  let hidden = 0
  const next = columns.map((column) => {
    const cards = column.cards.filter((card) => {
      if (!card.completed) return true
      hidden++
      return false
    })
    // Same array reference when a column has nothing completed in it, so React
    // can skip re-rendering columns the filter did not touch.
    return cards.length === column.cards.length ? column : { ...column, cards }
  })
  return { columns: hidden ? next : columns, hidden }
}

/**
 * How many cards are ticked, whether or not they are currently hidden.
 *
 * Separate from `withoutCompleted`'s `hidden` on purpose. That number is how
 * many the filter is *holding back*, so it is zero the moment you reveal them —
 * which is why the control could only ever say "(1)" in one of its two states,
 * and had to change its label to have anything to say in the other. The count
 * is a fact about the board, not about the filter, so it is computed from the
 * board.
 */
export function countCompleted(columns: ColumnWithCards[]): number {
  return columns.reduce((n, column) => n + column.cards.filter((c) => c.completed).length, 0)
}

/**
 * Whether finished work is on screen. Off by default: a board is for what is
 * left to do, and a Done column that only ever grows buries the two cards you
 * are actually working on.
 *
 * Persisted, because it is a viewing preference rather than a per-visit choice —
 * having to re-hide finished cards every time you open a board is worse than not
 * being able to hide them at all.
 *
 * A *view* filter only. It never touches what the API returns or what an agent
 * sees over MCP, so `get_project` still reports the whole board and a card hidden
 * here is not a card anyone else has lost.
 */
export function useShowCompleted(): [boolean, (next: boolean) => void] {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(show))
    } catch {
      /* storage blocked — the choice just will not survive a reload */
    }
  }, [show])

  return [show, useCallback((next: boolean) => setShow(next), [])]
}
