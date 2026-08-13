import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProjectDetail } from '../../shared/types'
import { api } from '../lib/api'
import { Screen } from '../components/Screen'
import { KanbanBoard } from '../components/KanbanBoard'
import { CardDetail } from '../components/CardDetail'
import { ProjectHeader } from '../components/ProjectHeader'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { useLiveUpdates } from '../lib/useLiveUpdates'
import { useRecentChanges } from '../lib/useRecentChanges'

export function BoardScreen({ projectId, cardId }: { projectId: string; cardId?: string }) {
  const navigate = useNavigate()
  const [board, setBoard] = useState<ProjectDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const load = useCallback(async () => {
    try {
      setBoard(await api.getProject(projectId))
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
          <div className="min-h-0 flex-1">
            {/* Column-shaped, so the board does not jump when it lands. */}
            <div className="flex h-full gap-4 px-4 py-4 md:px-6 md:py-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  data-testid="column-skeleton"
                  className="h-full w-72 shrink-0 rounded-panel bg-sunken/80 p-2"
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

  return (
    <Screen scroll="canvas">
      <div className="flex h-full flex-col">
        <ProjectHeader
          projectId={projectId}
          name={board.project.name}
          description={board.project.description}
          onChanged={() => void load()}
        />
        {/*
          * A project with columns and no cards showed an empty board and said
          * nothing — on the main surface of the product, at the exact moment a
          * new user is deciding whether this is worth their time. The projects
          * and docs screens have taught the pitch since day one; this one, the
          * one you actually land on, did not.
          *
          * Left-aligned on the board's own gutter rather than centred: centred,
          * it floated free of the columns underneath and read as a different
          * page. It sits over the first column now.
          */}
        {cardCount === 0 && (
          <div className="w-full max-w-2xl px-4 pt-6 md:px-6">
            <EmptyState
              title="No cards yet."
              prompt={`Look at this repo and add cards to ${board.project.name} for what needs doing.`}
            >
              Your agent can fill this in. Paste this into Claude Code — or add a card yourself below.
            </EmptyState>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <KanbanBoard
            columns={board.columns}
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
