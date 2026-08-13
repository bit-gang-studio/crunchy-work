import { useEffect, useRef, useState } from 'react'
import type { Board } from '../../shared/types'
import { diffBoards, isUnchanged } from './boardDiff'

/**
 * The ids of cards that changed a moment ago, so the board can show it.
 *
 * The product's whole demo is watching your agent work — cards arriving,
 * checkboxes ticking, while you do nothing. A board that silently redraws makes
 * that invisible unless you happen to be looking at the right column, so the
 * changed cards mark themselves for a couple of seconds and then settle.
 *
 * The set is derived, not pushed: `diffBoards` compares two reads, so this works
 * identically whether the change came from this tab, another tab, or a `crunchy
 * mcp` process the server only knows about because a file changed.
 *
 * Timers are tracked and cleared on unmount rather than returned as the effect's
 * cleanup — cleaning up on the *next* board would cancel the un-highlight and
 * leave a card lit forever.
 */
export function useRecentChanges(board: Board | null, ttlMs = 2200): ReadonlySet<string> {
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())
  const previous = useRef<Board | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!board) return
    const changes = diffBoards(previous.current, board)
    previous.current = board
    if (isUnchanged(changes)) return

    // A move is not marked: dragging a card is something you did, and it is
    // already the most visible thing on screen.
    const ids = [...changes.added, ...changes.completed]
    if (!ids.length) return

    setFresh((prev) => new Set([...prev, ...ids]))
    timers.current.push(
      setTimeout(() => {
        setFresh((prev) => {
          const next = new Set(prev)
          for (const id of ids) next.delete(id)
          return next
        })
      }, ttlMs),
    )
  }, [board, ttlMs])

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer)
    },
    [],
  )

  return fresh
}
