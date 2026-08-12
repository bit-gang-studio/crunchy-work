import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable } from '@dnd-kit/sortable'
import type { BoardColumn as BoardColumnType, Card } from '../../shared/types'
import { useKanbanDnd } from '../lib/useKanbanDnd'
import { COLUMN_PREFIX, noSort } from '../lib/boardDnd'
import { normalizeCardTitle } from '../lib/title'
import { CompleteToggle } from './CompleteToggle'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * The drag-and-drop Kanban surface, decoupled from data and routing so it's reusable
 * (the board screen and the test harness render the same thing) and testable in
 * isolation. All the drag logic lives in `useKanbanDnd`; this renders columns of cards
 * and reports a move as `(cardId, toColumnId, rank)`.
 */
interface KanbanBoardProps {
  columns: BoardColumnType[]
  onMove: (cardId: string, toColumnId: string, rank: string) => void | Promise<void>
  onOpenCard: (cardId: string) => void
  onAddCard: (columnId: string, title: string, position?: 'top' | 'bottom') => void | Promise<void>
  onToggleComplete: (cardId: string, completed: boolean) => void | Promise<void>
  /**
   * Reports whether a drag is in flight. The board screen uses it to hold live
   * updates: a refetch landing mid-drag would swap the columns the drop resolves
   * its rank against, and the card could land somewhere the user did not aim.
   */
  onDragStateChange?: (dragging: boolean) => void
}

/** Wrapped in an error boundary — a drag hiccup shows a recoverable panel instead of
 * white-screening the whole app. */
export function KanbanBoard(props: KanbanBoardProps) {
  return (
    <ErrorBoundary>
      <KanbanBoardInner {...props} />
    </ErrorBoundary>
  )
}

function KanbanBoardInner({
  columns,
  onMove,
  onOpenCard,
  onAddCard,
  onToggleComplete,
  onDragStateChange,
}: KanbanBoardProps) {
  const { columns: dndColumns, activeCard, dndProps } = useKanbanDnd(columns, onMove)

  const dragging = activeCard !== null
  const reported = useRef(dragging)
  useEffect(() => {
    if (reported.current !== dragging) {
      reported.current = dragging
      onDragStateChange?.(dragging)
    }
  }, [dragging, onDragStateChange])

  return (
    <DndContext {...dndProps}>
      {/* select-none: dragging cards shouldn't smear a text selection across the board. */}
      <div
        className="flex h-full snap-x select-none items-start gap-4 overflow-x-auto px-4 py-6 md:px-6"
        data-testid="kanban-board"
      >
        {dndColumns.map((column) => (
          <Column
            key={column.id}
            column={column}
            onAdd={onAddCard}
            onOpen={onOpenCard}
            onToggleComplete={onToggleComplete}
          />
        ))}
      </div>
      <DragOverlay>{activeCard ? <CardView card={activeCard} dragging /> : null}</DragOverlay>
    </DndContext>
  )
}

function Column({
  column,
  onAdd,
  onOpen,
  onToggleComplete,
}: {
  column: BoardColumnType
  onAdd: (columnId: string, title: string, position?: 'top' | 'bottom') => void | Promise<void>
  onOpen: (cardId: string) => void
  onToggleComplete: (cardId: string, completed: boolean) => void | Promise<void>
}) {
  const { setNodeRef } = useDroppable({ id: `${COLUMN_PREFIX}${column.id}` })
  // The top composer, opened by the pinned "+" in the header. Separate from the bottom
  // AddCard's own state so both can be open at once and neither disturbs the other.
  const [addingTop, setAddingTop] = useState(false)
  return (
    <section
      className="flex max-h-full w-72 shrink-0 snap-start flex-col"
      data-testid="column"
      data-column={column.id}
    >
      <div className="mb-2 flex shrink-0 items-center gap-2 px-1">
        <h2 className="text-sm font-semibold text-neutral-700">{column.name}</h2>
        <span className="text-xs text-neutral-400">{column.cards.length}</span>
        {/* Pinned in the header (never scrolls away), it drops the new card at the *top*.
            A distinct aria-label from the bottom "+ Add card" keeps the two affordances
            unambiguous for tests and screen readers. */}
        <button
          type="button"
          onClick={() => setAddingTop(true)}
          aria-label={`Add card to top of ${column.name}`}
          title="Add card to top"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-base leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          +
        </button>
      </div>
      {/* The column caps at the board height (max-h-full); this body scrolls when the cards
          outgrow it, and add-card flows right after the last card so short columns stay tight. */}
      <div className="min-h-0 overflow-y-auto">
        {addingTop && (
          <div className="mb-2">
            <CardComposer onAdd={(title) => onAdd(column.id, title, 'top')} onClose={() => setAddingTop(false)} />
          </div>
        )}
        {/* The droppable spans the cards **and** the add-card row, deliberately: the column
            droppable is what a drop lands on when no card is nearby (an empty column, or the
            tail below the last card), so it has to be big enough to hit. Including the
            always-present add-card row buys that target out of space the column already
            spends, so an empty column carries no dead canyon. Dropping "onto" the add-card
            button is fine: dnd-kit owns the pointer mid-drag, so it never clicks. */}
        <div ref={setNodeRef} data-testid="dropzone" data-dropzone={column.id}>
          <div className={column.cards.length ? 'space-y-2 pb-3' : ''}>
            <SortableContext items={column.cards.map((c) => c.id)} strategy={noSort}>
              {column.cards.map((card) => (
                <SortableCard key={card.id} card={card} onOpen={onOpen} onToggleComplete={onToggleComplete} />
              ))}
            </SortableContext>
          </div>
          <AddCard onAdd={(title) => onAdd(column.id, title)} />
        </div>
      </div>
    </section>
  )
}

function SortableCard({
  card,
  onOpen,
  onToggleComplete,
}: {
  card: Card
  onOpen: (cardId: string) => void
  onToggleComplete: (cardId: string, completed: boolean) => void | Promise<void>
}) {
  // The preview array is the source of truth for order, so the card must NOT slide from its
  // old index to the new one when the array reorders (that produced the "animate from the
  // end" glide) — it just snaps to its slot.
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: card.id,
    animateLayoutChanges: () => false,
  })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={() => onOpen(card.id)} data-testid="card" data-card={card.id}>
      {/* While dragging, the card floats in the DragOverlay — its slot here is a dashed
          placeholder showing exactly where it will drop. An invisible copy of the card
          reserves the identical height so nothing jumps. */}
      {isDragging ? (
        <div className="rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-100" aria-hidden>
          <div className="invisible">
            <CardView card={card} />
          </div>
        </div>
      ) : (
        <CardView card={card} onToggleComplete={onToggleComplete} />
      )}
    </div>
  )
}

function CardView({
  card,
  dragging = false,
  onToggleComplete,
}: {
  card: Card
  dragging?: boolean
  onToggleComplete?: (cardId: string, completed: boolean) => void | Promise<void>
}) {
  return (
    <div
      className={`cursor-grab rounded-lg border bg-white p-3 text-sm ${
        dragging ? 'rotate-3 border-neutral-300 shadow-xl' : 'border-neutral-200 shadow-sm'
      } ${card.completed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Always shown — in the drag preview there's no handler, so it renders display-only
            (visible but not clickable) rather than vanishing mid-drag. */}
        <CompleteToggle
          completed={card.completed}
          onToggle={onToggleComplete ? () => void onToggleComplete(card.id, !card.completed) : undefined}
          className="mt-0.5"
        />
        <p className={`flex-1 ${card.completed ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
          {card.title}
        </p>
      </div>
      {card.dueAt && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <DueBadge dueAt={card.dueAt} completed={card.completed} />
        </div>
      )}
    </div>
  )
}

/** Due dates read by urgency, not by exact date — overdue is the only state worth alarming about. */
function DueBadge({ dueAt, completed }: { dueAt: string; completed: boolean }) {
  const today = new Date().toISOString().slice(0, 10)
  const overdue = !completed && dueAt < today
  const soon = !completed && dueAt === today
  return (
    <span
      className={`rounded px-1.5 py-0.5 ${
        overdue
          ? 'bg-red-50 text-red-700'
          : soon
            ? 'bg-amber-50 text-amber-700'
            : 'bg-neutral-100 text-neutral-600'
      }`}
    >
      {overdue ? 'Overdue ' : ''}
      {dueAt}
    </span>
  )
}

/** The bottom add-card affordance: a full-width button that opens the shared composer. */
function AddCard({ onAdd }: { onAdd: (title: string) => void | Promise<void> }) {
  const [adding, setAdding] = useState(false)
  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100"
      >
        + Add card
      </button>
    )
  }
  return <CardComposer onAdd={onAdd} onClose={() => setAdding(false)} />
}

/** The card-title form, shared by the pinned top "+" and the bottom "+ Add card" so the two
 * entry points can never drift apart. Submitting adds the card and closes; blanking + blur
 * cancels. */
function CardComposer({ onAdd, onClose }: { onAdd: (title: string) => void | Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const clean = normalizeCardTitle(title)
    if (!clean) return
    await onAdd(clean)
    setTitle('')
    onClose()
  }

  return (
    <form onSubmit={submit}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title.trim() && onClose()}
        placeholder="Card title"
        className="w-full select-text rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />
      <div className="mt-1 flex gap-2">
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
          Add
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-800"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
