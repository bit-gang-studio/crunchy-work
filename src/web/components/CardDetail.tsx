import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { SIZES, type Card, type Size } from '../../shared/types'
import { api } from '../lib/api'
import { normalizeCardTitle } from '../lib/title'
import { useDebouncedSave } from '../lib/useDebouncedSave'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { CompleteToggle } from './CompleteToggle'
import { ConfirmButton } from './ConfirmButton'
import { AcceptanceCriteria } from './AcceptanceCriteria'
import { DateField } from './DateField'

/** Code-split for the same reason the doc page splits it — see the note below. */
const DocEditor = lazy(() => import('./DocEditor').then((m) => ({ default: m.DocEditor })))

/**
 * The card detail panel.
 *
 * It is a route, not a piece of component state (`/projects/:p/cards/:c`), so a
 * card is deep-linkable and the back button closes it — the same reason the
 * project is in the URL. Edits autosave; there is no Save button to forget.
 */
export function CardDetail({
  cardId,
  closing = false,
  columnId,
  columns = [],
  onMoveColumn,
  onClose,
  onChanged,
}: {
  cardId: string
  /**
   * True while the card is on its way out.
   *
   * The route has already cleared by then — `BoardScreen` keeps this mounted for
   * one duration so there is something to animate, because React cannot animate
   * what it has unmounted.
   */
  closing?: boolean
  /**
   * Which column it is in, and the ones it could be in.
   *
   * This was a `columnName` string, printed as "in To Do" — Trello's phrasing,
   * and the right fact to put there. But it was *only* a fact: the most
   * prominent row in the modal spent itself on something you could not act on,
   * and moving a card meant closing the modal and dragging. It is a picker now.
   */
  columnId?: string
  columns?: { id: string; name: string }[]
  onMoveColumn?: (columnId: string) => void
  onClose: () => void
  onChanged: () => void
}) {
  const [card, setCard] = useState<Card | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  /**
   * Edits accumulate into one patch rather than replacing each other. Typing a
   * title and then a description inside the debounce window must save both —
   * scheduling only the latest field would silently drop the earlier one.
   */
  const queued = useRef<Partial<Card>>({})
  const save = useDebouncedSave<Partial<Card>>(async (patch, options) => {
    queued.current = {}
    await api.updateCard(cardId, patch, { keepalive: options?.unloading })
    onChanged()
  })

  useEffect(() => {
    let live = true
    api
      .getCard(cardId)
      .then((c) => live && setCard(c))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [cardId])

  // Escape closes. Registered on the document so it works wherever focus is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /*
   * **`aria-modal` was a promise the Tab key did not keep.**
   *
   * The panel has said `role="dialog" aria-modal="true"` since it was built,
   * which tells assistive tech that everything behind it is inert. Nothing
   * enforced it: tabbing from an open card walked the app header, the project
   * menu, the Board/Docs tabs and then the columns *behind the scrim* — twelve
   * stops without once landing in the dialog. Reachable, operable, and
   * announced as unavailable.
   *
   * It was survivable while the panel held three controls. This pass took it to
   * fifteen, so it is now the difference between a card being usable from the
   * keyboard and not.
   *
   * Focus starts on the panel rather than on the title: opening a card should
   * not put a caret in its name, and `tabIndex={-1}` makes the panel a landing
   * spot without adding it to the tab order. From there the first Tab reaches
   * the column picker, which is the top of the dialog.
   */
  const panel = useRef<HTMLElement>(null)
  const returnFocusTo = useRef<Element | null>(null)

  useEffect(() => {
    returnFocusTo.current = document.activeElement
    panel.current?.focus({ preventScroll: true })
    return () => {
      // The card that opened this, unless it is the card that was just deleted.
      const back = returnFocusTo.current
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panel.current) return
      /*
       * Recomputed per keypress, not cached: the panel's controls change under
       * you — the criteria field appears and leaves, the ⋯ menu opens, and the
       * editor arrives a chunk-load after the rest of it.
       *
       * `[contenteditable]` earns its place in the list because ProseMirror's
       * editable div is focusable without a `tabindex`, so a selector built
       * from the usual suspects would decide the description was not there and
       * wrap the cycle one control early.
       */
      const stops = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0)
      const first = stops[0]
      const last = stops[stops.length - 1]
      if (!first || !last) return
      const here = document.activeElement

      if (!panel.current.contains(here)) {
        // Focus escaped entirely — pull it back rather than reasoning about where.
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && (here === first || here === panel.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && here === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function edit(patch: Partial<Card>) {
    setCard((c) => (c ? { ...c, ...patch } : c))
    queued.current = { ...queued.current, ...patch }
    save.schedule(queued.current)
  }

  /** Completion and the due date are single decisive actions — no reason to debounce them. */
  async function commit(patch: Partial<Card>) {
    setCard((c) => (c ? { ...c, ...patch } : c))
    await api.updateCard(cardId, patch)
    onChanged()
  }

  async function remove() {
    await api.deleteCard(cardId)
    onChanged()
    onClose()
  }

  return (
    /*
     * A centered modal over a dimmed board, which is what Trello does and what
     * Crunchy Team does — we invoke Trello by name, so arriving with Trello's
     * interaction model should be rewarded. It also gives descriptions a
     * comfortable reading measure, which a narrow side rail does not.
     *
     * Full-screen below `md`: on a phone a centered dialog is just a worse
     * full-screen one.
     */
    <div
      className={`fixed inset-0 z-20 flex items-stretch justify-center bg-scrim md:items-start md:p-8 md:pt-16 ${
        closing ? 'modal-scrim-out pointer-events-none' : 'modal-scrim-in'
      }`}
      onClick={onClose}
      role="presentation"
    >
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Card detail"
        data-testid="card-detail"
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full flex-col overflow-y-auto bg-surface shadow-overlay focus:outline-none md:h-auto md:max-h-full md:w-[36rem] md:rounded-panel ${
          closing ? 'md:modal-panel-out' : 'md:modal-panel-in'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 md:px-6">
          {columns.length && columnId ? (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
              in
              {/*
                * **A chip we draw, over a select that still picks.**
                *
                * `appearance-none` was already here so the control would not
                * wear the operating system's arrow — but width is the other
                * half of that, and a native `<select>` takes its width from its
                * *widest option*, not its current one. So this chip was 172px
                * wide to show 61px of text, with our chevron marooned 87px from
                * the word, because somewhere in the project there was a column
                * called "Another Another Another". The header control's size
                * was set by a column the card is not even in, and would change
                * again the next time one was renamed.
                *
                * So the visible chip is a span sized by the name it is showing,
                * and the select lies over it at `opacity-0` doing the actual
                * picking — the same division `DateField` makes, for the same
                * reason. `pointer-events-none` on the chip lets the click
                * through to the select underneath, and the select comes first
                * so `peer-*` can reach the chip: `opacity-0` hides a focus ring
                * as surely as `sr-only` clips one.
                */}
              <span className="relative inline-flex min-w-0">
                <select
                  value={columnId}
                  onChange={(e) => onMoveColumn?.(e.target.value)}
                  aria-label="Column"
                  className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
                >
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none flex h-7 max-w-[12rem] items-center gap-1 rounded-control border border-transparent pl-1.5 pr-1 text-xs font-medium text-ink transition-colors peer-hover:border-line peer-hover:bg-hover peer-focus-visible:border-ink-muted peer-focus-visible:ring-2 peer-focus-visible:ring-ink-muted"
                >
                  <span className="truncate">
                    {columns.find((column) => column.id === columnId)?.name}
                  </span>
                  <svg
                    viewBox="0 0 12 12"
                    className="h-3 w-3 shrink-0 text-ink-faint"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M3 4.75 6 7.75l3-3" />
                  </svg>
                </span>
              </span>
            </span>
          ) : (
            <span className="text-xs text-ink-muted">Card</span>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {/*
              * Delete lives behind the ⋯, not in the panel.
              *
              * It was a permanently visible red link at the foot of the modal,
              * which made the bottom of every card read as a warning — and it is
              * the one action here you would rather not reach by accident. Every
              * comparable tool puts it in an overflow menu, and this app already
              * has one on the project header doing exactly this job.
              */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Card actions"
                aria-expanded={menuOpen}
                className="flex h-7 w-7 items-center justify-center rounded-control text-ink-faint hover:bg-hover hover:text-ink"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <circle cx="3.5" cy="8" r="1.3" />
                  <circle cx="8" cy="8" r="1.3" />
                  <circle cx="12.5" cy="8" r="1.3" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-card border border-line bg-surface p-1 shadow-raised">
                  <ConfirmButton onConfirm={remove}>Delete card</ConfirmButton>
                </div>
              )}
            </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-control text-ink-faint hover:bg-hover hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
          </div>
        </div>

        {error && <p className="p-4 text-sm text-danger">{error}</p>}
        {!card && !error && <p className="p-4 text-sm text-ink-muted">Loading…</p>}

        {card && (
          /*
           * **Not one uniform gap.** Every block used to sit `gap-5` from its
           * neighbour — title, meta, checklist, description, delete: five
           * things at five identical distances. Nothing grouped, so the panel
           * read as a form rather than as a card with a title and some detail
           * hanging off it. Same failure the project header had, and the same
           * fix: related things closer together than the group is to the next
           * group.
           *
           * Identity — the tick, the title, when it is due, how big it is — is
           * one block. What the card *says* is another. Delete is neither, and
           * keeps its rule.
           *
           * **Less padding at the top than on the other three sides**, because
           * the top one does not act alone: the header already ends in 12px of
           * its own padding, and 24 on top of that put ~33px between the rule
           * and the title's cap — more space above the title than between the
           * title and its own due date, so the first thing you read floated.
           * The other three sides have nothing above them to add to and keep
           * the full 24. Phone width keeps 16 all round; the header there is
           * shorter and the sum was never the problem.
           */
          <div className="flex flex-1 flex-col p-4 md:p-6 md:pt-4">
            {/*
              * `gap-1`, not `gap-3`, because the title is not flush with its
              * own box: the textarea carries `px-2` so its hover and focus
              * border does not hug the letters. That padding is invisible until
              * you measure the space *between the tick and the first letter*,
              * which was 12px of gap plus 8px of padding — twice what it looked
              * like it should be.
              */}
            <div className="flex items-start gap-1">
              {/* `mt-[12px]`. Two things stack here: the title is a textarea
                  with 4px of its own padding, and the target is the 18px
                  title's optical centre rather than its line box. Half the
                  leading — (28 − 16)/2 = 6px — was the whole calculation
                  before, and left the tick well high of the words. */}
              <CompleteToggle
                completed={card.completed}
                onToggle={() => void commit({ completed: !card.completed })}
                className="mt-[12px]"
              />
              <AutoGrowTextarea
                value={card.title}
                onChange={(e) => edit({ title: e.target.value })}
                // Titles are semantically single-line: normalise a paste rather than
                // storing embedded newlines the board would render differently.
                onBlur={(e) => {
                  const clean = normalizeCardTitle(e.target.value)
                  if (clean && clean !== card.title) edit({ title: clean })
                }}
                aria-label="Card title"
                minRows={1}
                maxRows={4}
                className="flex-1 rounded-control border border-transparent px-2 py-1 text-lg font-medium hover:border-line focus:border-ink-faint focus:outline-none"
              />
            </div>

            {/*
              * Due date and size belong to the title, so they sit close under
              * it and lose their captions. "Due date" over a control with a
              * calendar in it, and "Size" over a menu offering XS to XL, were
              * labels for things that already say what they are — and four
              * grey labels were most of what an empty card had on screen.
              *
              * Left-aligned with everything else rather than indented under
              * the title. Indenting it made the modal two columns deep for one
              * row's benefit, and put the first control out of line with the
              * criteria and the description below it.
              */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="group/date">
                <DateField
                  value={card.dueAt}
                  onChange={(next) => void commit({ dueAt: next })}
                  label="Due date"
                />
              </span>

              {/*
                * `appearance-none` and our own chevron. A native select draws
                * the operating system's arrow at the operating system's size,
                * which sat next to a date field wearing a different one — two
                * controls on the same row, neither of them ours. The chevron
                * is the same mark the project switcher uses.
                */}
              <span className="relative inline-flex">
                <select
                  value={card.size ?? ''}
                  onChange={(e) => void commit({ size: (e.target.value || null) as Size | null })}
                  aria-label="Size"
                  className={`h-8 appearance-none rounded-control border border-line bg-surface pl-2 pr-7 text-sm transition-colors hover:border-line-strong focus:border-ink-muted focus:outline-none ${
                    card.size ? 'text-ink' : 'text-ink-faint'
                  }`}
                >
                  {/* Unsized is the normal state, so it leads. */}
                  <option value="">Size</option>
                  {SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <svg
                  viewBox="0 0 12 12"
                  className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M3 4.75 6 7.75l3-3" />
                </svg>
              </span>
            </div>

            {/*
              * The same editor the docs use, and for the same reason: a
              * description is stored as markdown, so a `## heading` an agent
              * writes over MCP and a heading typed here have to be one thing.
              * It was a bare textarea that stored markdown and rendered none of
              * it — `## Why` sat on screen as two hashes and a word.
              *
              * Still code-split. The chunk is heavier than the whole app, and
              * the reason it is lazy on a doc page holds here too; it just
              * costs a card open rather than a doc open now. The fallback is
              * the same height as the editor, so the modal does not jump when
              * the chunk lands.
              *
              * Not `flex-1`: it was, which had the field claiming all the
              * leftover height of a full-screen phone sheet and then not using
              * it. The footer's `mt-auto` collects that slack instead, which is
              * the right place for it — separation before a destructive action.
              */}
            <div className="mt-5">
              <Suspense
                fallback={
                  <div className="min-h-[6.5rem] px-2 py-2 text-sm text-ink-faint">Loading editor…</div>
                }
              >
                <DocEditor
                  docId={card.id}
                  initialMarkdown={card.description}
                  onChange={(markdown) => edit({ description: markdown })}
                  placeholder="Add more detail. Markdown works, or press / for blocks."
                  bodyClassName="prose-card min-h-[4.5rem] px-3 py-2"
                  ariaLabel="Card description"
                  testId="card-description"
                  toolbar
                  /*
                   * **The border is always there.**
                   *
                   * It was transparent until hover, on the theory that a quiet
                   * resting state would let the description read as the card's
                   * text rather than as a form field. It did not read that way:
                   * an editable region with no edge until you point at it looks
                   * unfinished, and the toolbar sitting above nothing made it
                   * worse. A field that you type into should look like one.
                   *
                   * The weight still moves — `line` at rest, `line-strong` on
                   * hover, `ink-muted` on focus — so the box says which of the
                   * three states it is in without ever disappearing.
                   */
                  className="group/editor rounded-control border border-line transition-colors focus-within:border-ink-muted hover:border-line-strong"
                />
              </Suspense>
            </div>

            {/*
              * Below the description, not above it.
              *
              * The order the panel is read in should be the order the card is
              * written in: what it is, then what it says, then what finished
              * looks like. Criteria came second and pushed the description down
              * the panel — so the field you are most likely to have arrived to
              * write was under a checklist you cannot fill in until you have
              * written it.
              */}
            <div className="mt-3">
              <AcceptanceCriteria
                criteria={card.acceptanceCriteria}
                onChange={(next) => void commit({ acceptanceCriteria: next })}
              />
            </div>

          </div>
        )}
      </aside>
    </div>
  )
}
