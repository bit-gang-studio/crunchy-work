import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ColumnWithCards as BoardColumnType, Card } from '../../shared/types'
import { formatDueDate, todayISO } from '../../shared/time'
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
  /**
   * Cards that changed a moment ago, which mark themselves briefly. This is what
   * makes "watch your agent work" visible: without it a card arriving in a
   * column you are not looking at is a silent redraw.
   */
  recentlyChanged?: ReadonlySet<string>
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
  recentlyChanged,
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
      {/* `tabIndex` for the same reason the column bodies have one: the board
          scrolls horizontally, and a scrollable region that cannot be focused
          is content a keyboard user can see and cannot reach. */}
      <div
        className="flex h-full snap-x select-none items-start gap-4 overflow-x-auto px-4 py-6 md:px-6"
        data-testid="kanban-board"
        tabIndex={0}
        role="group"
        aria-label="Board columns"
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
              recentlyChanged={recentlyChanged}
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
          <div className="w-72 rotate-2 rounded-panel bg-sunken/95 p-2 shadow-overlay ring-1 ring-line-strong">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="truncate text-sm font-semibold text-ink">{activeColumn.name}</span>
              <span className="text-xs text-ink-faint">{activeColumn.cards.length}</span>
            </div>
            <div className="max-h-72 space-y-2 overflow-hidden">
              {activeColumn.cards.slice(0, 4).map((card) => (
                <CardView key={card.id} card={card} />
              ))}
              {activeColumn.cards.length > 4 && (
                <p className="px-1 pt-1 text-xs text-ink-faint">
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
  recentlyChanged,
}: {
  column: BoardColumnType
  onAdd: (columnId: string, title: string, position?: 'top' | 'bottom') => void | Promise<void>
  onOpen: (cardId: string) => void
  onToggleComplete: (cardId: string, completed: boolean) => void | Promise<void>
  onRename?: (columnId: string, name: string) => void | Promise<void>
  onDelete?: (columnId: string) => void | Promise<void>
  sortable: boolean
  recentlyChanged?: ReadonlySet<string>
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
  //
  // The tinted panel is Trello's, and it earns its keep: without it the cards
  // float on the page background and a column is only implied by alignment —
  // which falls apart exactly where it matters, in a column whose cards are
  // faded because they are done, or one that is empty.
  return (
    <section
      ref={setSortableRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex max-h-full w-72 shrink-0 snap-start flex-col rounded-panel bg-sunken/80 p-2 ${
        isDragging ? 'opacity-25' : ''
      }`}
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
          outgrow it, and add-card flows right after the last card so short columns stay tight.

          `tabIndex` because a scrollable region has to be reachable by keyboard —
          otherwise a column taller than the board is content you can see and
          cannot get to without a mouse. The name says which column it scrolls. */}
      <div
        className="min-h-0 overflow-y-auto"
        tabIndex={0}
        role="group"
        aria-label={`${column.name} cards`}
      >
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
                <SortableCard
                  key={card.id}
                  card={card}
                  onOpen={onOpen}
                  onToggleComplete={onToggleComplete}
                  changed={!!recentlyChanged?.has(card.id)}
                />
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
  changed = false,
}: {
  card: Card
  onOpen: (cardId: string) => void
  onToggleComplete: (cardId: string, completed: boolean) => void | Promise<void>
  changed?: boolean
}) {
  // The preview array is the source of truth for order, so the card must NOT slide from its
  // old index to the new one when the array reorders (that produced the "animate from the
  // end" glide) — it just snaps to its slot.
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: card.id,
    animateLayoutChanges: () => false,
  })
  /*
   * The ARIA `attributes` go on the title button inside, not on this wrapper.
   *
   * dnd-kit's attributes are `role="button"` + `tabindex` + roledescription.
   * On this container that makes an interactive element wrapping the complete
   * toggle, which is itself a button — invalid nested interactives, and a
   * screen reader reads the whole card as one control. Exactly the bug the
   * column header had. The pointer `listeners` stay here so the whole card is
   * still the drag target.
   */
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      // The whole card opens it, the way Trello's does — the title button below
      // is the *keyboard* path, not the only one. This div deliberately carries
      // no role, so the toggle inside it is not a nested interactive.
      onClick={() => onOpen(card.id)}
      data-testid="card"
      data-card={card.id}
    >
      {/* While dragging, the card floats in the DragOverlay — its slot here is a dashed
          placeholder showing exactly where it will drop. An invisible copy of the card
          reserves the identical height so nothing jumps. */}
      {isDragging ? (
        <div className="rounded-card border-2 border-dashed border-line-strong bg-hover" aria-hidden>
          <div className="invisible">
            <CardView card={card} />
          </div>
        </div>
      ) : (
        <CardView
          card={card}
          onToggleComplete={onToggleComplete}
          changed={changed}
          onOpen={() => onOpen(card.id)}
          dragAttributes={attributes}
        />
      )}
    </div>
  )
}

function CardView({
  card,
  dragging = false,
  changed = false,
  onToggleComplete,
  onOpen,
  dragAttributes,
}: {
  card: Card
  dragging?: boolean
  /** Arrived or was ticked off a moment ago — marks itself, then settles. */
  changed?: boolean
  onToggleComplete?: (cardId: string, completed: boolean) => void | Promise<void>
  /** Absent in the drag overlay and the placeholder, which are display-only. */
  onOpen?: () => void
  /** dnd-kit's ARIA, which belongs on a real focusable control — see SortableCard. */
  dragAttributes?: React.HTMLAttributes<HTMLElement>
}) {
  return (
    <div
      data-changed={changed || undefined}
      className={`cursor-grab rounded-card border bg-surface p-3 text-sm active:cursor-grabbing ${
        dragging ? 'rotate-3 border-line-strong shadow-overlay' : 'border-line shadow-card'
      } ${card.completed ? 'opacity-60' : ''} ${changed ? 'card-changed' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Always shown — in the drag preview there's no handler, so it renders display-only
            (visible but not clickable) rather than vanishing mid-drag. */}
        <CompleteToggle
          completed={card.completed}
          onToggle={onToggleComplete ? () => void onToggleComplete(card.id, !card.completed) : undefined}
          className="mt-0.5"
        />
        {/*
          * The title is the card's one real control: it opens the card, it is
          * what a keyboard lands on, and it carries the sortable ARIA. The
          * wrapper stays a plain div so the toggle beside it is not nested
          * inside another interactive element.
          */}
        {onOpen ? (
          <button
            type="button"
            {...dragAttributes}
            // Stop propagation or the wrapper's handler fires too and the card
            // opens twice.
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
            className={`flex-1 cursor-grab text-left active:cursor-grabbing ${
              card.completed ? 'text-ink-faint line-through' : 'text-ink'
            }`}
          >
            {card.title}
          </button>
        ) : (
          <p className={`flex-1 ${card.completed ? 'text-ink-faint line-through' : 'text-ink'}`}>
            {card.title}
          </p>
        )}
      </div>
      {(card.dueAt || card.size || card.acceptanceCriteria.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {card.dueAt && <DueBadge dueAt={card.dueAt} completed={card.completed} />}
          {card.size && (
            <span className="rounded bg-hover px-1.5 py-0.5 font-medium text-ink-muted">
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
      className={`rounded px-1.5 py-0.5 ${all ? 'bg-success-soft text-success' : 'bg-hover text-ink-muted'}`}
    >
      ✓ {met}/{criteria.length}
    </span>
  )
}

/** Due dates read by urgency, not by exact date — overdue is the only state worth alarming about. */
function DueBadge({ dueAt, completed }: { dueAt: string; completed: boolean }) {
  // `todayISO` is the viewer's local day, not UTC: a card due today should stop
  // reading "Overdue" at their midnight, not at Greenwich's.
  const today = todayISO()
  const overdue = !completed && dueAt < today
  const soon = !completed && dueAt === today
  return (
    <span
      title={dueAt}
      className={`rounded px-1.5 py-0.5 ${
        overdue
          ? 'bg-danger-soft text-danger'
          : soon
            ? 'bg-warning-soft text-warning'
            : 'bg-hover text-ink-muted'
      }`}
    >
      {overdue ? 'Overdue · ' : ''}
      {formatDueDate(dueAt)}
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
        className="mt-0 w-56 shrink-0 rounded-panel bg-sunken/80 px-3 py-2.5 text-left text-sm text-ink-muted hover:bg-hover-strong/80 hover:text-ink"
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
        className="w-full rounded-card border border-line-strong px-3 py-2 text-sm focus:border-ink-muted focus:outline-none"
      />
      <div className="mt-1 flex gap-2">
        <button type="submit" className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink">
          Add
        </button>
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="rounded-control px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
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
        className="w-full rounded-card px-3 py-2 text-left text-sm text-ink-muted hover:bg-hover-strong/70 hover:text-ink"
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
        className="w-full select-text rounded-card border border-line-strong px-3 py-2 text-sm focus:border-ink-muted focus:outline-none"
      />
      <div className="mt-1 flex gap-2">
        <button type="submit" className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink">
          Add
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-control px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
