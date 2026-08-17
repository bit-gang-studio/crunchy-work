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
