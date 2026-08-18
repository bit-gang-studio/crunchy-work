import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ProjectDetail } from '../../shared/types'
import { api } from '../lib/api'
import { KanbanBoard } from '../components/KanbanBoard'
import { CardDetail } from '../components/CardDetail'
import { Loading } from '../components/States'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { withoutCompleted } from '../lib/completedFilter'
import { useProject } from './ProjectLayout'

/**
 * The board, and nothing else.
 *
 * The project read, the live-update subscription, the header and the completed
 * filter all used to live here and are now `ProjectLayout`'s — see the note
 * there. What is left is the one thing only this screen does.
 */
/** Matches the modal animations in index.css. The two have to agree. */
const MODAL_MS = 250

export function BoardScreen() {
  const navigate = useNavigate()
  const { projectId, cardId } = useParams() as { projectId: string; cardId?: string }
  const {
    board,
    reload: load,
    recentlyChanged,
    markLocalChange,
    showCompleted,
    setDragging,
    patchBoard,
  } = useProject()
  useDocumentTitle(board?.project.name)

  /*
   * The card id, held for one animation after the route clears.
   *
   * Closing a card removes it from the URL, which unmounts the modal in the same
   * frame — so there was nothing left to fade and the panel simply blinked out.
   * `held` keeps the last id alive for `MODAL_MS`, and `closing` tells the modal
   * it is leaving. Same shape as the completed filter's exit, and for the same
   * reason.
   */
  const [held, setHeld] = useState(cardId)
  const closing = !cardId && held !== undefined
  useEffect(() => {
    if (cardId) {
      setHeld(cardId)
      return
    }
    const timer = setTimeout(() => setHeld(undefined), MODAL_MS)
    return () => clearTimeout(timer)
  }, [cardId])

  /**
   * Moves are applied optimistically: the drag engine already resolved the exact
   * rank for the slot the user saw, so the board can show the result immediately
   * and reconcile with the server afterwards. Without this the card would visibly
   * snap back to its old position for the length of a round trip.
   */
  async function onMove(cardId: string, toColumnId: string, rank: string) {
    patchBoard((prev) => applyMove(prev, cardId, toColumnId, rank))
    try {
      await api.moveCard(cardId, { columnId: toColumnId, rank })
    } finally {
      await load()
    }
  }

  async function onAddCard(columnId: string, title: string, position?: 'top' | 'bottom') {
    const card = await api.addCard(columnId, { title })
    /*
     * A card you just typed is not news.
     *
     * The pulse means "this changed while you were not looking", and adding a
     * card fires it on the one card on the board you are certainly looking at —
     * you are still holding the composer open above it. Same bug the tick had,
     * arriving through the same door: the diff is derived from two reads, so a
     * local write and an agent's write are indistinguishable unless the local
     * one says so.
     *
     * It can only be marked *after* the request, because the id is the server's
     * to assign — unlike the tick, which marks before it writes. The window
     * that opens is the 80ms the file watcher coalesces on (`watchForChanges`):
     * a nudge landing between the insert and this line would refetch and
     * diff the card as remote. The response is back in single-digit
     * milliseconds, so that is a race the fix loses only if the server has
     * already lost a much bigger one.
     */
    markLocalChange(card.id)
    if (position === 'top') await api.moveCard(card.id, { index: 0 })
    await load()
  }

  async function onToggleComplete(cardId: string, completed: boolean) {
    // Before the optimistic update, or the diff it causes marks the card as a
    // change you did not make. You just clicked it.
    markLocalChange(cardId)
    patchBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => ({
        ...c,
        cards: c.cards.map((k) => (k.id === cardId ? { ...k, completed } : k)),
      })),
    }))
    await api.updateCard(cardId, { completed })
    await load()
  }

  if (!board) {
    /*
     * Column-shaped, so the board does not jump when it lands.
     *
     * The header is the layout's now and is already on screen, which is what
     * this used to be careful about: the skeleton once rendered without one, so
     * the whole board dropped by the header's height the instant data arrived —
     * a few pixels of care nested inside a hundred-pixel jump. It cannot happen
     * any more, because the header is not this screen's to omit.
     */
    return (
      <div className="absolute inset-0">
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
    )
  }

  /*
   * The board renders the filtered set and resolves ranks against the whole
   * one. Dropping above the first *visible* card must not reuse a key a hidden
   * card already holds — `useKanbanDnd` has taken both sets since it was
   * written, and this is the first caller to actually give it two.
   */
  const { columns: visibleColumns } = showCompleted
    ? { columns: board.columns }
    : withoutCompleted(board.columns)

  return (
    <>
      <div className="absolute inset-0 flex flex-col">
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

        <div className="min-h-0 flex-1">
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
              patchBoard((prev) => {
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
      {held && (
        <CardDetail
          cardId={held}
          closing={closing}
          columnId={board.columns.find((c) => c.cards.some((k) => k.id === held))?.id}
          columns={board.columns.map((c) => ({ id: c.id, name: c.name }))}
          onMoveColumn={(columnId) => void api.moveCard(held, { columnId }).then(load)}
          onClose={() => navigate(`/projects/${projectId}`)}
          onChanged={() => void load()}
        />
      )}
    </>
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
