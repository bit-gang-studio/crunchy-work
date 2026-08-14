import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProjectDetail } from '../../shared/types'
import { api } from '../lib/api'
import { Screen } from '../components/Screen'
import { KanbanBoard } from '../components/KanbanBoard'
import { CardDetail } from '../components/CardDetail'
import { ProjectHeader } from '../components/ProjectHeader'
import { CompletedFilter } from '../components/CompletedFilter'
import { ErrorState, Loading } from '../components/States'
import { useLiveUpdates } from '../lib/useLiveUpdates'
import { useRecentChanges } from '../lib/useRecentChanges'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useShowCompleted, withoutCompleted } from '../lib/completedFilter'
import { cacheProject, readCachedProject } from '../lib/projectCache'

export function BoardScreen({ projectId, cardId }: { projectId: string; cardId?: string }) {
  const navigate = useNavigate()
  // Start from the last read of this project if there is one, so switching
  // section does not empty the screen for the length of a round trip.
  const [board, setBoard] = useState<ProjectDetail | null>(() => readCachedProject(projectId))
  useDocumentTitle(board?.project.name)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [showCompleted, setShowCompleted] = useShowCompleted()

  const load = useCallback(async () => {
    try {
      const next = await api.getProject(projectId)
      cacheProject(next)
      setBoard(next)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  // Cards appear as the agent writes them; held while a drag is in flight.
  useLiveUpdates(() => void load(), { paused: dragging })

  // …and the ones that just arrived say so, briefly.
  const recentlyChanged = useRecentChanges(board)

  /**
   * Moves are applied optimistically: the drag engine already resolved the exact
   * rank for the slot the user saw, so the board can show the result immediately
   * and reconcile with the server afterwards. Without this the card would visibly
   * snap back to its old position for the length of a round trip.
   */
  async function onMove(cardId: string, toColumnId: string, rank: string) {
    setBoard((prev) => (prev ? applyMove(prev, cardId, toColumnId, rank) : prev))
    try {
      await api.moveCard(cardId, { columnId: toColumnId, rank })
    } finally {
      await load()
    }
  }

  async function onAddCard(columnId: string, title: string, position?: 'top' | 'bottom') {
    const card = await api.addCard(columnId, { title })
    if (position === 'top') await api.moveCard(card.id, { index: 0 })
    await load()
  }

  async function onToggleComplete(cardId: string, completed: boolean) {
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((c) => ({
              ...c,
              cards: c.cards.map((k) => (k.id === cardId ? { ...k, completed } : k)),
            })),
          }
        : prev,
    )
    await api.updateCard(cardId, { completed })
    await load()
  }

  if (error) {
    return (
      <Screen scroll="document">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <ErrorState message={error} retry={() => void load()} backTo="/" />
        </div>
      </Screen>
    )
  }

  if (!board) {
    /*
     * The same shell as the loaded board, not a bare skeleton.
     *
     * This used to return columns on their own, with no project header — so the
     * whole board sat under the app header while loading and then dropped by the
     * header's full height the moment the data landed. A column-shaped skeleton
     * was carefully avoiding a jump of a few pixels inside a jump of about a
     * hundred and twenty.
     *
     * The docs screens already had this right: render the header immediately
     * with a placeholder name, because the one thing known before the fetch
     * returns is that a header is going to be there. Guarded by an e2e
     * assertion that the first column's top does not move across the load.
     */
    return (
      <Screen scroll="canvas">
        <div className="flex h-full flex-col">
          <ProjectHeader projectId={projectId} name="…" onChanged={() => void load()} />
          {/* `screen-in` here too, and it matters more than it looks.
              Arriving from Docs, this skeleton mounts for about 30ms before the
              board lands — long enough to read as a bright flash between the
              docs fading out and the board fading in. Fading it on the same
              curve means it only ever reaches about 15% opacity before it is
              replaced, so the flash never happens. */}
          <div className="screen-in min-h-0 flex-1">
            {/* Column-shaped, so the board does not jump when it lands — which
                now means content-height and top-aligned, matching the real
                columns. A full-height skeleton would have been a shape the
                loaded board no longer takes. */}
            <div className="flex h-full items-start gap-4 px-4 py-4 md:px-6 md:py-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  data-testid="column-skeleton"
                  className="w-72 shrink-0 rounded-panel bg-sunken p-2"
                >
                  <Loading label="Loading board" rows={2} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Screen>
    )
  }

  const cardCount = board.columns.reduce((n, column) => n + column.cards.length, 0)
  /*
   * The board renders the filtered set and resolves ranks against the whole
   * one. Dropping above the first *visible* card must not reuse a key a hidden
   * card already holds — `useKanbanDnd` has taken both sets since it was
   * written, and this is the first caller to actually give it two.
   */
  const { columns: visibleColumns, hidden } = showCompleted
    ? { columns: board.columns, hidden: 0 }
    : withoutCompleted(board.columns)

  return (
    <Screen scroll="canvas">
      <div className="flex h-full flex-col">
        <ProjectHeader
          projectId={projectId}
          name={board.project.name}
          description={board.project.description}
          onChanged={() => void load()}
          actions={
            cardCount > 0 && (
              <CompletedFilter
                showing={showCompleted}
                hidden={hidden}
                onChange={setShowCompleted}
              />
            )
          }
        />
        {/*
          * Nothing here for an empty board, deliberately.
          *
          * This slot held the teaching: first a full `EmptyState` panel, then a
          * sentence and a `bg-code` block. Both failed the same way. They
          * assumed an agent was already connected, so the only instruction on
          * screen was the one that could not work yet; they taught on every
          * empty board forever, so a tenth project got a tutorial; and wedged
          * above three empty columns they read as debris.
          *
          * New projects arrive with two cards that teach instead — see
          * `lib/seedProject.ts`. An empty board now means nothing more than an
          * empty board, which is the only thing it was ever entitled to say.
          */}

        {/* `screen-in`: the board fades in when you arrive from Docs. On the
            content only — the header is the one thing that does not change
            between the two sections, so fading it would be a flicker. */}
        <div className="screen-in min-h-0 flex-1">
          <KanbanBoard
            columns={visibleColumns}
            allColumns={board.columns}
            onMove={onMove}
            onAddCard={onAddCard}
            onToggleComplete={onToggleComplete}
            onOpenCard={(id) => navigate(`/projects/${projectId}/cards/${id}`)}
            onDragStateChange={setDragging}
            recentlyChanged={recentlyChanged}
            onAddColumn={async (name) => {
              await api.addColumn(projectId, name)
              await load()
            }}
            onRenameColumn={async (columnId, name) => {
              await api.renameColumn(columnId, name)
              await load()
            }}
            onDeleteColumn={async (columnId) => {
              await api.deleteColumn(columnId)
              await load()
            }}
            onMoveColumn={async (columnId, index) => {
              // Optimistic, like a card move: a column that snaps back for a
              // round trip reads as a failed drag.
              setBoard((prev) => {
                if (!prev) return prev
                const from = prev.columns.findIndex((c) => c.id === columnId)
                if (from < 0) return prev
                const next = [...prev.columns]
                const [moved] = next.splice(from, 1)
                next.splice(index, 0, moved!)
                return { ...prev, columns: next }
              })
              await api.moveColumn(columnId, index)
              await load()
            }}
          />
        </div>
      </div>
      {cardId && (
        <CardDetail
          cardId={cardId}
          columnName={board.columns.find((c) => c.cards.some((k) => k.id === cardId))?.name}
          onClose={() => navigate(`/projects/${projectId}`)}
          onChanged={() => void load()}
        />
      )}
    </Screen>
  )
}

/** The optimistic local equivalent of the server's move: relocate, re-rank, re-sort. */
function applyMove(board: ProjectDetail, cardId: string, toColumnId: string, rank: string): ProjectDetail {
  const moved = board.columns.flatMap((c) => c.cards).find((c) => c.id === cardId)
  if (!moved) return board
  const next = { ...moved, columnId: toColumnId, rank }
  return {
    ...board,
    columns: board.columns.map((column) => {
      const without = column.cards.filter((c) => c.id !== cardId)
      if (column.id !== toColumnId) return { ...column, cards: without }
      return { ...column, cards: [...without, next].sort((a, b) => (a.rank < b.rank ? -1 : 1)) }
    }),
  }
}
