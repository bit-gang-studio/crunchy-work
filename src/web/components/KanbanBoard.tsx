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
   * Every card, including any the caller has filtered out of `columns`.
   *
   * A drop resolves its rank against real neighbours, not visible ones: landing
   * above the first *visible* card must not reuse a key a hidden card already
   * holds. The rank engine has taken this set since it was written; the
   * completed-cards filter is the first thing to actually pass it.
   */
  allColumns?: BoardColumnType[]
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
  allColumns,
  recentlyChanged,
}: KanbanBoardProps) {
  const { columns: dndColumns, activeCard, activeColumn, dndProps } = useKanbanDnd(
    columns,
    onMove,
    allColumns ?? columns,
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
      {/*
        * `items-start`: a column is as tall as what is in it.
        *
        * This was `items-stretch`, so every column ran the full height of the
        * board. That was a fix for a real problem — columns stopping at content
        * height left a ragged bottom edge over a field of flat grey, which read
        * as absence — but it was the wrong fix, and it only looked necessary
        * because the canvas was a flat neutral with nowhere for the eye to
        * rest. Full-height wells make an empty board look like three enormous
        * empty rectangles, and they lie about how much is in a column.
        *
        * The palette solved the problem the old fix was for: a near-black
        * canvas with a subtly lighter well no longer needs the well to reach
        * the floor to look deliberate. Trello has always done it this way.
        */}
      <div
        className="flex h-full snap-x select-none items-start gap-4 overflow-x-auto px-4 py-4 md:px-6 md:py-6"
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
        {/*
          * The lifted column is the column, at the same size.
          *
          * It used to show only the first four cards under a `max-h-72` cap and
          * a "+3 more" line, which was invisible while columns ran the full
          * height of the board and obvious the moment they stopped: measured,
          * the real column was 468px tall and the thing in your hand was 342.
          * Picking something up must not resize it.
          *
          * The metrics are copied from the real column deliberately — `w-72`,
          * `p-2`, the same header row, `space-y-2` cards, the same add-card row
          * — and it renders every card rather than a preview. A hand-copied set
          * of metrics drifts, so `geometry.spec.ts` asserts the two match.
          *
          * `h-7` on the header is that copying being exact: the real header's
          * height comes from its 24px `+` and `⋯` buttons plus 4px of padding,
          * not from its text, so a text-only copy came out four pixels short —
          * the sort of difference you feel as "it moved" without being able to
          * name what changed.
          *
          * The rotation stays. A lifted thing should look lifted, and it is the
          * one difference that is meant to be visible.
          */}
        {activeColumn && (
          <div className="flex max-h-full w-72 rotate-2 flex-col rounded-panel bg-sunken/95 p-2 shadow-overlay ring-1 ring-line-strong">
            <div className="mb-2 flex h-7 shrink-0 items-center gap-2 px-1">
              <span className="truncate text-sm font-semibold text-ink">{activeColumn.name}</span>
              <span className="shrink-0 text-xs text-ink-faint">{activeColumn.cards.length}</span>
            </div>
            <div className="min-h-0 shrink overflow-hidden">
              <div className={activeColumn.cards.length ? 'space-y-2 pb-3' : ''}>
                {activeColumn.cards.map((card) => (
                  <CardView key={card.id} card={card} />
                ))}
              </div>
              <p className="w-full rounded-card px-3 py-2 text-left text-sm text-ink-muted">
                + Add card
              </p>
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
      // `max-h-full`, not `h-full`: it grows with its cards and stops at the
      // board's height, at which point the body below scrolls. So a column is
      // always exactly as tall as its contents until it runs out of room —
      // which is also the size it takes in the drag overlay, so picking one up
      // no longer changes its shape.
      // Flat `bg-sunken`, not `bg-sunken/80`, and the opacity mattered for two
      // reasons that have nothing to do with how it looked.
      //
      // Tailwind v4 compiles an opacity modifier to `color-mix(in oklab, …)`,
      // and a transition between two `color-mix` values interpolates in oklab
      // while a transition between two plain colours interpolates in sRGB. The
      // theme cross-fade therefore ran the columns along a different curve from
      // the header above them — same start, same end, but up to **4.4
      // percentage points** ahead through the middle, which is visible as the
      // largest surface on screen sliding out of step with everything else.
      //
      // It also made the token lie: the ground actually painted here was sunken
      // blended 80% over canvas, so the palette's canvas→sunken step was never
      // the value the tokens said it was.
      className={`flex max-h-full w-72 shrink-0 snap-start flex-col rounded-panel bg-sunken p-2 ${
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
      {/* Not `flex-1` any more. That existed to make the well fill a
          full-height column; now the column is content-height, so the body
          takes its natural size and only starts scrolling once `max-h-full` on
          the column caps it. `min-h-0` still matters — without it a flex child
          refuses to shrink below its content and the scroll never engages. */}
      <div
        className="min-h-0 shrink overflow-y-auto"
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
          reserves the identical height so nothing jumps.

          `outline`, not `border`, and that is the whole point: the box is
          auto-height, so a 2px border added 4px to it and every card below the
          one you picked up slid down by 4px at the moment of pickup. An outline
          is painted without participating in layout, and a negative offset puts
          it where the border was drawing. Measured in geometry.spec.ts. */}
      {isDragging ? (
        <div
          className="rounded-card bg-hover outline-2 -outline-offset-2 outline-dashed outline-line-strong"
          aria-hidden
        >
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
      // The hover is the same one the project tiles use — border steps up to
      // `line-strong`, over a colour transition. A card is the most clickable
      // thing on the board and it was the only one of the three draggable
      // surfaces (tiles, docs, cards) answering the pointer with nothing but a
      // `cursor` change. `transition-colors`, not `transition-all`: the drag
      // overlay's rotate and shadow must land on the frame they are set, or the
      // card lags behind the cursor.
      // A done card recedes rather than just fading. `opacity-60` alone kept it
      // at full elevation — same border, same shadow — so a column of finished
      // work still read as a stack of live cards, just dimmer. Dropping it to
      // the sunken plane with no shadow makes it sit *into* the column, which
      // is what "handled" looks like; the strike-through on the title does the
      // rest. Still fully legible, and one click from coming back.
      className={`cursor-grab rounded-card border p-3 text-sm transition-colors active:cursor-grabbing ${
        dragging ? 'rotate-3 border-line-strong shadow-overlay' : 'border-line hover:border-line-strong'
      } ${
        card.completed ? 'bg-sunken opacity-70' : 'bg-surface shadow-card'
      } ${changed ? 'card-changed' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Always shown — in the drag preview there's no handler, so it renders display-only
            (visible but not clickable) rather than vanishing mid-drag. */}
        {/* Placed by hand: `items-start` puts both at the top of the row, so
            the tick has to be pushed down to the title's optical centre. Half
            the leading — (20 − 16)/2 = 2px — centres the *line box*, which sits
            higher than the letters and read low. Measured, the midpoint between
            the title's cap-height and x-height bands wants 3.25px; by eye that
            sat a shade high, and 2.75px is where it settled. */}
        <CompleteToggle
          completed={card.completed}
          onToggle={onToggleComplete ? () => void onToggleComplete(card.id, !card.completed) : undefined}
          className="mt-[2.75px]"
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
      {/*
        * One filled thing at most, and only when something is wrong.
        *
        * Every badge used to be a filled pill, so a card with a date, a size
        * and a checklist wore three of them at equal weight and they collected
        * more attention than the title — which is the only part you actually
        * read. They are plain text now; `Overdue` keeps its fill, because it is
        * the one state worth alarming about, and it is far louder for being the
        * only one left.
        */}
      {/*
        * A done card is one line.
        *
        * Hiding them outright was the other option and is worse: `completed` is
        * a per-card tick that is deliberately independent of the column, so a
        * card can be ticked in To Do — and hiding on tick would make it vanish
        * from a column it is still sitting in, with nothing to say where it
        * went. Collapsing gets nearly all of the quiet with none of the
        * disappearance: the metadata was context for work still to do, and
        * "L, due Aug 20, 1 of 3 criteria" is not information about something
        * finished.
        */}
      {!card.completed && (card.dueAt || card.size || card.acceptanceCriteria.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
          {card.dueAt && <DueBadge dueAt={card.dueAt} completed={card.completed} />}
          {card.size && <span className="font-medium">{card.size}</span>}
          {/* Only the tally on the face — the lines live in the card detail. */}
          {card.acceptanceCriteria.length > 0 && <CriteriaBadge criteria={card.acceptanceCriteria} />}
        </div>
      )}
    </div>
  )
}

/**
 * All criteria met reads as a quiet success; anything else is just a count.
 *
 * Kept as a number rather than becoming a miniature progress bar like the
 * project tiles. A tile has one bar and room to breathe; a card can carry three
 * pieces of metadata in a 288px column, and a 40px track next to a date and a
 * size is a graphic where a glyph would do. `2/3` is already the fraction the
 * bar would draw, in less space and with no ambiguity about which end is which.
 */
function CriteriaBadge({ criteria }: { criteria: { done: boolean }[] }) {
  const met = criteria.filter((c) => c.done).length
  const all = met === criteria.length
  return (
    <span
      title="Acceptance criteria"
      className={all ? 'font-medium text-success' : 'tabular-nums'}
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
  /*
   * "Due today" lost its amber fill for two reasons. It was competing with
   * overdue at nearly the same loudness, when the whole point is that overdue
   * is the exception — and amber is now the *accent*, so a warning pill in the
   * same family would have the product's identity colour meaning "careful".
   * Today reads as emphasis instead: the same text, at full ink.
   */
  return (
    <span
      title={dueAt}
      className={
        overdue
          ? 'rounded bg-danger-soft px-1.5 py-0.5 font-medium text-danger'
          : soon
            ? 'font-medium text-ink'
            : ''
      }
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
      /*
        * No fill. It carried the same `bg-sunken` as a real column well, at
        * nearly a column's width, so it read as an empty fourth column that
        * happened to have words in it — the eye had to parse it before learning
        * it was a button. Stripped to a plain control, it stops competing with
        * the things it sits beside, and the board is columns plus one
        * affordance rather than four columns of unequal realness.
        */
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex w-56 shrink-0 items-center gap-1.5 rounded-panel px-3 py-2.5 text-left text-sm text-ink-faint hover:bg-hover/60 hover:text-ink"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M8 3.5v9M3.5 8h9" />
        </svg>
        Add column
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="w-56 shrink-0 self-start">
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
      /*
        * A row with an icon, at `ink-muted` rather than `ink-faint`.
        *
        * It was bare text at the faintest ink in the palette, sitting under the
        * last card with nothing to mark it as a control — easy to read straight
        * past, which is a problem for the primary way of putting something on a
        * board. Deliberately *not* a dashed slot: the drag placeholder is a
        * dashed outline, and a permanent dashed row in the same column would be
        * the language of "a card is landing here" used for something else.
        */
      <button
        onClick={() => setAdding(true)}
        className="flex w-full items-center gap-1.5 rounded-card px-3 py-2 text-left text-sm text-ink-muted hover:bg-hover-strong/70 hover:text-ink"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M8 3.5v9M3.5 8h9" />
        </svg>
        Add card
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
