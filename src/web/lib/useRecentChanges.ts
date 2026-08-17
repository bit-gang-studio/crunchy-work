import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectDetail } from '../../shared/types'
import { diffProjects, isUnchanged } from './projectDiff'

/**
 * The ids of cards that changed a moment ago, so the board can show it.
 *
 * The product's whole demo is watching your agent work — cards arriving,
 * checkboxes ticking, while you do nothing. A board that silently redraws makes
 * that invisible unless you happen to be looking at the right column, so the
 * changed cards mark themselves for a couple of seconds and then settle.
 *
 * The set is derived, not pushed: `diffProjects` compares two reads, so this works
 * identically whether the change came from this tab, another tab, or a `crunchy
 * mcp` process the server only knows about because a file changed.
 *
 * Timers are tracked and cleared on unmount rather than returned as the effect's
 * cleanup — cleaning up on the *next* board would cancel the un-highlight and
 * leave a card lit forever.
 */
export function useRecentChanges(
  board: ProjectDetail | null,
  ttlMs = 2200,
): [ReadonlySet<string>, (cardId: string) => void] {
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())
  const previous = useRef<ProjectDetail | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const mine = useRef<Set<string>>(new Set())

  /*
   * "I did this one." Called before the change is applied, so the diff it
   * causes is skipped exactly once.
   *
   * Ticking your own card was pulsing it amber for 2.2 seconds — the signal
   * that means "something changed while you were not looking" fired on the
   * thing you were looking at and had just clicked. Worse in the default view,
   * where the card is being filtered off the board at that moment, so it
   * announced itself on the way out.
   *
   * The rule was already written down one line below and only applied to moves:
   * dragging a card is something you did. So is ticking it. What earns the mark
   * is a change you did not make — from an agent, another tab, or a `crunchy
   * mcp` process — and the derived-not-pushed diff cannot tell those apart on
   * its own, because a local optimistic update looks exactly like a remote one.
   */
  const markLocal = useCallback((cardId: string) => {
    mine.current.add(cardId)
  }, [])

  useEffect(() => {
    if (!board) return
    const changes = diffProjects(previous.current, board)
    previous.current = board
    if (isUnchanged(changes)) return

    // A move is not marked: dragging a card is something you did, and it is
    // already the most visible thing on screen.
    const ids = [...changes.added, ...changes.completed].filter((id) => {
      if (!mine.current.has(id)) return true
      mine.current.delete(id)
      return false
    })
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

  return [fresh, markLocal]
}
