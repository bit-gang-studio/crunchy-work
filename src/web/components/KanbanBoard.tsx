import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BoardColumn as BoardColumnType, Card } from '../../shared/types'
import { useKanbanDnd } from '../lib/useKanbanDnd'
import { COLUMN_DRAG_PREFIX, COLUMN_PREFIX, noSort } from '../lib/boardDnd'
import { normalizeCardTitle } from '../lib/title'
import { ColumnHeader } from './ColumnHeader'
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
  /** Column management. Omitted where columns are fixed (the harness). */
  onAddColumn?: (name: string) => void | Promise<void>
  onRenameColumn?: (columnId: string, name: string) => void | Promise<void>
  onDeleteColumn?: (columnId: string) => void | Promise<void>
  onMoveColumn?: (columnId: string, index: number) => void | Promise<void>
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
  onAddColumn,
  onRenameColumn,
  onDeleteColumn,
  onMoveColumn,
}: KanbanBoardProps) {
  const { columns: dndColumns, activeCard, activeColumn, dndProps } = useKanbanDnd(
    columns,
    onMove,
    columns,
    onMoveColumn,
  )

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
        {/* Columns are their own sortable list, horizontal, using dnd-kit's stock
            strategy — the bespoke engine below exists for cards and their problems. */}
        <SortableContext
          items={dndColumns.map((c) => `${COLUMN_DRAG_PREFIX}${c.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          {dndColumns.map((column) => (
            <Column
              key={column.id}
              column={column}
              onAdd={onAddCard}
              onOpen={onOpenCard}
              onToggleComplete={onToggleComplete}
              onRename={onRenameColumn}
              onDelete={onDeleteColumn}
              sortable={!!onMoveColumn}
            />
          ))}
        </SortableContext>
        {onAddColumn && <AddColumn onAdd={onAddColumn} />}
      </div>
      {/* Trello lifts the whole list, not just a ghost of its header — the thing
          you picked up should be the thing you see moving. */}
      <DragOverlay>
        {activeCard && <CardView card={activeCard} dragging />}
        {activeColumn && (
          <div className="w-72 rotate-2 rounded-lg bg-neutral-50/95 p-2 shadow-2xl ring-1 ring-neutral-300">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="truncate text-sm font-semibold text-neutral-700">{activeColumn.name}</span>
              <span className="text-xs text-neutral-400">{activeColumn.cards.length}</span>
            </div>
            <div className="max-h-72 space-y-2 overflow-hidden">
              {activeColumn.cards.slice(0, 4).map((card) => (
                <CardView key={card.id} card={card} />
              ))}
              {activeColumn.cards.length > 4 && (
                <p className="px-1 pt-1 text-xs text-neutral-400">
                  +{activeColumn.cards.length - 4} more
                </p>
              )}
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  column,
  onAdd,
  onOpen,
  onToggleComplete,
  onRename,
  onDelete,
  sortable,
}: {
  column: BoardColumnType
  onAdd: (columnId: string, title: string, position?: 'top' | 'bottom') => void | Promise<void>
  onOpen: (cardId: string) => void
  onToggleComplete: (cardId: string, completed: boolean) => void | Promise<void>
  onRename?: (columnId: string, name: string) => void | Promise<void>
  onDelete?: (columnId: string) => void | Promise<void>
  sortable: boolean
}) {
  const { setNodeRef } = useDroppable({ id: `${COLUMN_PREFIX}${column.id}` })
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${COLUMN_DRAG_PREFIX}${column.id}`, disabled: !sortable })
  // The top composer, opened by the pinned "+" in the header. Separate from the bottom
  // AddCard's own state so both can be open at once and neither disturbs the other.
  const [addingTop, setAddingTop] = useState(false)
  // While a column is lifted into the overlay, its slot reads as a gap to drop
  // into rather than a faded duplicate of what is already in your hand.
  return (
    <section
      ref={setSortableRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex max-h-full w-72 shrink-0 snap-start flex-col ${isDragging ? 'opacity-25' : ''}`}
      data-testid="column"
      data-column={column.id}
    >
      <ColumnHeader
        column={column}
        onAddCard={() => setAddingTop(true)}
        onRename={(name) => onRename?.(column.id, name)}
        onDelete={() => onDelete?.(column.id)}
        dragHandle={sortable ? { listeners, attributes } : undefined}
      />
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
      className={`cursor-grab rounded-lg border bg-white p-3 text-sm active:cursor-grabbing ${
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
      {(card.dueAt || card.size || card.acceptanceCriteria.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {card.dueAt && <DueBadge dueAt={card.dueAt} completed={card.completed} />}
          {card.size && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600">
              {card.size}
            </span>
          )}
          {/* Only the tally on the face — the lines live in the card detail. */}
          {card.acceptanceCriteria.length > 0 && <CriteriaBadge criteria={card.acceptanceCriteria} />}
        </div>
      )}
    </div>
  )
}

/** All criteria met reads as a quiet success; anything else is just a count. */
function CriteriaBadge({ criteria }: { criteria: { done: boolean }[] }) {
  const met = criteria.filter((c) => c.done).length
  const all = met === criteria.length
  return (
    <span
      title="Acceptance criteria"
      className={`rounded px-1.5 py-0.5 ${all ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-600'}`}
    >
      ✓ {met}/{criteria.length}
    </span>
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

/** The trailing "add a column" affordance, styled to read as a slot rather than a column. */
function AddColumn({ onAdd }: { onAdd: (name: string) => void | Promise<void> }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await onAdd(trimmed)
    setName('')
    setAdding(false)
  }

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-0 w-56 shrink-0 rounded-lg border-2 border-dashed border-neutral-300 px-3 py-2 text-left text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
      >
        + Add column
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="w-56 shrink-0">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => !name.trim() && setAdding(false)}
        onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
        placeholder="Column name"
        aria-label="Column name"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />
      <div className="mt-1 flex gap-2">
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
          Add
        </button>
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="rounded-md px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-800"
        >
          Cancel
        </button>
      </div>
    </form>
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
