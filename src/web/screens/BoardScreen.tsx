import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Board } from '../../shared/types'
import { api } from '../lib/api'
import { Screen } from '../components/Screen'
import { KanbanBoard } from '../components/KanbanBoard'
import { CardDetail } from '../components/CardDetail'
import { ProjectHeader } from '../components/ProjectHeader'

export function BoardScreen({ projectId, cardId }: { projectId: string; cardId?: string }) {
  const navigate = useNavigate()
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setBoard(await api.getBoard(projectId))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

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
        <div className="mx-auto max-w-2xl px-6 py-12 text-sm">
          <p className="text-red-700">{error}</p>
          <Link to="/" className="mt-2 inline-block underline">
            Back to projects
          </Link>
        </div>
      </Screen>
    )
  }

  if (!board) {
    return (
      <Screen scroll="document">
        <p className="px-6 py-12 text-sm text-neutral-500">Loading…</p>
      </Screen>
    )
  }

  return (
    <Screen scroll="canvas">
      <div className="flex h-full flex-col">
        <ProjectHeader projectId={projectId} name={board.project.name} />
        <div className="min-h-0 flex-1">
          <KanbanBoard
            columns={board.columns}
            onMove={onMove}
            onAddCard={onAddCard}
            onToggleComplete={onToggleComplete}
            onOpenCard={(id) => navigate(`/projects/${projectId}/cards/${id}`)}
          />
        </div>
      </div>
      {cardId && (
        <CardDetail
          cardId={cardId}
          onClose={() => navigate(`/projects/${projectId}`)}
          onChanged={() => void load()}
        />
      )}
    </Screen>
  )
}

/** The optimistic local equivalent of the server's move: relocate, re-rank, re-sort. */
function applyMove(board: Board, cardId: string, toColumnId: string, rank: string): Board {
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
