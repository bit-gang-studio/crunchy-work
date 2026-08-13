import type { ProjectDetail } from '../../shared/types'

/**
 * What changed between two reads of a board.
 *
 * The live-update signal is deliberately just a nudge — the server watches the
 * database *file*, so it genuinely cannot know what changed, only that
 * something did (see `server/events.ts` for why that trade is the right one).
 * The client refetches and works it out here instead, which is the same answer
 * arrived at from the other end: the board read is three queries, so comparing
 * two of them is cheaper than the bookkeeping typed server events would need.
 *
 * This exists so the UI can react to the *kind* of change and not just redraw —
 * a card arriving from an agent mid-session should announce itself.
 */
export type ProjectChanges = {
  /** Cards present now that were not there before. */
  added: string[]
  /** Cards that went from open to complete. */
  completed: string[]
  /** Cards that changed column. */
  moved: string[]
  /** Docs present now that were not there before. */
  addedDocs: string[]
}

const NOTHING: ProjectChanges = { added: [], completed: [], moved: [], addedDocs: [] }

export function diffProjects(prev: ProjectDetail | null, next: ProjectDetail): ProjectChanges {
  // The first read is not a change. Without this the whole board would announce
  // itself on every page load, which is noise, not life.
  if (!prev) return NOTHING

  const before = new Map(
    prev.columns.flatMap((column) => column.cards.map((card) => [card.id, { card, column }] as const)),
  )

  const added: string[] = []
  const completed: string[] = []
  const moved: string[] = []

  for (const column of next.columns) {
    for (const card of column.cards) {
      const was = before.get(card.id)
      if (!was) {
        added.push(card.id)
        continue
      }
      if (!was.card.completed && card.completed) completed.push(card.id)
      if (was.column.id !== column.id) moved.push(card.id)
    }
  }

  const knownDocs = new Set(prev.docs.map((doc) => doc.id))
  const addedDocs = next.docs.filter((doc) => !knownDocs.has(doc.id)).map((doc) => doc.id)

  return { added, completed, moved, addedDocs }
}

/** True when nothing at all moved — lets a caller skip work on the common no-op refetch. */
export function isUnchanged(changes: ProjectChanges): boolean {
  return (
    changes.added.length === 0 &&
    changes.completed.length === 0 &&
    changes.moved.length === 0 &&
    changes.addedDocs.length === 0
  )
}
